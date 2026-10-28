import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { own } from "../keys";
import type { Refusal } from "../review/types";
import { applyIntakeAdvice, decisionsFor, intakeInputFrom, type DecisionOp, type IntakeAdvice } from "./advice";
import { loadIntake } from "./load";

/**
 * A PLAN FOR THE WHOLE TERM, for an admin: the draft (`./match.ts`), then,
 * when asked, Claude's changes and facilitator lists, kept only where they
 * fit (`./advice.ts`), and for each person the decisions that would make the
 * plan true. NOTHING IS WRITTEN AND NOTHING IS STORED: the page shows it, and
 * Apply makes each decision through the decision route, which asks every
 * question it always asks.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), decide who goes on which of its programmes this term: fellowships and research incubators on AI safety, governance and strategy.

You are given every applicant in the term, numbered ("Applicant 3"), and every open programme with its places. For each person you see the programmes they ranked, in their order; for each of those, the programme lead's decision so far, the committee's score, your own earlier read of their application for that programme where there is one, and whether they offered to facilitate it. You also see a draft: each person placed on the highest programme they ranked that has room and would have them, with each programme preferring its lead's acceptances, then your earlier leans, then the committee's scores.

An admin reads your suggestions and decides. You never decide, and nothing you write is sent to anybody.

What to do:
- A decision a programme's lead or an admin has already made stands: never suggest a change that would undo an acceptance, or put somebody on a programme whose lead pooled or declined them. The draft keeps them already.
- Suggest changes to the draft that make the whole term better: a person who would clearly do better on another programme they ranked, a borderline call that should go the other way, a programme left with weak people while strong ones are turned away. Only programmes the person ranked, never one whose lead declined them, and never past a programme's places. Write "no place" to take somebody out. Few, well-reasoned changes beat many.
- List the best facilitators for each programme from people who OFFERED to facilitate it: people whose reads suggest they would lead a discussion well.
- List people who did NOT offer to facilitate but stand out as strong candidates and should be asked, with why.
- Give one sentence per programme on its intake.
- Do not mark anybody down for their English or background, and do not guess at personal characteristics.
- Refer to people only by their labels, and to programmes by the names given. Be brief, in British English.`;

const person = (extra: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: ["applicant", ...Object.keys(extra), "why"],
  properties: { applicant: { type: "string" }, ...extra, why: { type: "string", description: "One sentence." } },
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["programmes", "changes", "facilitators", "shouldFacilitate", "notes"],
  properties: {
    programmes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["programme", "note"],
        properties: { programme: { type: "string" }, note: { type: "string" } },
      },
    },
    changes: { type: "array", items: person({ to: { type: "string", description: 'A programme name, or "no place".' } }) },
    facilitators: { type: "array", items: person({ programme: { type: "string" } }) },
    shouldFacilitate: { type: "array", items: person({ programme: { type: "string" } }) },
    notes: { type: "string", description: "Two or three sentences on the term as a whole." },
  },
};

function adviceFrom(value: unknown): IntakeAdvice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const items = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []) as Record<string, unknown>[];
  return {
    programmes: items(raw.programmes).map((x) => ({ programme: text(x.programme), note: text(x.note) })),
    changes: items(raw.changes).map((x) => ({ applicant: text(x.applicant), to: text(x.to), why: text(x.why) })),
    facilitators: items(raw.facilitators).map((x) => ({ applicant: text(x.applicant), programme: text(x.programme), why: text(x.why) })),
    shouldFacilitate: items(raw.shouldFacilitate).map((x) => ({ applicant: text(x.applicant), programme: text(x.programme), why: text(x.why) })),
    notes: text(raw.notes),
  };
}

export type IntakeRow = {
  uid: string;
  name: string;
  /** Their ranking, with each programme's decision so far. */
  ranked: { programmeId: string; shortName: string; standing: string; lean: string | null; score: number | null; facilitates: boolean }[];
  now: { programmeId: string | null; outcome: string };
  plan: string | null;
  /** Whether Claude moved them from the draft, and why. */
  claudeWhy: string | null;
  /** What Apply would decide for them. Empty when nothing changes, and when a decision already made holds the plan. */
  ops: DecisionOp[];
  /**
   * When the plan would have to undo a decision already made, which one, in
   * a sentence: Apply leaves this person for a person. Null otherwise.
   */
  held: string | null;
  hasRead: boolean;
  hasPangram: boolean;
};

export type IntakeView = {
  programmes: { id: string; shortName: string; places: number | null; placedNow: number; inPlan: number; note: string | null }[];
  rows: IntakeRow[];
  facilitators: { uid: string; name: string; programmeId: string; why: string }[];
  shouldFacilitate: { uid: string; name: string; programmeId: string; why: string }[];
  claude: { notes: string; dropped: { suggestion: string; why: string }[] } | null;
  claudeConfigured: boolean;
};

export type IntakeResult = { ok: true; intake: IntakeView } | Refusal;

export async function planIntake(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  wanted: { askClaude: boolean },
): Promise<IntakeResult> {
  const loaded = await loadIntake(db, user, roundId);
  if (!loaded.ok) return loaded;
  const { programmes, people, draft } = loaded.intake;
  const nameOf = new Map(people.map((p) => [p.uid, p.name] as const));
  const shortOf = new Map(programmes.map((p) => [p.id, p.shortName] as const));

  let final = new Map(draft);
  let why = new Map<string, string>();
  let facilitators: IntakeView["facilitators"] = [];
  let shouldFacilitate: IntakeView["shouldFacilitate"] = [];
  let claude: IntakeView["claude"] = null;
  const notes = new Map<string, string>();

  if (wanted.askClaude && claudeConfigured() && people.length > 0) {
    const labels = intakeInputFrom({ programmes, people, draft });
    const answer = await askClaudeForJson({
      system: SYSTEM,
      message: labels.message,
      schema: SCHEMA,
      effort: "medium",
      maxTokens: 24_000,
      timeoutMs: 240_000,
    });
    if (!answer.ok) return { ok: false, status: 500, error: answer.reason };
    const advice = adviceFrom(answer.value);
    if (!advice) return { ok: false, status: 500, error: "Claude’s answer couldn’t be read. Try again." };
    const applied = applyIntakeAdvice({ programmes, people, draft, labels, advice });
    const named = (text: string) =>
      text.replace(/\bApplicant (\d+)\b/g, (w) => nameOf.get(own(labels.applicants, w) ?? "") ?? w);
    final = applied.final;
    why = new Map(applied.changes.map((c) => [c.uid, named(c.why)]));
    facilitators = applied.facilitators.map((f) => ({ ...f, name: nameOf.get(f.uid) ?? "", why: named(f.why) }));
    shouldFacilitate = applied.shouldFacilitate.map((f) => ({ ...f, name: nameOf.get(f.uid) ?? "", why: named(f.why) }));
    for (const entry of advice.programmes) {
      const programme = programmes.find((p) => p.shortName.toLowerCase() === entry.programme.toLowerCase());
      if (programme && entry.note) notes.set(programme.id, named(entry.note));
    }
    claude = {
      notes: named(advice.notes),
      dropped: applied.dropped.map((d) => ({ suggestion: named(d.suggestion), why: named(d.why) })),
    };
  }

  const rows: IntakeRow[] = people
    .map((person) => {
      const plan = final.get(person.uid) ?? null;
      const steps = decisionsFor(person, plan);
      const heldName = steps.held ? (shortOf.get(steps.held.programmeId) ?? "another programme") : "";
      return {
        uid: person.uid,
        name: person.name,
        ranked: person.ranked.flatMap((programmeId) => {
          const on = own(person.on, programmeId);
          const shortName = shortOf.get(programmeId);
          return on && shortName
            ? [{ programmeId, shortName, standing: on.standing, lean: on.lean, score: on.score, facilitates: on.facilitates }]
            : [];
        }),
        now: { programmeId: person.placedNow, outcome: person.outcomeNow },
        plan,
        claudeWhy: why.get(person.uid) ?? null,
        ops: steps.ops,
        held: steps.held
          ? steps.held.standing === "accepted"
            ? `${heldName} has already accepted them. The plan would undo that, so it’s left for you.`
            : `${heldName}’s lead ${steps.held.standing === "pooled" ? "pooled" : "declined"} them. The plan would undo that, so it’s left for you.`
          : null,
        hasRead: person.hasRead,
        hasPangram: person.hasPangram,
      };
    })
    // The people whose decisions would change first, then those left for a person, then by name.
    .sort(
      (a, b) =>
        Number(b.ops.length > 0) - Number(a.ops.length > 0) ||
        Number(b.held !== null) - Number(a.held !== null) ||
        a.name.localeCompare(b.name),
    );

  return {
    ok: true,
    intake: {
      programmes: programmes.map((p) => ({
        id: p.id,
        shortName: p.shortName,
        places: p.places,
        placedNow: p.placedNow,
        inPlan: [...final.values()].filter((id) => id === p.id).length,
        note: notes.get(p.id) ?? null,
      })),
      rows,
      facilitators,
      shouldFacilitate,
      claude,
      claudeConfigured: claudeConfigured(),
    },
  };
}
