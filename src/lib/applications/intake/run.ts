import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { askClaudeForJson, claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { own } from "../keys";
import type { Refusal } from "../review/types";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { applyIntakeAdvice, intakeInputFrom, type IntakeAdvice } from "./advice";
import { decidersNames, keptSuggestion, placementViewOf, type PlacementView } from "./placement";
import type { StoredSuggestion } from "./suggestion";
import { loadIntake, type IntakePerson } from "./load";

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

export type IntakeView = {
  programmes: {
    id: string;
    shortName: string;
    places: number | null;
    /** How many the decisions as they stand place on it. */
    placedNow: number;
    /** How many the suggestions put on it. */
    suggested: number;
    note: string | null;
  }[];
  /** Everybody in the term, each as their Placement box shows them (`./placement.ts`). */
  people: PlacementView[];
  facilitators: { uid: string; name: string; programmeId: string; why: string }[];
  shouldFacilitate: { uid: string; name: string; programmeId: string; why: string }[];
  claude: { notes: string; dropped: { suggestion: string; why: string }[] } | null;
  claudeConfigured: boolean;
};

export type IntakeResult = { ok: true; intake: IntakeView } | Refusal;

/**
 * Keep each person's suggestion with their application (`./suggestion.ts`),
 * on their assessment document, so it is there wherever they are opened.
 * The one write under this folder: it changes no decision.
 */
async function keepSuggestions(
  db: Firestore,
  roundId: string,
  entries: readonly { uid: string; suggestion: StoredSuggestion }[],
): Promise<void> {
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const { uid, suggestion } of entries.slice(i, i + 400)) {
      batch.set(
        db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(roundId, uid)),
        { roundId, uid, suggestion },
        { merge: true },
      );
    }
    await batch.commit();
  }
}

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

  let suggested: Map<string, PlacementView["suggestion"]> | null = null;
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
    const why = new Map(applied.changes.map((c) => [c.uid, named(c.why)]));
    const at = new Date().toISOString();
    const kept = people.map((person) => ({
      uid: person.uid,
      suggestion: { programmeId: applied.final.get(person.uid) ?? null, why: why.get(person.uid) ?? "", at },
    }));
    await keepSuggestions(db, loaded.intake.roundId, kept);
    suggested = new Map(kept.map(({ uid, suggestion }) => [uid, { ...suggestion, source: "claude" as const }]));
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

  // Each person's suggestion: the plan just made, else the one kept from the
  // last plan, else the site's draft (shown, never kept).
  const suggestionFor = (person: IntakePerson): PlacementView["suggestion"] =>
    suggested?.get(person.uid) ??
    keptSuggestion(person) ?? { programmeId: draft.get(person.uid) ?? null, why: "", at: "", source: "draft" };
  const names = await decidersNames(db, people);
  const views = people
    .map((person) =>
      placementViewOf(person, { roundId: loaded.intake.roundId, programmes, names, suggestion: suggestionFor(person) }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));

  return {
    ok: true,
    intake: {
      programmes: programmes.map((p) => ({
        id: p.id,
        shortName: p.shortName,
        places: p.places,
        placedNow: p.placedNow,
        suggested: views.filter((view) => view.suggestion?.programmeId === p.id).length,
        note: notes.get(p.id) ?? null,
      })),
      people: views,
      facilitators,
      shouldFacilitate,
      claude,
      claudeConfigured: claudeConfigured(),
    },
  };
}
