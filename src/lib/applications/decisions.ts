import { isId, own } from "./keys";
import type { ApplicationDoc, ApplicationFormFields, DecisionDoc } from "./model";
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
 *
 * A NAME THAT IS NOT AN ID IS NOT A PROGRAMME, here as everywhere
 * (`./keys`). A ranking is something an applicant typed, and one that
 * reached these functions carrying such a name is read as if the name were
 * not in it: it has no standing, it owes nothing, and so it can never be the
 * thing decision day is waiting on. Every read of a decision's `programmes`
 * goes through `own` for the same reason.
 */

type Decided = Pick<DecisionDoc, "programmes" | "pooledOutcome" | "exception">;

/** Where an application stands with one programme. */
export function standingWith(decision: Decided | null, programmeId: string): ProgrammeStanding {
  if (!isId(programmeId)) return "to-review";
  const entry = own(decision?.programmes, programmeId);
  if (!entry) return "to-review";
  return own(PROGRAMME_DECISION_STANDING, entry.decision) ?? "to-review";
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
  // Not a programme, so there is nobody to owe anything. Without this a name
  // nobody can decide for would be waited on for ever.
  if (!isId(programmeId)) return false;
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
 *
 * SOMEBODY WHO RANKED NOTHING THE FORM CARRIES IS POOLED. No programme they
 * ranked took them, which is what pooled means, so they wait for the
 * committee to pick what they hear like anybody else nothing took. They are
 * never `undecided`: that is a programme still owing a decision, and here
 * there is no programme to owe one. An application like that should not
 * exist (the send refuses an empty ranking), and if one does, this is the
 * reading that leaves the committee something to do about it.
 */
export function outcomeFor(
  ranked: readonly string[],
  decision: Decided | null,
  invitable: ReadonlySet<string>,
): Outcome {
  // Only an id can be a programme. Anything else in the ranking is read as
  // not there, so the answer is the one their real choices give.
  const chosen = ranked.filter(isId);
  const waitingOn = chosen.filter((programmeId) => owesDecision(chosen, decision, programmeId));
  if (waitingOn.length > 0) return { kind: "undecided", waitingOn };

  const placement = placementFor(chosen, decision);
  if (placement) return { kind: "accepted", programmeId: placement };

  // Nobody is waiting and nobody accepted, so every programme they ranked
  // pooled or declined. Declined takes at least one programme to have said so.
  if (
    chosen.length > 0 &&
    chosen.every((programmeId) => standingWith(decision, programmeId) === "declined")
  ) {
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

/**
 * Is this application part of the term's arithmetic? It has to have been
 * sent, and its owner must not have taken it out since: by withdrawing, or
 * by giving a place or an invitation back after decision day, which moves
 * the application to `withdrawn` in the same write.
 *
 * EVERY CALLER OF `tallyTerm` FILTERS BY THIS FIRST, and so does anything
 * else that counts places, decisions owed or people to be told. That is what
 * makes a place given back free on every screen at once: the decision
 * documents still say Accept for somebody who has gone, because an
 * applicant's reply never touches them, and the arithmetic below would go on
 * counting that place. `tests/applications-journey-in-term.test.mjs` walks
 * the tree for callers and holds each one to it.
 *
 * A screen may still LIST somebody who has left (the review list keeps the
 * row, marked as withdrawn). It may not count them.
 */
export function isInTerm(application: Pick<ApplicationDoc, "sent" | "status">): boolean {
  return application.sent !== null && application.status !== "withdrawn";
}

/**
 * Has decision day told this person? It has once their outcome is published
 * onto their own application (`result`), which is the moment their page shows
 * it, whether or not the email has gone yet.
 *
 * WHAT SOMEBODY HAS BEEN TOLD IS FIXED, PERSON BY PERSON. The send publishes
 * one person at a time and can stop part way, so "the term has been sent"
 * (`decisionsSentAt`) comes later than "this person has been told", sometimes
 * by a whole press. In between, a lead's decision, an acceptance taken back or
 * a different pooled outcome would leave the committee's screens saying one
 * thing and the person holding another, and a later press would not put it
 * right, because it skips anybody already told. So every route that writes a
 * decision or a pooled outcome refuses once this is true for the person it is
 * about, inside the transaction that would have written.
 */
export function hasBeenTold(application: Pick<ApplicationDoc, "result">): boolean {
  return application.result !== null;
}

/**
 * One application that is in the term (see {@link isInTerm}), reduced to
 * what the arithmetic needs.
 */
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

/**
 * Every count the manager shows, from the applications and their decisions.
 * `applicants` is the people in the term: filter by {@link isInTerm} first.
 */
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
    const { decision } = applicant;
    // The ranking as THIS form knows it: each programme the form carries,
    // once, in their order. Callers are meant to hand it in that way already.
    // It is settled again here because everything below counts by position,
    // and an id the form does not carry must not take 1st choice from the one
    // behind it, or be waited on by a decision day nobody can clear.
    const ranked = applicant.ranked.filter(
      (programmeId, at, all) =>
        own(programmes, programmeId) !== undefined && all.indexOf(programmeId) === at,
    );
    ranked.forEach((programmeId, at) => {
      const tally = own(programmes, programmeId);
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
      const tally = own(programmes, programmeId);
      if (tally) tally.placed += 1;
    }

    const outcome = outcomeFor(ranked, decision, invitable);
    if (outcome.kind === "accepted") outcomes.accepted += 1;
    else if (outcome.kind === "invited") {
      outcomes.invited += 1;
      const tally = own(programmes, outcome.programmeId);
      if (tally) tally.invited += 1;
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
  const places = own(form.programmes, programmeId)?.places ?? null;
  const taken = own(tally.programmes, programmeId);
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
