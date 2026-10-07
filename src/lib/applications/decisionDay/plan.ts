import { formatRoundDate, formatRoundDeadline, roundWindowState } from "@/lib/admissions/window";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import {
  freePlaces,
  isPooled,
  outcomeFor,
  placesHeld,
  readinessFor,
  tallyTerm,
  type Outcome,
  type Readiness,
  type TermTally,
} from "../decisions";
import { own } from "../keys";
import type { ApplicationDoc, ApplicationResult, ApplicationResultKind, DecisionDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { rankedProgrammes } from "../sections";
import type { DecisionEmailOutcome } from "./emailCopy";
import { programmeOf } from "./programmes";

/**
 * THE TERM, AS POOLED APPLICANTS AND DECISION DAY READ IT.
 *
 * One function, {@link planTerm}, turns the sent applications and the decision
 * documents into the list of people both screens work from, and every count
 * either of them shows comes from `decisions.ts` over that list. Nothing here
 * decides who is pooled, who is placed or whether the send is ready: this
 * module only lines the people up, names them, and says what each one would
 * be told.
 *
 * Pure, with no server import, so the routes, the pages and the tests all run
 * the same code against the same shapes.
 */

type Sent = Pick<
  ApplicationDoc,
  "uid" | "displayName" | "email" | "status" | "sent" | "result"
>;

export type TermPerson = {
  uid: string;
  /** Their name as the committee reads it. */
  name: string;
  /** What an email calls them. */
  firstName: string;
  /** Where their email goes. Never part of anything a browser is sent. */
  email: string | null;
  /** The programmes they ranked, in their order, as the form knows them. */
  ranked: string[];
  decision: DecisionDoc | null;
  /** What the decisions say about them right now. */
  outcome: Outcome;
  status: AdmissionApplicationStatus;
  /** What decision day has already told them, once it has. */
  result: ApplicationResult | null;
};

export type Term = {
  /** Everybody with an application in the term, by name. */
  people: TermPerson[];
  tally: TermTally;
  readiness: Readiness;
};

/**
 * Is this application part of the term's decisions? It has to have been sent,
 * and its owner must not have withdrawn it since.
 */
export function isInTerm(application: Pick<ApplicationDoc, "sent" | "status">): boolean {
  return application.sent !== null && application.status !== "withdrawn";
}

function firstWord(text: string): string {
  return text.trim().split(/\s+/)[0] ?? "";
}

export function planTerm(
  form: ApplicationForm,
  applications: readonly Sent[],
  decisions: ReadonlyMap<string, DecisionDoc>,
): Term {
  const invitable = new Set(form.programmeIds);
  const people: TermPerson[] = [];
  for (const application of applications) {
    if (!isInTerm(application) || !application.sent) continue;
    const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
    const decision = decisions.get(application.uid) ?? null;
    const preferred = application.sent.aboutYou.preferredName.trim();
    const name = application.displayName.trim() || preferred || "Unnamed applicant";
    people.push({
      uid: application.uid,
      name,
      firstName: preferred || firstWord(application.displayName),
      email: application.email,
      ranked,
      decision,
      outcome: outcomeFor(ranked, decision, invitable),
      status: application.status,
      result: application.result,
    });
  }
  // By name, then by uid, so two reads of the same term list people the same way.
  people.sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));
  const tally = tallyTerm(
    form,
    people.map((person) => ({ uid: person.uid, ranked: person.ranked, decision: person.decision })),
  );
  return { people, tally, readiness: readinessFor(tally) };
}

// ---------------------------------------------------------------------------
// What one person is told
// ---------------------------------------------------------------------------

/** What decision day writes on one person's own document. */
export type Publication = {
  kind: ApplicationResultKind;
  /** The programme they are in, or invited to. Null for the other two. */
  programmeId: string | null;
};

/** The outcome as it would be published, or null while it cannot be yet. */
export function publicationFor(outcome: Outcome): Publication | null {
  if (outcome.kind === "accepted") return { kind: "accepted", programmeId: outcome.programmeId };
  if (outcome.kind === "invited") return { kind: "invited", programmeId: outcome.programmeId };
  if (outcome.kind === "no-offer") return { kind: "no-offer", programmeId: null };
  if (outcome.kind === "declined") return { kind: "declined", programmeId: null };
  return null;
}

/**
 * What this person has been told, or would be told now. A published result
 * wins over the decisions: once somebody has heard, that is what they heard.
 */
export function toldTo(person: Pick<TermPerson, "result" | "outcome">): Publication | null {
  if (person.result) return { kind: person.result.kind, programmeId: person.result.programmeId };
  return publicationFor(person.outcome);
}

export function samePublication(a: Publication | null, b: Publication | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.programmeId === b.programmeId;
}

/**
 * The email an outcome earns, or null when it earns none: a declined
 * application is not emailed unless an admin switched that on.
 */
export function emailOutcomeFor(
  told: Publication,
  emailDeclined: boolean,
): DecisionEmailOutcome | null {
  if (told.kind === "accepted" && told.programmeId) {
    return { kind: "accepted", programmeId: told.programmeId };
  }
  if (told.kind === "invited" && told.programmeId) {
    return { kind: "invited", programmeId: told.programmeId };
  }
  if (told.kind === "no-offer") return { kind: "no-offer" };
  if (told.kind === "declined" && emailDeclined) return { kind: "declined" };
  return null;
}

/** People decision day has not reached yet, in the order it will reach them. */
export function unpublished(term: Term): TermPerson[] {
  return term.people.filter((person) => person.result === null);
}

/** How many emails a press of Send would attempt for these people. */
export function emailCount(people: readonly TermPerson[], emailDeclined: boolean): number {
  let emails = 0;
  for (const person of people) {
    const told = publicationFor(person.outcome);
    if (told && emailOutcomeFor(told, emailDeclined)) emails += 1;
  }
  return emails;
}

// ---------------------------------------------------------------------------
// Pooled applicants
// ---------------------------------------------------------------------------

/** What the committee picks for a pooled applicant. */
export type PoolChoice = { kind: "invite"; programmeId: string } | { kind: "no-offer" };

/** Why this person cannot be given a pooled outcome, as a sentence, or null. */
export function poolProblem(form: ApplicationForm, person: TermPerson): string | null {
  if (person.result) return `${person.name} has already been told their outcome.`;
  if (isPooled(person.outcome)) return null;
  if (person.outcome.kind === "accepted") {
    const programme = programmeOf(form, person.outcome.programmeId);
    return `${person.name} has a place on ${programme?.shortName ?? "a programme"}, so they are not pooled.`;
  }
  if (person.outcome.kind === "declined") {
    return `Every programme ${person.name} ranked declined them, so they are not pooled.`;
  }
  return `A programme still owes ${person.name} a decision, so they are not pooled yet.`;
}

/**
 * Why this pooled person cannot be invited to this programme, as a sentence,
 * or null when they can.
 *
 * An invitation is an offer of something they did not pick, so it never names
 * a programme they ranked: that programme's own lead already decided. It needs
 * a free place, counting the invitations already picked, and the place a
 * person's current invitation holds is still theirs to keep.
 */
export function inviteProblem(
  form: ApplicationForm,
  tally: TermTally,
  person: TermPerson,
  programmeId: string,
): string | null {
  // The id can come straight from a request, so it has to be one of the
  // form's own programmes before anything is read off it.
  const programme = programmeOf(form, programmeId);
  if (!programme) return "That programme is not on this form.";
  if (programme.closed) {
    return `${programme.shortName} is closed this term, so nobody can be invited to it.`;
  }
  if (person.ranked.includes(programmeId)) {
    return (
      `${person.name} ranked ${programme.shortName}, so its lead has already decided. ` +
      "An invitation is to something they didn’t pick."
    );
  }
  if (placesHeld(person.ranked, person.decision).includes(programmeId)) {
    return `${person.name} already has a place on ${programme.shortName}.`;
  }
  const current = person.decision?.pooledOutcome ?? null;
  if (current?.kind === "invite" && current.programmeId === programmeId) return null;
  const free = freePlaces(form, tally, programmeId);
  if (free === null) {
    return `${programme.shortName} has no number of places set, so nobody can be invited to it yet.`;
  }
  if (free <= 0) return `${programme.shortName} has no free places left.`;
  return null;
}

/** The programmes this pooled person could be invited to right now, in the form's order. */
export function invitableFor(form: ApplicationForm, tally: TermTally, person: TermPerson): string[] {
  return form.programmeIds.filter(
    (programmeId) => inviteProblem(form, tally, person, programmeId) === null,
  );
}

// ---------------------------------------------------------------------------
// Whether the send may go
// ---------------------------------------------------------------------------

/** "1 application", "3 applications". */
export function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A civil date as the screens state it: "Sun 25 Oct". Null when there is none. */
export function civilDateLabel(key: string | null): string | null {
  return key ? (formatRunStartShort(key) ?? null) : null;
}

export type BlockerInput = {
  form: ApplicationForm;
  term: Term;
  now: Date;
  /** This site's own address, which the emails' buttons are built on. */
  appUrl: string;
};

/**
 * Everything that stops decision day being sent, one sentence each, in the
 * order somebody would fix them. Empty means it may go.
 *
 * `readinessFor` is the rule for the decisions themselves. The rest are the
 * things that would make a send wrong even with every decision made: a form
 * still taking applications, an invitation with no day to reply by, an email
 * whose buttons would lead nowhere.
 */
export function sendBlockers({ form, term, now, appUrl }: BlockerInput): string[] {
  const { round } = form;
  if (form.decisionsSentAt) {
    return [
      `Decisions for ${round.label} went out on ${formatRoundDate(form.decisionsSentAt)}. ` +
        "They can’t be sent again.",
    ];
  }
  if (round.archived) return ["This application form is archived, so nothing can be sent from it."];
  if (round.status === "cancelled") {
    return ["This application form was cancelled, so nothing can be sent from it."];
  }
  const window = roundWindowState(round, now);
  if (round.status === "draft" || window.state === "not-yet") {
    return ["Applications have not opened on this form yet."];
  }
  if (window.state === "open") {
    const until = window.closesAt ? ` until ${formatRoundDeadline(window.closesAt)}` : "";
    return [`Applications are still open${until}. Decisions go out after they close.`];
  }

  const blockers: string[] = [];
  const { tally, readiness } = term;
  if (tally.applicants === 0) blockers.push("Nobody has sent an application, so there is nothing to send.");

  for (const programmeId of form.programmeIds) {
    const owed = readiness.toReview[programmeId] ?? 0;
    if (owed === 0) continue;
    const name = programmeOf(form, programmeId)?.shortName ?? programmeId;
    blockers.push(`${name} still owes ${countOf(owed, "application", "applications")} a decision.`);
  }
  // Somebody whose ranking holds nothing the form still carries is counted
  // here too: no programme can owe them a decision, so they are pooled
  // (`outcomeFor`) and wait for an outcome to be picked like anybody else.
  if (readiness.needsOutcome > 0) {
    blockers.push(
      readiness.needsOutcome === 1
        ? "1 pooled person still needs an outcome."
        : `${readiness.needsOutcome} pooled people still need an outcome.`,
    );
  }
  // The decisions' own rule has the last word: if it says no and nothing above
  // said why, the send still does not go.
  if (!readiness.ready && tally.applicants > 0 && blockers.length === 0) {
    blockers.push("Not every application has an outcome yet.");
  }

  // A closed programme is off the form, so nobody can be told they have a
  // place on it or are invited to it.
  for (const programmeId of form.programmeIds) {
    const programme = programmeOf(form, programmeId);
    const counted = own(tally.programmes, programmeId);
    if (!programme?.closed || !counted) continue;
    if (counted.placed > 0) {
      blockers.push(
        `${programme.shortName} is closed, and ${countOf(counted.placed, "person has", "people have")} a place on it.`,
      );
    }
    if (counted.invited > 0) {
      blockers.push(
        `${programme.shortName} is closed, and ${countOf(counted.invited, "person is", "people are")} invited to it.`,
      );
    }
  }

  if (tally.outcomes.invited > 0) {
    const replyBy = form.invitationReplyBy;
    if (!replyBy) {
      blockers.push("Invitations need a reply-by date. Set it in the application form.");
    } else if (replyBy < londonDateKey(now)) {
      blockers.push(
        `The reply-by date for invitations, ${civilDateLabel(replyBy)}, has passed. ` +
          "Move it in the application form.",
      );
    }
  }
  if (!appUrl.trim()) {
    blockers.push(
      "This copy of the site doesn’t know its own address, so the buttons in the emails would lead nowhere.",
    );
  }
  return blockers;
}
