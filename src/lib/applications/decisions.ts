import type { ApplicationFormFields, DecisionDoc } from "./model";
import { PROGRAMME_DECISION_STANDING, type ProgrammeStanding } from "./words";

/**
 * FROM EACH LEAD'S DECISION TO WHAT ONE PERSON HEARS.
 *
 * A lead decides for their own programme: Accept, Pool, or (rarely) Decline.
 * A person who ticked three programmes can therefore hold three decisions,
 * and what they are finally told is worked out from all of them:
 *
 *  - ONE PLACE A TERM. They are placed on the highest programme IN THEIR OWN
 *    RANKING that accepted them. An admin can add a second place as a named
 *    exception.
 *  - POOLED means no programme they ranked took them. Before decision day the
 *    committee picks what each pooled person hears: an invitation to a
 *    programme with a free place, or no offer this time.
 *  - DECLINED means every programme they ranked declined them (spam, or not
 *    eligible). They are not emailed unless an admin switches that on.
 *
 * Everything here is pure and derived. Nothing in this module is stored, so a
 * lead changing their mind the night before needs no recount: the next read
 * is simply right.
 *
 * `ranked` everywhere below is the ranking as the form knows it
 * (`rankedProgrammes(form, sent).map((p) => p.id)`): a programme that has
 * left the form has already been dropped from it.
 */

type Decided = Pick<DecisionDoc, "programmes" | "pooledOutcome" | "exception">;

/** Where an application stands with one programme. */
export function standingWith(decision: Decided | null, programmeId: string): ProgrammeStanding {
  const entry = decision?.programmes[programmeId];
  return entry ? PROGRAMME_DECISION_STANDING[entry.decision] : "to-review";
}

/**
 * The programme this person is placed on by their own ranking, or null.
 * The highest-ranked programme that accepted them.
 */
export function placementFor(ranked: readonly string[], decision: Decided | null): string | null {
  for (const programmeId of ranked) {
    if (standingWith(decision, programmeId) === "accepted") return programmeId;
  }
  return null;
}

/**
 * Every programme this person holds a place on: their placement, and any
 * further accepted programme an admin's exception names.
 */
export function placesHeld(ranked: readonly string[], decision: Decided | null): string[] {
  const placement = placementFor(ranked, decision);
  if (!placement) return [];
  const held = [placement];
  for (const programmeId of decision?.exception?.programmeIds ?? []) {
    if (held.includes(programmeId)) continue;
    if (standingWith(decision, programmeId) === "accepted") held.push(programmeId);
  }
  return held;
}

/**
 * Does this programme still owe this person a decision?
 *
 * Not once it has decided, and not once a programme they ranked HIGHER has
 * accepted them: their first choice decides first, and a place there settles
 * it. A lower choice accepting does not let a higher one off, because the
 * higher one would still take them.
 */
export function owesDecision(
  ranked: readonly string[],
  decision: Decided | null,
  programmeId: string,
): boolean {
  const at = ranked.indexOf(programmeId);
  if (at === -1) return false;
  if (standingWith(decision, programmeId) !== "to-review") return false;
  for (let i = 0; i < at; i += 1) {
    if (standingWith(decision, ranked[i]) === "accepted") return false;
  }
  return true;
}

export type Outcome =
  /** Placed. `programmeId` is the place their ranking gives them. */
  | { kind: "accepted"; programmeId: string }
  /** Pooled, and invited to a programme. */
  | { kind: "invited"; programmeId: string }
  /** Pooled, with nothing else this term. */
  | { kind: "no-offer" }
  /** Every programme they ranked declined them. */
  | { kind: "declined" }
  /** Pooled, and nobody has picked what they will hear yet. */
  | { kind: "needs-outcome" }
  /** At least one programme still owes a decision. */
  | { kind: "undecided"; waitingOn: string[] };

/**
 * What this person would be told if decision day were now.
 *
 * `invitable` is the set of programmes an invitation may name: programmes on
 * the form. An invitation to anything else reads as not picked yet, so a
 * programme removed after the choice was made cannot be promised to anybody.
 */
export function outcomeFor(
  ranked: readonly string[],
  decision: Decided | null,
  invitable: ReadonlySet<string>,
): Outcome {
  const waitingOn = ranked.filter((programmeId) => owesDecision(ranked, decision, programmeId));
  if (waitingOn.length > 0) return { kind: "undecided", waitingOn };

  const placement = placementFor(ranked, decision);
  if (placement) return { kind: "accepted", programmeId: placement };

  // Nobody is waiting and nobody accepted, so every ranked programme pooled
  // or declined. With nothing ranked at all there is nothing to tell them.
  if (ranked.length === 0) return { kind: "undecided", waitingOn: [] };
  if (ranked.every((programmeId) => standingWith(decision, programmeId) === "declined")) {
    return { kind: "declined" };
  }

  const picked = decision?.pooledOutcome ?? null;
  if (picked?.kind === "no-offer") return { kind: "no-offer" };
  if (picked?.kind === "invite" && invitable.has(picked.programmeId)) {
    return { kind: "invited", programmeId: picked.programmeId };
  }
  return { kind: "needs-outcome" };
}

/** True for a pooled applicant, whether or not their outcome has been picked. */
export function isPooled(outcome: Outcome): boolean {
  return outcome.kind === "invited" || outcome.kind === "no-offer" || outcome.kind === "needs-outcome";
}

// ---------------------------------------------------------------------------
// The whole term at once
// ---------------------------------------------------------------------------

/** One sent application, reduced to what the arithmetic needs. */
export type Applicant = {
  uid: string;
  /** Their ranking, as the form knows it. */
  ranked: readonly string[];
  decision: Decided | null;
};

export type ProgrammeTally = {
  /** People who ranked this programme at all. */
  applications: number;
  /** People who ranked it first. */
  firstChoice: number;
  /** Still owed a decision by this programme. */
  toReview: number;
  /** Accepted by this programme, wherever they are finally placed. */
  accepted: number;
  pooled: number;
  declined: number;
  /** People whose place is here. Never more than `accepted`. */
  placed: number;
  /** Pooled applicants invited here. They hold a place until they answer. */
  invited: number;
};

export type TermTally = {
  applicants: number;
  programmes: Record<string, ProgrammeTally>;
  /** How many people each decision-day group holds. */
  outcomes: {
    accepted: number;
    invited: number;
    noOffer: number;
    declined: number;
    needsOutcome: number;
    undecided: number;
  };
  /** Accepted, invited and no offer. A declined application is not emailed. */
  emails: number;
};

function emptyProgrammeTally(): ProgrammeTally {
  return {
    applications: 0,
    firstChoice: 0,
    toReview: 0,
    accepted: 0,
    pooled: 0,
    declined: 0,
    placed: 0,
    invited: 0,
  };
}

/** Every count the manager shows, from the applications and their decisions. */
export function tallyTerm(
  form: Pick<ApplicationFormFields, "programmeIds">,
  applicants: readonly Applicant[],
): TermTally {
  const invitable = new Set(form.programmeIds);
  const programmes: Record<string, ProgrammeTally> = {};
  for (const programmeId of form.programmeIds) programmes[programmeId] = emptyProgrammeTally();
  const outcomes: TermTally["outcomes"] = {
    accepted: 0,
    invited: 0,
    noOffer: 0,
    declined: 0,
    needsOutcome: 0,
    undecided: 0,
  };

  for (const applicant of applicants) {
    const { ranked, decision } = applicant;
    ranked.forEach((programmeId, at) => {
      const tally = programmes[programmeId];
      if (!tally) return;
      tally.applications += 1;
      if (at === 0) tally.firstChoice += 1;
      const standing = standingWith(decision, programmeId);
      if (standing === "accepted") tally.accepted += 1;
      else if (standing === "pooled") tally.pooled += 1;
      else if (standing === "declined") tally.declined += 1;
      else if (owesDecision(ranked, decision, programmeId)) tally.toReview += 1;
    });
    for (const programmeId of placesHeld(ranked, decision)) {
      if (programmes[programmeId]) programmes[programmeId].placed += 1;
    }

    const outcome = outcomeFor(ranked, decision, invitable);
    if (outcome.kind === "accepted") outcomes.accepted += 1;
    else if (outcome.kind === "invited") {
      outcomes.invited += 1;
      if (programmes[outcome.programmeId]) programmes[outcome.programmeId].invited += 1;
    } else if (outcome.kind === "no-offer") outcomes.noOffer += 1;
    else if (outcome.kind === "declined") outcomes.declined += 1;
    else if (outcome.kind === "needs-outcome") outcomes.needsOutcome += 1;
    else outcomes.undecided += 1;
  }

  return {
    applicants: applicants.length,
    programmes,
    outcomes,
    emails: outcomes.accepted + outcomes.invited + outcomes.noOffer,
  };
}

/**
 * Places a programme still has: its places, less the people placed there and
 * the pooled applicants already invited there. Null when the lead has not
 * said how many places there are. Never below zero.
 */
export function freePlaces(
  form: Pick<ApplicationFormFields, "programmes">,
  tally: TermTally,
  programmeId: string,
): number | null {
  const places = form.programmes[programmeId]?.places ?? null;
  const taken = tally.programmes[programmeId];
  if (places === null || !taken) return null;
  return Math.max(0, places - taken.placed - taken.invited);
}

export type Readiness = {
  /** True when every count below is zero: decision day can be sent. */
  ready: boolean;
  /** Applications each programme still owes a decision. */
  toReview: Record<string, number>;
  /** Pooled applicants with no outcome picked. */
  needsOutcome: number;
};

/** Can decision day be sent? Every application decided, every pooled person given an outcome. */
export function readinessFor(tally: TermTally): Readiness {
  const toReview: Record<string, number> = {};
  let owed = 0;
  for (const [programmeId, programme] of Object.entries(tally.programmes)) {
    toReview[programmeId] = programme.toReview;
    owed += programme.toReview;
  }
  const needsOutcome = tally.outcomes.needsOutcome;
  return { ready: owed === 0 && needsOutcome === 0 && tally.outcomes.undecided === 0, toReview, needsOutcome };
}

// ---------------------------------------------------------------------------
// Recommendations, when a programme uses scores
// ---------------------------------------------------------------------------

/** One applicant to a programme, as the recommendations read them. */
export type ScoredApplicant = {
  uid: string;
  /** This programme's place in their ranking: 1 is their 1st choice. */
  choice: number;
  /** Their section score here. Null when nobody has scored them. */
  score: number | null;
  /** Their section scores on the other programmes they ranked. */
  elsewhere: Record<string, number | null>;
};

/** How close to the line counts as worth a second look. */
export const BORDERLINE_MARGIN = 0.2;

export type Recommendations = {
  /** The lowest score among the top `places`. Null with no scores or no places. */
  cutoff: number | null;
  /** The top `places` by score, highest first. */
  top: string[];
  /** Within the margin of the line and not already in the top. */
  borderline: string[];
  /** Ranked this programme 2nd or lower: their higher choice decides first. */
  rankedLower: string[];
  /** Scored higher on another programme's questions, with which one. */
  scoredHigherElsewhere: { uid: string; programmeId: string }[];
};

/**
 * What the scores suggest for one programme. A guide for the lead, never a
 * decision: nothing here writes anything.
 */
export function recommendationsFor(
  applicants: readonly ScoredApplicant[],
  places: number | null,
): Recommendations {
  const scored = applicants
    .filter((a): a is ScoredApplicant & { score: number } => a.score !== null)
    // Highest first; the uid breaks ties so the list is stable between reads.
    .sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));

  const size = places === null ? 0 : Math.max(0, places);
  const top = scored.slice(0, size);
  const cutoff = top.length > 0 ? top[top.length - 1].score : null;
  const topUids = new Set(top.map((a) => a.uid));

  const borderline =
    cutoff === null
      ? []
      : scored
          .filter((a) => !topUids.has(a.uid) && Math.abs(a.score - cutoff) <= BORDERLINE_MARGIN + 1e-9)
          .map((a) => a.uid);

  const scoredHigherElsewhere: Recommendations["scoredHigherElsewhere"] = [];
  for (const applicant of scored) {
    let best: { programmeId: string; score: number } | null = null;
    for (const [programmeId, score] of Object.entries(applicant.elsewhere)) {
      if (score === null || score <= applicant.score) continue;
      if (!best || score > best.score) best = { programmeId, score };
    }
    if (best) scoredHigherElsewhere.push({ uid: applicant.uid, programmeId: best.programmeId });
  }

  return {
    cutoff,
    top: top.map((a) => a.uid),
    borderline,
    rankedLower: applicants.filter((a) => a.choice > 1).map((a) => a.uid),
    scoredHigherElsewhere,
  };
}
