import { own } from "../keys";
import type { IntakePerson, IntakeProgramme } from "./load";

/**
 * WHAT CLAUDE IS TOLD ABOUT A WHOLE TERM, AND WHAT IS KEPT OF WHAT IT SAYS.
 *
 * Claude sees the draft `./match.ts` made, with people numbered and never
 * named. For each person and each programme they ranked: the lead's decision
 * so far, the committee's score, Claude's own earlier read where there is
 * one, and whether they offered to facilitate it. Programmes are named: a
 * programme is not a person.
 *
 * It is asked for changes to the draft, a facilitator shortlist from those
 * who offered, and the people who did NOT offer but should be asked.
 *
 * Nothing it says is taken on trust (`applyIntakeAdvice`): a change has to be
 * to a programme the person ranked and whose lead did not decline them, or to
 * no place, and a programme is never sent past its places. A facilitator on
 * the shortlist has to have offered for that programme; one Claude says
 * should be asked has to NOT have. Everything not kept is listed with why.
 *
 * Pure.
 */

export type IntakeLabels = {
  message: string;
  /** "Applicant 3" to the account. */
  applicants: Record<string, string>;
};

const STANDING_WORDS: Record<string, string> = {
  accepted: "accepted by its lead",
  "to-review": "not decided yet",
  pooled: "pooled by its lead",
  declined: "declined by its lead (spam or not eligible)",
};

export function intakeInputFrom(input: {
  programmes: readonly IntakeProgramme[];
  people: readonly IntakePerson[];
  draft: ReadonlyMap<string, string | null>;
}): IntakeLabels {
  const nameOf = new Map(input.programmes.map((p) => [p.id, p.shortName] as const));
  const people = [...input.people].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  const applicants: Record<string, string> = {};
  const lines = [`# The term: ${people.length} applicants`, "", "## Programmes"];
  for (const programme of input.programmes) {
    const draftCount = [...input.draft.values()].filter((id) => id === programme.id).length;
    lines.push(
      `- ${programme.shortName} (${programme.kind}): ${programme.places === null ? "no set number of places" : `${programme.places} places`}; ` +
        `${programme.placedNow} hold a place by the decisions so far; ${draftCount} in the draft.`,
    );
  }
  lines.push("", "## People");
  people.forEach((person, i) => {
    const label = `Applicant ${i + 1}`;
    applicants[label] = person.uid;
    lines.push("", `### ${label}`);
    lines.push(`Ranked: ${person.ranked.map((id, n) => `${n + 1}. ${nameOf.get(id) ?? "a closed programme"}`).join(", ")}`);
    for (const programmeId of person.ranked) {
      const on = own(person.on, programmeId);
      const name = nameOf.get(programmeId);
      if (!on || !name) continue;
      const parts = [
        `- ${name}: ${own(STANDING_WORDS, on.standing) ?? on.standing}`,
        on.score !== null ? `committee score ${on.score.toFixed(1)}` : "not scored",
        on.lean ? `your earlier read: ${on.lean}. ${(on.summary ?? "").replace(/\bReviewer [A-Z]\b/g, "a reviewer")}` : "not read by you yet",
        on.facilitates ? "offered to facilitate it" : "did not offer to facilitate it",
      ];
      lines.push(parts.join("; "));
    }
    const draft = input.draft.get(person.uid) ?? null;
    lines.push(`Draft: ${draft ? (nameOf.get(draft) ?? "?") : "no place"}.`);
  });
  return { message: lines.join("\n"), applicants };
}

export type IntakeChange = { applicant: string; to: string; why: string };
export type IntakeFacilitator = { applicant: string; programme: string; why: string };
export type IntakeAdvice = {
  programmes: { programme: string; note: string }[];
  changes: IntakeChange[];
  facilitators: IntakeFacilitator[];
  shouldFacilitate: IntakeFacilitator[];
  notes: string;
};

export type AppliedIntake = {
  /** Each person's programme in the plan, or null. */
  final: Map<string, string | null>;
  changes: { uid: string; from: string | null; to: string | null; why: string }[];
  facilitators: { uid: string; programmeId: string; why: string }[];
  shouldFacilitate: { uid: string; programmeId: string; why: string }[];
  dropped: { suggestion: string; why: string }[];
};

const NO_PLACE = "no place";

export function applyIntakeAdvice(input: {
  programmes: readonly IntakeProgramme[];
  people: readonly IntakePerson[];
  draft: ReadonlyMap<string, string | null>;
  labels: IntakeLabels;
  advice: IntakeAdvice;
}): AppliedIntake {
  const byShort = new Map(input.programmes.map((p) => [p.shortName.toLowerCase(), p] as const));
  const byUid = new Map(input.people.map((p) => [p.uid, p] as const));
  const final = new Map(input.draft);
  const dropped: AppliedIntake["dropped"] = [];
  const changes: AppliedIntake["changes"] = [];
  const count = (programmeId: string) => [...final.values()].filter((id) => id === programmeId).length;

  for (const suggestion of input.advice.changes) {
    const said = `${suggestion.applicant} to ${suggestion.to}`;
    const uid = own(input.labels.applicants, suggestion.applicant);
    const person = uid ? byUid.get(uid) : undefined;
    if (!uid || !person) {
      dropped.push({ suggestion: said, why: "names somebody who is not in the term" });
      continue;
    }
    const toNone = suggestion.to.trim().toLowerCase() === NO_PLACE;
    const programme = toNone ? null : byShort.get(suggestion.to.trim().toLowerCase());
    if (!toNone && !programme) {
      dropped.push({ suggestion: said, why: "names a programme that is not open on this form" });
      continue;
    }
    if (programme) {
      const on = own(person.on, programme.id);
      if (!person.ranked.includes(programme.id) || !on) {
        dropped.push({ suggestion: said, why: `${suggestion.applicant} did not rank ${programme.shortName}` });
        continue;
      }
      if (on.standing === "declined") {
        dropped.push({ suggestion: said, why: `${programme.shortName}'s lead declined ${suggestion.applicant}` });
        continue;
      }
      if (final.get(uid) !== programme.id && programme.places !== null && count(programme.id) >= programme.places) {
        dropped.push({ suggestion: said, why: `${programme.shortName} has no places left in the plan` });
        continue;
      }
    }
    const from = final.get(uid) ?? null;
    const to = programme ? programme.id : null;
    if (from === to) continue;
    const held = decisionsFor(person, to).held;
    if (held) {
      const name = input.programmes.find((p) => p.id === held.programmeId)?.shortName ?? "another programme";
      dropped.push({ suggestion: said, why: `it would undo ${name}'s decision (${held.standing}), which stands` });
      continue;
    }
    final.set(uid, to);
    changes.push({ uid, from, to, why: suggestion.why });
  }

  const pick = (
    list: readonly IntakeFacilitator[],
    offered: boolean,
    kind: string,
  ): { uid: string; programmeId: string; why: string }[] => {
    const kept: { uid: string; programmeId: string; why: string }[] = [];
    for (const suggestion of list) {
      const said = `${suggestion.applicant} ${kind} ${suggestion.programme}`;
      const uid = own(input.labels.applicants, suggestion.applicant);
      const person = uid ? byUid.get(uid) : undefined;
      const programme = byShort.get(suggestion.programme.trim().toLowerCase());
      if (!uid || !person || !programme) {
        dropped.push({ suggestion: said, why: "names somebody or a programme that is not in the term" });
        continue;
      }
      const on = own(person.on, programme.id);
      if (offered && !on?.facilitates) {
        dropped.push({ suggestion: said, why: `${suggestion.applicant} did not offer to facilitate ${programme.shortName}` });
        continue;
      }
      if (!offered && on?.facilitates) {
        dropped.push({ suggestion: said, why: `${suggestion.applicant} already offered to facilitate ${programme.shortName}` });
        continue;
      }
      if (kept.some((entry) => entry.uid === uid && entry.programmeId === programme.id)) continue;
      kept.push({ uid, programmeId: programme.id, why: suggestion.why });
    }
    return kept;
  };

  return {
    final,
    changes,
    facilitators: pick(input.advice.facilitators, true, "to facilitate"),
    shouldFacilitate: pick(input.advice.shouldFacilitate, false, "should be asked to facilitate"),
    dropped,
  };
}

/**
 * One decision Apply makes, through the decision route. A better-fit pool
 * names no programme they "could suit": the route takes only a programme the
 * person did NOT rank there (that is for an invitation), and the plan only
 * ever moves somebody to one they ranked.
 */
export type DecisionOp = {
  programmeId: string;
  decision: "accept" | "pool";
  poolReason: "capacity" | "better-fit" | null;
};

/**
 * A decision already made that a placement would change: the programme, and
 * how it was decided. The plan never changes one: the person is left for a
 * person. An admin's own pick may, and is told which first.
 */
export type HeldBy = { programmeId: string; standing: "accepted" | "pooled" | "declined" };

export type PlanSteps = {
  ops: DecisionOp[];
  /** The plan would have to change a decision already made: nothing is done. Always null for an admin's own pick. */
  held: HeldBy | null;
  /** An admin's own pick: every decision already made that it changes, in ranked order. */
  overrides: HeldBy[];
};

/** What `decisionsFor` reads of a person: their ranking, and each programme's decision so far. */
export type Placeable = Pick<IntakePerson, "ranked"> & {
  on: Readonly<Record<string, { standing: IntakePerson["on"][string]["standing"] }>>;
};

/**
 * The decisions that turn somebody's decisions as they stand into one
 * placement, through the one-place rule (a person gets the highest programme
 * they ranked that accepted them, once none ranked higher still owes a
 * decision): pool what is ranked above the placement, as a better fit
 * elsewhere, and accept the placement. Nothing ranked below it is touched. For
 * no place, pool every programme still open to them, for capacity.
 *
 * THE PLAN ONLY FILLS IN DECISIONS NOBODY HAS MADE. A decision already made
 * (accepted, pooled or declined) is never changed: a placement that needs one
 * changed is held, and no step is taken for that person at all, so nobody is
 * left half moved.
 *
 * AN ADMIN'S OWN PICK (`override`) may change them, and says which it changes
 * (`overrides`) before anything is written: an acceptance above the pick is
 * pooled, and a Pool or Decline on the pick itself becomes an Accept.
 */
export function decisionsFor(person: Placeable, target: string | null, override = false): PlanSteps {
  const ops: DecisionOp[] = [];
  const overrides: HeldBy[] = [];
  const standingOn = (programmeId: string) => own(person.on, programmeId)?.standing ?? null;
  const hold = (programmeId: string, standing: HeldBy["standing"]): PlanSteps => ({
    ops: [],
    held: { programmeId, standing },
    overrides: [],
  });
  if (target === null) {
    for (const programmeId of person.ranked) {
      const standing = standingOn(programmeId);
      if (standing === "accepted") {
        if (!override) return hold(programmeId, "accepted");
        overrides.push({ programmeId, standing });
      }
      if (standing === "to-review" || standing === "accepted") {
        ops.push({ programmeId, decision: "pool", poolReason: "capacity" });
      }
    }
    return { ops, held: null, overrides };
  }
  for (const programmeId of person.ranked) {
    if (programmeId === target) break;
    const standing = standingOn(programmeId);
    if (standing === "accepted") {
      if (!override) return hold(programmeId, "accepted");
      overrides.push({ programmeId, standing });
    }
    if (standing === "to-review" || standing === "accepted") {
      ops.push({ programmeId, decision: "pool", poolReason: "better-fit" });
    }
  }
  const here = standingOn(target);
  if (here === "pooled" || here === "declined") {
    if (!override) return hold(target, here);
    overrides.push({ programmeId: target, standing: here });
  }
  if (here !== "accepted") ops.push({ programmeId: target, decision: "accept", poolReason: null });
  return { ops, held: null, overrides };
}
