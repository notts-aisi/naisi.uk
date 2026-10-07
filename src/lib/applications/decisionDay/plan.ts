import { formatRoundDate, formatRoundDeadline, roundWindowState } from "@/lib/admissions/window";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import {
  freePlaces,
  hasBeenTold,
  isInTerm,
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
import { emailStanding, type EmailStanding } from "./emailState";
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
 * NOBODY READS THEIR OWN APPLICATION ON A COMMITTEE SCREEN. Both screens are
 * opened by admins, and an admin can have applied. So the term comes in two
 * readings ({@link termsFor}): `shown`, which leaves the viewer's own
 * application out of every list and every count, and `whole`, which is
 * everybody. A screen lists and counts from `shown` and from nothing else.
 * `whole` is for the two things that have to see everybody: the send, which
 * tells the viewer on decision day with everybody else, and the question of
 * whether the send may go ({@link sendBlockersFor}).
 *
 * Pure, with no server import, so the routes, the pages and the tests all run
 * the same code against the same shapes.
 */

type Sent = Pick<
  ApplicationDoc,
  "uid" | "displayName" | "email" | "status" | "sent" | "result" | "invitation" | "attendance"
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
  /**
   * People decision day told who have since left the term: they gave a place
   * back, or said no thanks to an invitation. By name. They are in no count
   * of the term and nothing is planned for them. They are kept for one
   * reader, the record of what was sent ({@link everybodyAddressed}), which
   * a reply must not be able to change.
   */
  left: TermPerson[];
};

// Who is in the term is the contract's rule, in one place. It is handed on
// from here because the decision-day modules beside this one ask it of this
// file.
export { isInTerm };

const byName = (a: TermPerson, b: TermPerson) =>
  a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid);

function firstWord(text: string): string {
  return text.trim().split(/\s+/)[0] ?? "";
}

/** What an email calls somebody: the name they go by, or the first word of their name. */
export function firstNameOf(application: Pick<ApplicationDoc, "displayName" | "sent">): string {
  const preferred = application.sent?.aboutYou.preferredName.trim() ?? "";
  return preferred || firstWord(application.displayName);
}

export function planTerm(
  form: ApplicationForm,
  applications: readonly Sent[],
  decisions: ReadonlyMap<string, DecisionDoc>,
): Term {
  const invitable = new Set(form.programmeIds);
  const people: TermPerson[] = [];
  const left: TermPerson[] = [];
  /** Each person's own application, for what they were told and have answered. */
  const documents = new Map<string, Sent>();
  for (const application of applications) {
    if (!application.sent) continue;
    const inTerm = isInTerm(application);
    // Out of the term and never told: nothing was planned for them and
    // nothing was sent to them, so they are in neither list.
    if (!inTerm && !hasBeenTold(application)) continue;
    if (inTerm) documents.set(application.uid, application);
    const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
    const decision = decisions.get(application.uid) ?? null;
    const preferred = application.sent.aboutYou.preferredName.trim();
    const name = application.displayName.trim() || preferred || "Unnamed applicant";
    (inTerm ? people : left).push({
      uid: application.uid,
      name,
      firstName: firstNameOf(application),
      email: application.email,
      ranked,
      decision,
      outcome: outcomeFor(ranked, decision, invitable),
      status: application.status,
      result: application.result,
    });
  }
  // By name, then by uid, so two reads of the same term list people the same way.
  people.sort(byName);
  left.sort(byName);
  const tally = tallyTerm(
    form,
    people.map((person) => ({
      uid: person.uid,
      ranked: person.ranked,
      decision: person.decision,
      // With the application, so a place taken or given up by a reply is counted.
      application: documents.get(person.uid),
    })),
  );
  return { people, tally, readiness: readinessFor(tally), left };
}

/**
 * EVERYBODY DECISION DAY HAS TOLD OR HAS STILL TO TELL, by name: the people
 * in the term, and anybody already told who has since left it.
 *
 * WHAT WAS SENT IS A RECORD. A person's `result`, and what became of its
 * email, are written once by the send and no reply changes them. A reply
 * does take its owner out of the term, so anything that reports the send
 * from `term.people` alone shrinks each time somebody gives a place back:
 * "7 people applied" becomes 5. The page that reports the send therefore
 * lists and counts from here, and reads each person through {@link toldTo},
 * where a published result wins.
 *
 * Nothing that PLANS reads this: places, readiness, who is still to be told
 * and which emails a press can take up are all of the people in the term.
 */
export function everybodyAddressed(term: Term): TermPerson[] {
  return [...term.people, ...term.left].sort(byName);
}

/**
 * Whether the person looking has an application of their own on this form,
 * which the committee's screens leave out. `told` once decision day has
 * reached them: from then on their outcome is fixed, and they read it on
 * their own page like anybody else.
 */
export type OwnApplication = "none" | "not-told" | "told";

export type TermViews = {
  /**
   * The term as this viewer is shown it. Their own application is in no list
   * and no count here, so nothing built from this can say where it stands.
   */
  shown: Term;
  /**
   * Everybody, the viewer included. For the send itself and for whether it
   * may go, and for nothing a screen lists or counts.
   */
  whole: Term;
  own: OwnApplication;
};

/**
 * THE ONE PLACE THE VIEWER'S OWN APPLICATION IS LEFT OUT of what pooled
 * applicants and decision day show. `viewerUid` is whoever the screen is
 * being built for, and it has to be somebody: a term read for nobody would
 * be the whole term, so that is refused loudly here and never guessed.
 *
 * The viewer's own application is dropped before `planTerm` runs, so it is
 * out of the people, out of the tally and out of every count made from
 * either. For somebody who has not applied, the two readings are one.
 */
export function termsFor(
  form: ApplicationForm,
  applications: readonly Sent[],
  decisions: ReadonlyMap<string, DecisionDoc>,
  viewerUid: string,
): TermViews {
  if (typeof viewerUid !== "string" || viewerUid === "") {
    throw new Error("A committee screen is built for the person looking at it: no viewer was given.");
  }
  const whole = planTerm(form, applications, decisions);
  const mine = [...whole.people, ...whole.left].find((person) => person.uid === viewerUid);
  if (!mine) return { shown: whole, whole, own: "none" };
  const shown = planTerm(
    form,
    applications.filter((application) => application.uid !== viewerUid),
    decisions,
  );
  return { shown, whole, own: mine.result ? "told" : "not-told" };
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

/** People already told whose email stands a given way right now. */
export function toldWithEmail(term: Term, standing: EmailStanding, now: Date): TermPerson[] {
  return term.people.filter(
    (person) => person.result !== null && emailStanding(person.result, now) === standing,
  );
}

/**
 * People already told whose email a press of Send takes up: it is owed, and
 * their application has an address to send it to. Somebody owed an email with
 * no address is not in this list, because no press can do anything for them.
 */
export function owedEmails(term: Term, now: Date): TermPerson[] {
  return toldWithEmail(term, "owed", now).filter((person) => (person.email ?? "").trim() !== "");
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

const NOBODY_APPLIED = "Nobody has sent an application, so there is nothing to send.";

/**
 * What holds the send when the only thing in its way is about the viewer's
 * own application. It says that much and no more: what the application
 * needs would say where it stands, which is not its author's to read before
 * decision day.
 */
export const OWN_APPLICATION_HOLDS_THE_SEND =
  "Your own application still needs something before decisions can go out. " +
  "Another admin has to deal with it: what it needs is not shown to you.";

const NO_SITE_ADDRESS =
  "This copy of the site doesn’t know its own address, so the buttons in the emails would lead nowhere.";

/** Why nothing at all can be sent from this form, or null. */
function formClosedToSending(form: ApplicationForm): string | null {
  if (form.round.archived) return "This application form is archived, so nothing can be sent from it.";
  if (form.round.status === "cancelled") {
    return "This application form was cancelled, so nothing can be sent from it.";
  }
  return null;
}

/**
 * Where a form stands on its test of the decision emails: none sent, one sent
 * before the wording last changed, or one that still counts. Worked out in
 * `./tested` (`testStanding`), which is not imported here so that this module
 * stays free of anything a browser cannot load.
 */
export type TestState = "none" | "stale" | "fresh";

/**
 * The sentence that holds a press of Send for want of a test, or null when a
 * test still counts.
 *
 * ANYTHING BUT `fresh` HOLDS IT. A caller that hands over nothing, or a word
 * this does not know, is refused: the send is never let through by an answer
 * nobody gave.
 */
export function testBlocker(test: TestState | undefined): string | null {
  if (test === "fresh") return null;
  if (test === "stale") {
    return (
      "A decision email’s wording has changed since the last test. " +
      "Send yourself a test again before you send."
    );
  }
  return "Nobody has sent themselves a test of these emails yet. Send yourself one before you send.";
}

export type BlockerInput = {
  form: ApplicationForm;
  term: Term;
  now: Date;
  /** This site's own address, which the emails' buttons are built on. */
  appUrl: string;
  /** `testStanding(form).state` from `./tested`. */
  test: TestState;
};

/**
 * Everything that stops decision day being sent, one sentence each, in the
 * order somebody would fix them. Empty means it may go.
 *
 * `readinessFor` is the rule for the decisions themselves. The rest are the
 * things that would make a send wrong even with every decision made: a form
 * still taking applications, an invitation with no day to reply by, an email
 * whose buttons would lead nowhere, and emails no admin has sent themselves a
 * test of as they are worded now. The test comes last because it is the last
 * thing to do: a test is the first person's real email, so there has to be
 * somebody in a group, and an address for its buttons, before one can go.
 */
export function sendBlockers({ form, term, now, appUrl, test }: BlockerInput): string[] {
  const { round } = form;
  if (form.decisionsSentAt) {
    return [
      `Decisions for ${round.label} went out on ${formatRoundDate(form.decisionsSentAt)}. ` +
        "They can’t be sent again.",
    ];
  }
  const closed = formClosedToSending(form);
  if (closed) return [closed];
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
  if (tally.applicants === 0) blockers.push(NOBODY_APPLIED);

  for (const programmeId of form.programmeIds) {
    const owed = own(readiness.toReview, programmeId) ?? 0;
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
  if (!appUrl.trim()) blockers.push(NO_SITE_ADDRESS);
  const untested = testBlocker(test);
  if (untested) blockers.push(untested);
  return blockers;
}

/**
 * What stops the send, AS ONE VIEWER MAY READ IT. The page and the press both
 * ask this, so they cannot disagree.
 *
 * WHETHER the send may go is decided by everybody: an application with no
 * outcome holds it whoever is looking, the viewer's own included. WHAT IS
 * SAID about it is decided by what the viewer is shown. Each sentence is
 * worked out from `shown`, which holds nothing of the viewer's own, so a
 * count in it agrees with the lists beside it. When everything the viewer
 * can see is ready and the send is still held, one sentence says their own
 * application is why, and nothing about what it needs.
 *
 * For somebody who has not applied the two readings are one, and this is
 * {@link sendBlockers} exactly.
 */
export function sendBlockersFor({
  form,
  shown,
  whole,
  now,
  appUrl,
  test,
}: Omit<BlockerInput, "term"> & Pick<TermViews, "shown" | "whole">): string[] {
  const held = sendBlockers({ form, term: whole, now, appUrl, test });
  if (held.length === 0) return [];
  const visible = sendBlockers({ form, term: shown, now, appUrl, test }).filter(
    // With the viewer's own application left out there can seem to be nobody,
    // which is not what holds a term somebody has applied to.
    (sentence) => sentence !== NOBODY_APPLIED || whole.tally.applicants === 0,
  );
  return visible.length > 0 ? visible : [OWN_APPLICATION_HOLDS_THE_SEND];
}

/**
 * What stops an email that is still owed from being sent, one sentence each.
 *
 * Much less than {@link sendBlockers}: the person has their result already,
 * so whether the rest of the term is ready has nothing to do with them, and
 * neither has whether the term is marked as sent. Only the things that would
 * make the email itself wrong are asked: the form's standing, the site's own
 * address, and the test. An owed email is a decision email like any other, so
 * it waits for a test of the wording as it is now, the same as the first
 * press did.
 */
export function owedBlockers({
  form,
  appUrl,
  test,
}: Pick<BlockerInput, "form" | "appUrl" | "test">): string[] {
  const blockers: string[] = [];
  const closed = formClosedToSending(form);
  if (closed) blockers.push(closed);
  if (!appUrl.trim()) blockers.push(NO_SITE_ADDRESS);
  const untested = testBlocker(test);
  if (untested) blockers.push(untested);
  return blockers;
}
