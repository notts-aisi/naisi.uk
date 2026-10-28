import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { compareGroupsByMeeting } from "@/lib/firestore/courseGroups";
import { storedReadFor } from "../assessment/stored";
import { own } from "../keys";
import type { Refusal } from "../review/types";
import type { Lean } from "../assessment/types";
import { adviceInputFrom, applyAdvice, type Advice, type ReadNote } from "./advice";
import { loadArranging } from "./load";
import type { SessionSlot } from "@/lib/admissions/availability";

/**
 * AN ARRANGEMENT OF A PROGRAMME'S PEOPLE INTO GROUPS, for an admin: the plan
 * (`./plan.ts`), then, when Claude is set up and the admin asks, Claude's
 * facilitators and moves, kept only where the plan's rules allow
 * (`./advice.ts`). Nothing is written and nothing is stored: the admin reads
 * it, and Apply places people through the site's own routes.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), arrange the people who hold places on one of its programmes into weekly discussion groups.

You are given a first arrangement, worked out from when each person said they are free. People are numbered ("Applicant 3") and groups numbered ("Group 2"). For each person you are told whether they would like to facilitate, which other groups they can make, and your earlier read of their application where there is one. An admin reads your suggestions and decides; nothing you write is sent to anybody.

What to do:
- Suggest one facilitator for each group, only from people in that group or who can make it and would like to facilitate. Prefer someone the reads suggest would lead a discussion well. Leave the applicant empty for a group with nobody suitable.
- Suggest moves that make the groups work better: a mix of backgrounds and experience in each, no group of only beginners or only experts, sizes kept close. Only move someone to a group they can make, and never someone already told their group.
- Do not use or guess at personal characteristics such as age, gender, nationality or health.
- Keep it short, and refer to people and groups only by their labels.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facilitators", "moves", "notes"],
  properties: {
    facilitators: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["group", "applicant", "why"],
        properties: {
          group: { type: "string", description: 'The group label: "Group 2".' },
          applicant: { type: "string", description: 'The person\'s label, or "" for nobody suitable.' },
          why: { type: "string", description: "One sentence." },
        },
      },
    },
    moves: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["applicant", "to", "why"],
        properties: {
          applicant: { type: "string" },
          to: { type: "string", description: 'The group label: "Group 1".' },
          why: { type: "string", description: "One sentence." },
        },
      },
    },
    notes: { type: "string", description: "Two or three sentences on the arrangement as a whole." },
  },
};

function adviceFrom(value: unknown): Advice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const items = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []) as Record<string, unknown>[];
  return {
    facilitators: items(raw.facilitators).map((x) => ({ group: text(x.group), applicant: text(x.applicant), why: text(x.why) })),
    moves: items(raw.moves).map((x) => ({ applicant: text(x.applicant), to: text(x.to), why: text(x.why) })),
    notes: text(raw.notes),
  };
}

export type ArrangedGroup = {
  /** The run's group, or null for one Apply would add. */
  id: string | null;
  name: string;
  session: SessionSlot;
  timeIsNew: boolean;
  room: number;
  members: { uid: string; name: string; facilitates: boolean; moved: boolean }[];
  facilitator: { uid: string; name: string; why: string } | null;
  /** For a group the run has: its facilitators now, and its stored slot (for a change of time). */
  existing: { facilitatorUids: string[]; slot: { weekday: number; start: string } } | null;
};

export type ArrangementView = {
  runId: string;
  minutes: number;
  size: number;
  groups: ArrangedGroup[];
  unplaced: { uid: string; name: string; reason: "no-week" | "fits-none" | "no-room" }[];
  /** Null when Claude was not asked. */
  claude: { notes: string; dropped: { suggestion: string; why: string }[] } | null;
  claudeConfigured: boolean;
};

export type ArrangementResult = { ok: true; arrangement: ArrangementView } | Refusal;

async function readsFor(db: Firestore, roundId: string, programmeId: string, uids: readonly string[]) {
  const reads = new Map<string, ReadNote>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(roundId, uid)));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) {
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
      const uid = typeof data?.uid === "string" ? data.uid : "";
      const read = data ? storedReadFor(data, programmeId) : null;
      if (uid && read && typeof read.summary === "string") reads.set(uid, { lean: read.lean as Lean, summary: read.summary });
    }
  }
  return reads;
}

export async function arrangeProgramme(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  wanted: { minutes?: unknown; size?: unknown; askClaude: boolean },
): Promise<ArrangementResult> {
  const loaded = await loadArranging(db, user, roundId, programmeId, wanted);
  if (!loaded.ok) return loaded;
  const { arranging } = loaded;
  let plan = arranging.plan;
  let facilitators = new Map<number, { uid: string; why: string }>();
  let movedUids = new Set<string>();
  let claude: ArrangementView["claude"] = null;

  if (wanted.askClaude && claudeConfigured() && plan.groups.length > 0) {
    const reads = await readsFor(db, roundId, programmeId, [...arranging.people.keys()]);
    const input = adviceInputFrom({
      programmeName: arranging.programmeName,
      size: arranging.size,
      plan,
      people: arranging.people,
      reads,
    });
    const answer = await askClaudeForJson({
      system: SYSTEM,
      message: input.message,
      schema: SCHEMA,
      effort: "medium",
      maxTokens: 12_000,
      timeoutMs: 240_000,
    });
    if (!answer.ok) return { ok: false, status: 500, error: answer.reason };
    const advice = adviceFrom(answer.value);
    if (!advice) return { ok: false, status: 500, error: "Claude’s answer couldn’t be read. Try again." };
    const applied = applyAdvice(plan, arranging.people, input, advice);
    plan = applied.plan;
    facilitators = applied.facilitators;
    movedUids = new Set(applied.moves.map((m) => m.uid));
    const nameOfLabel = (text: string) =>
      text
        .replace(/\bApplicant (\d+)\b/g, (w) => arranging.people.get(own(input.applicants, w) ?? "")?.name ?? w)
        .replace(/\bGroup (\d+)\b/g, (w) => {
          const index = own(input.groups, w);
          return index === undefined ? w : (plan.groups.at(index)?.name ?? w);
        });
    claude = {
      notes: nameOfLabel(advice.notes),
      dropped: applied.dropped.map((d) => ({ suggestion: nameOfLabel(d.suggestion), why: nameOfLabel(d.why) })),
    };
    for (const [index, chosen] of facilitators) facilitators.set(index, { ...chosen, why: nameOfLabel(chosen.why) });
  }

  const nameOf = (uid: string) => arranging.people.get(uid)?.name ?? uid;
  return {
    ok: true,
    arrangement: {
      runId: arranging.runId,
      minutes: arranging.minutes,
      size: arranging.size,
      // Listed in the order every tab of a programme's page lists its groups.
      groups: plan.groups
        .map((group, index) => ({ group, index }))
        .sort((a, b) => compareGroupsByMeeting(a.group, b.group))
        .map(({ group, index }) => {
        const chosen = facilitators.get(index);
        return {
          id: group.id,
          name: group.name,
          session: group.session,
          timeIsNew: group.timeIsNew,
          room: group.room,
          members: group.memberUids.map((uid) => ({
            uid,
            name: nameOf(uid),
            facilitates: arranging.people.get(uid)?.facilitates ?? false,
            moved: movedUids.has(uid),
          })),
          facilitator: chosen ? { uid: chosen.uid, name: nameOf(chosen.uid), why: chosen.why } : null,
          existing: (() => {
            const live = group.id ? arranging.groups.get(group.id) : undefined;
            return live
              ? {
                  facilitatorUids: [...live.facilitatorUids],
                  slot: { weekday: live.session.weekday, start: live.session.startTimeLocal },
                }
              : null;
          })(),
        };
      }),
      unplaced: plan.unplaced.map((entry) => ({ ...entry, name: nameOf(entry.uid) })),
      claude,
      claudeConfigured: claudeConfigured(),
    },
  };
}
