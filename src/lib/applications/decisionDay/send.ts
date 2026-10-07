import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { formatRoundDate } from "@/lib/admissions/window";
import { resolveEmailAudience } from "@/lib/email/audience";
import { dispatchSends } from "@/lib/email/dispatch";
import { COURSE_AUDIT_COLLECTION, COURSE_AUDIT_LIMITS } from "@/lib/firestore/courseAudit";
import { approveWaitingAccount, holdsAcceptance } from "../accounts/approve";
import { outcomeFor } from "../decisions";
import { own } from "../keys";
import type { ProgrammeEmailKind, ResultEmailState } from "../model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseDecision,
  normaliseForm,
  type ApplicationForm,
} from "../normalise";
import { applicationRef, formRef, loadForm } from "../repo";
import { rankedProgrammes } from "../sections";
import { decisionRef } from "../staffRepo";
import { invitationRemindersArmed } from "./armed";
import { emailsLabel, placesDetail, pooledDetail } from "./boardWords";
import { SEND_APPROVES_WAITING_ACCOUNTS } from "./built";
import { sendDecisionEmail, type Delivery } from "./deliver";
import {
  DECISION_REPLY_TO,
  composeDecisionEmail,
  type DecisionEmail,
  type DecisionEmailKind,
  type DecisionEmailOutcome,
} from "./emailCopy";
import { emailStanding, handoverAfter } from "./emailState";
import { appUrl, emailContext, type EmailContext } from "./letters";
import { loadAccountRoles, loadFirstNames } from "./people";
import {
  countOf,
  emailCount,
  emailOutcomeFor,
  isInTerm,
  owedBlockers,
  owedEmails,
  publicationFor,
  samePublication,
  sendBlockers,
  toldTo,
  toldWithEmail,
  unpublished,
  type Publication,
  type Term,
  type TermPerson,
} from "./plan";
import { DECISIONS_SENT_AUDIT_KIND, programmeOf } from "./programmes";
import { loadTerm } from "./term";
import type { EmailPreview, ReadinessRow, SendBoard, SendGroup, SendReport } from "./views";

/**
 * DECISION DAY: the one send that tells every applicant what happened.
 *
 * Until this runs, nothing an applicant can see has changed since they
 * applied. This module is the only writer of `result` and `invitation` on an
 * applicant's own document, and the only sender of the three emails.
 *
 * ## The order, per person, and why it is that order
 *
 *  1. PUBLISH, in a transaction: write the result and the new status on their
 *     own document, and move the form's counters with it. A person who already
 *     has a result is skipped, so a second press, or a press that picks up
 *     after one that was cut short, never changes what somebody was told.
 *  2. THEN EMAIL, after the commit. The email's buttons open the person's own
 *     application page, so the result has to be there before the email is.
 *
 * ## The email is recorded on the result, and that record is the lock
 *
 * `result.email` says what became of the email (`ResultEmailState`, read
 * through `./emailState`). The same transaction that publishes somebody also
 * takes their email up (`sending`), and when the mail door has answered the
 * result is settled: `sent`, `held`, `suppressed`, or `owed` when the attempt
 * is known not to have handed anything over. A declined application that is
 * not emailed is published as `not-sent`.
 *
 * A LATER PRESS SENDS WHAT IS OWED, AND NOTHING ELSE. It takes an owed email
 * up in a transaction that requires the state to be `owed`, so two presses
 * racing cannot both hold it, and an email that was sent, held, suppressed or
 * deliberately not sent is never sent again. An attempt nobody can vouch for
 * (the conversation with the mail provider broke off with no answer, or the
 * press died holding the email) is `unconfirmed` and is left alone too: the
 * page names the person instead. So nobody is emailed their decision twice.
 *
 * A failed email does not undo the result: the person can already see it on
 * the site.
 *
 * ## Two presses
 *
 * The page's Send publishes everybody not yet told and also takes up the
 * emails still owed from an earlier press. `owedOnly` is the other press: it
 * tells nobody new and only sends what is owed, so it does not wait for the
 * rest of the term to be ready and still works once the term is marked sent.
 *
 * ## A press is bounded, and can be pressed again
 *
 * A request has about a minute. Each person costs two small transactions and
 * one email, and `dispatchSends` runs six at a time, so a full press of
 * {@link MAX_PEOPLE_PER_PRESS} people is 25 rounds at about 1.35s each on a
 * bad day: roughly 34 seconds. A term bigger than that takes a second press,
 * which carries on where the first stopped. Raising the number means redoing
 * that sum (see `src/lib/email/dispatch.ts`).
 *
 * ## When the mail is not going out, it stops
 *
 * The first email of a press goes on its own before any other person is
 * published. If it cannot be sent, the press stops there, with one person
 * holding a result and no email instead of the whole term. Three failures in
 * a row later on stop it the same way.
 *
 * ## Accepting somebody approves an account that is still waiting
 *
 * A person told they are in has their account approved in the same press,
 * straight after their result is written and before their email goes, by the
 * one function that does it (`../accounts/approve`). It approves only a
 * waiting account, only on an acceptance, and only in an admin's name, and
 * it checks all three itself. Every press also tries again for anybody an
 * earlier press told whose approval did not go through. A member, a committee
 * member, an admin and a refused account are left exactly as they are, and a
 * refused one is named on the page. No welcome email is sent from here: the
 * decision email is the one they get.
 *
 * ## What marks the term as sent
 *
 * `decisionsSentAt` is stamped on the form only once everybody in the term has
 * a result, in the same transaction as the audit row for the press that
 * finished it. A press that reaches only some people leaves the form unsent
 * and says so. An email still owed does not hold the stamp back: everybody has
 * been told on the site, and the owed emails stay listed until they go.
 */

/** The most people one press reaches. See the module comment for the sum. */
export const MAX_PEOPLE_PER_PRESS = 150;

/** After this long, a press stops starting new people and reports what is left. */
const PRESS_BUDGET_MS = 40_000;

/** This many emails failing one after another stops the press. */
const FAILURES_IN_A_ROW = 3;

/**
 * An email whose attempt is known not to have handed anything over is tried
 * once more before it counts as failed. One that may have gone is not.
 */
const EMAIL_ATTEMPTS = 2;

/** How long to wait before that second attempt. */
const RETRY_AFTER_MS = 400;

/** How many times the record of what became of an email is written before giving up. */
const SETTLE_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// The emails, for a preview, a test and the send alike
// ---------------------------------------------------------------------------

function emailFor(
  context: EmailContext,
  person: TermPerson,
  told: Publication,
  emailDeclined: boolean,
): DecisionEmail | null {
  const outcome = emailOutcomeFor(told, emailDeclined);
  if (!outcome) return null;
  return composeDecisionEmail({
    outcome,
    firstName: person.firstName,
    form: context.form,
    ranked: person.ranked,
    leadNames: context.leadNames,
    replyBy: context.replyBy,
    links: context.links,
  });
}

/** The people in one decision-day group, by name: published or about to be. */
function inGroup(term: Term, kind: Publication["kind"]): TermPerson[] {
  return term.people.filter((person) => toldTo(person)?.kind === kind);
}

const GROUP_OF: Record<DecisionEmailKind, Publication["kind"]> = {
  accepted: "accepted",
  invitation: "invited",
  "no-offer": "no-offer",
};

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function previewOf(person: TermPerson, email: DecisionEmail): EmailPreview {
  return {
    kind: email.kind,
    to: person.name,
    subject: email.subject,
    greeting: email.greeting,
    paragraphs: email.paragraphs,
    buttons: email.buttons.map((button) => ({ label: button.label, look: button.look })),
    signOff: { name: email.signOff.name, role: email.signOff.role },
  };
}

function groupOf(context: EmailContext, term: Term, kind: Publication["kind"]): SendGroup {
  const members = inGroup(term, kind);
  const first = members[0];
  const told = first ? toldTo(first) : null;
  const email = first && told ? emailFor(context, first, told, false) : null;
  return {
    people: members.map((person) => ({ uid: person.uid, name: person.name })),
    preview: first && email ? previewOf(first, email) : null,
    // "You're in" and an invitation are worded by the programme they are
    // about. "No offer this time" is the form's own, so it names none.
    wordingProgrammeId: first && email && told && kind !== "no-offer" ? told.programmeId : null,
  };
}

function readinessRows(context: EmailContext, term: Term): ReadinessRow[] {
  const { form } = context;
  const { tally, readiness } = term;
  const rows: ReadinessRow[] = form.programmeIds.map((programmeId) => {
    const settings = programmeOf(form, programmeId);
    const counted = own(tally.programmes, programmeId);
    const owed = readiness.toReview[programmeId] ?? 0;
    return {
      key: programmeId,
      title: settings?.shortName ?? programmeId,
      owner: context.leadNames[programmeId] || "No lead yet",
      ready: owed === 0,
      status:
        owed === 0
          ? "Every application has a decision"
          : `${countOf(owed, "application still needs", "applications still need")} a decision`,
      detail: placesDetail(settings?.places ?? null, counted?.placed ?? 0, counted?.invited ?? 0),
    };
  });
  const waiting = readiness.needsOutcome;
  rows.push({
    key: "pooled",
    title: "Pooled applicants",
    owner: "Committee",
    ready: waiting === 0,
    status:
      waiting === 0
        ? "Every pooled person has an outcome"
        : `${countOf(waiting, "pooled person still needs", "pooled people still need")} an outcome`,
    detail: pooledDetail(tally.outcomes.invited, tally.outcomes.noOffer),
  });
  return rows;
}

export async function buildSendBoard(
  db: Firestore,
  form: ApplicationForm,
  now: Date,
): Promise<SendBoard> {
  const [{ term }, context] = await Promise.all([loadTerm(db, form), emailContext(db, form)]);
  const accepted = groupOf(context, term, "accepted");
  const [accountRoles, sender, remindsDaily] = await Promise.all([
    loadAccountRoles(
      db,
      accepted.people.map((person) => person.uid),
    ),
    loadFirstNames(db, form.decisionsSentByUid ? [form.decisionsSentByUid] : []),
    invitationRemindersArmed(db, now),
  ]);
  const withRole = (role: string) => accepted.people.filter((person) => accountRoles.get(person.uid) === role);
  const todo = unpublished(term).filter((person) => publicationFor(person.outcome) !== null);
  const listed = (people: readonly TermPerson[]) =>
    people.map((person) => ({ uid: person.uid, name: person.name }));
  const owed = toldWithEmail(term, "owed", now);
  const retryable = owedEmails(term, now);

  return {
    roundId: form.round.id,
    termLabel: form.round.label,
    today: formatRoundDate(now),
    applied: term.tally.applicants,
    readiness: readinessRows(context, term),
    blockers: sendBlockers({ form, term, now, appUrl: appUrl() }),
    sentOn: form.decisionsSentAt ? formatRoundDate(form.decisionsSentAt) : null,
    sentBy: form.decisionsSentByUid ? (sender.get(form.decisionsSentByUid) ?? null) : null,
    published: term.people.filter((person) => person.result !== null).length,
    accepted,
    invited: groupOf(context, term, "invited"),
    noOffer: groupOf(context, term, "no-offer"),
    declined: { count: inGroup(term, "declined").length },
    replyBy: context.replyBy,
    remindsDaily,
    accountsWaiting: withRole("pending").length,
    accountsRefused: withRole("rejected"),
    fromName: process.env.SMTP_FROM_NAME ?? "NAISI",
    replyTo: DECISION_REPLY_TO,
    emailsEveryone: resolveEmailAudience(process.env).mode === "everyone",
    pending: {
      people: todo.length,
      emails: emailCount(todo, false),
      declined: todo.filter((person) => person.outcome.kind === "declined").length,
      perPress: MAX_PEOPLE_PER_PRESS,
    },
    owed: {
      people: listed(retryable),
      noAddress: listed(owed.filter((person) => !retryable.includes(person))),
      unconfirmed: listed(toldWithEmail(term, "unconfirmed", now)),
      inFlight: toldWithEmail(term, "in-flight", now).length,
      blockers: owedBlockers({ form, appUrl: appUrl() }),
    },
  };
}

// ---------------------------------------------------------------------------
// A test, to the admin's own address
// ---------------------------------------------------------------------------

export type TestSend =
  | { ok: true; delivery: Delivery; subject: string }
  | { ok: false; status: 404 | 409 | 502; error: string };

/**
 * Send one of the three emails to the admin who asked, exactly as the first
 * person in that group would get it. It tells no applicant anything and writes
 * nothing.
 */
export async function sendTestEmail(
  db: Firestore,
  actor: { uid: string; email: string },
  roundId: string,
  kind: DecisionEmailKind,
): Promise<TestSend> {
  const form = await loadForm(db, roundId);
  if (!form) return { ok: false, status: 404, error: "There is no application form here." };
  const [{ term }, context] = await Promise.all([loadTerm(db, form), emailContext(db, form)]);
  const first = inGroup(term, GROUP_OF[kind])[0];
  const told = first ? toldTo(first) : null;
  const email = first && told ? emailFor(context, first, told, false) : null;
  if (!email) {
    return {
      ok: false,
      status: 409,
      error: "Nobody is in that group yet, so there is no email to test.",
    };
  }
  return rehearse(actor, roundId, email);
}

/**
 * Hand one composed email to the person who asked for it, marked as a test.
 * The only address a test ever goes to is the one on the asker's own session:
 * no caller passes one in from a request.
 */
async function rehearse(
  actor: { uid: string; email: string },
  roundId: string,
  email: DecisionEmail,
): Promise<TestSend> {
  try {
    const delivery = await sendDecisionEmail({
      to: actor.email,
      email,
      roundId,
      actorUid: actor.uid,
      test: true,
    });
    return { ok: true, delivery, subject: email.subject };
  } catch (err) {
    console.error("[decision day] test send failed", roundId, err);
    return { ok: false, status: 502, error: "That test could not be sent. Try again in a minute." };
  }
}

/**
 * Send one programme's own wording of one of its emails to whoever asked,
 * from that programme's settings page. It is addressed to them by their own
 * name, because the page is used long before anybody is in a group: there may
 * be no applicant to borrow yet, and nobody's name is needed to read wording.
 *
 * It tells no applicant anything and writes nothing. Who may ask is the
 * route's to decide: this function sends to the address it is handed.
 */
export async function sendProgrammeTestEmail(
  db: Firestore,
  actor: { uid: string; email: string; firstName: string },
  form: ApplicationForm,
  programmeId: string,
  kind: ProgrammeEmailKind,
): Promise<TestSend> {
  const none: TestSend = { ok: false, status: 404, error: "That programme is not on this form." };
  if (!programmeOf(form, programmeId)) return none;
  const context = await emailContext(db, form);
  const outcome: DecisionEmailOutcome =
    kind === "accepted"
      ? { kind: "accepted", programmeId }
      : kind === "invitation"
        ? { kind: "invited", programmeId }
        : { kind: "declined" };
  const email = composeDecisionEmail({
    outcome,
    firstName: actor.firstName,
    form,
    // An invitation is to something the person did not pick, so the test of
    // one ranks nothing. The other two are about this programme itself.
    ranked: kind === "invitation" ? [] : [programmeId],
    leadNames: context.leadNames,
    replyBy: context.replyBy,
    links: context.links,
  });
  if (!email) return none;
  return rehearse(actor, form.round.id, email);
}

// ---------------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------------

export type SendRequest = {
  /** How many emails the page said this press would send. */
  emails: number;
  /** The "Email them" switch on the declined group. */
  emailDeclined: boolean;
  /**
   * True for the press that tells nobody new and only sends the emails still
   * owed to people already told.
   */
  owedOnly?: boolean;
};

export type SendOutcome =
  | { ok: true; report: SendReport }
  | { ok: false; status: 404 | 409; error: string };

type Letter = {
  person: TermPerson;
  told: Publication;
  /** Null when this outcome is not emailed. */
  email: DecisionEmail | null;
  /** True when an earlier press told them and only their email is left. */
  owed: boolean;
};

/** What became of one email this press took up. */
type Fate = Delivery | "failed" | "unconfirmed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The sentence the audit log keeps for one press. Cut at the log's own limit. */
export function auditDetail(
  termLabel: string,
  report: SendReport,
  failedUids: readonly string[],
  unconfirmedUids: readonly string[] = [],
): string {
  // The press that only sends what is owed publishes nothing, so it does not
  // say it did; the other press always says how many it published.
  const did: string[] = [];
  if (!report.owedOnly || report.published > 0) {
    did.push(`Published ${countOf(report.published, "decision", "decisions")}`);
  }
  if (report.owedOnly || report.retried > 0) {
    did.push(`${did.length > 0 ? "took" : "Took"} up ${countOf(report.retried, "owed email", "owed emails")}`);
  }
  const parts = [
    `${did.join(" and ")} for ${termLabel}:`,
    `${report.emailed} emailed, ${report.held} held, ${report.suppressed} suppressed,`,
    `${report.failed} failed, ${report.unconfirmed} unconfirmed, ${report.notEmailed} not emailed.`,
  ];
  if (!report.owedOnly && report.skipped + report.changed + report.notReached > 0) {
    parts.push(
      `${report.skipped} already told, ${report.changed} changed, ${report.notReached} not reached.`,
    );
  }
  if (report.stopped === "emails-failing") parts.push("Stopped because emails were failing.");
  if (report.stopped === "out-of-time") parts.push("Stopped when the press ran out of time.");
  if (!report.owedOnly) {
    parts.push(report.complete ? "Everybody in the term now has their result." : "The term is not finished.");
  }
  if (report.accountsApproved > 0) {
    parts.push(`Approved ${countOf(report.accountsApproved, "waiting account", "waiting accounts")}.`);
  }
  if (failedUids.length > 0) parts.push(`Email still owed to: ${failedUids.join(", ")}.`);
  if (unconfirmedUids.length > 0) parts.push(`Email unconfirmed for: ${unconfirmedUids.join(", ")}.`);
  return parts.join(" ").slice(0, COURSE_AUDIT_LIMITS.detail);
}

export async function runDecisionDay(
  db: Firestore,
  actor: { uid: string; displayName?: string },
  roundId: string,
  request: SendRequest,
  now: () => Date = () => new Date(),
): Promise<SendOutcome> {
  const form = await loadForm(db, roundId);
  if (!form) return { ok: false, status: 404, error: "There is no application form here." };

  const owedOnly = request.owedOnly === true;
  const startedAt = now();
  const { term, applications } = await loadTerm(db, form);
  const blockers = owedOnly
    ? owedBlockers({ form, appUrl: appUrl() })
    : sendBlockers({ form, term, now: startedAt, appUrl: appUrl() });
  if (blockers.length > 0) return { ok: false, status: 409, error: blockers.join(" ") };

  // With no blocker, everybody not yet told has an outcome that can be
  // published. The press that only sends what is owed tells nobody new.
  const todo = owedOnly ? [] : unpublished(term);
  const owed = owedEmails(term, startedAt);
  const expected = emailCount(todo, request.emailDeclined) + owed.length;
  if (expected !== request.emails) {
    return {
      ok: false,
      status: 409,
      error:
        `The decisions have changed since this page loaded: this would now send ${emailsLabel(expected)}, ` +
        `not ${request.emails}. Reload the page and check again.`,
    };
  }

  const context = await emailContext(db, form);
  // The emails still owed go first: those people have waited longest.
  const lined: Letter[] = [];
  for (const person of owed) {
    const told = toldTo(person);
    // An owed email is owed whatever the switch says now: it was earned when
    // the person was told.
    if (told) lined.push({ person, told, email: emailFor(context, person, told, true), owed: true });
  }
  for (const person of todo) {
    const told = publicationFor(person.outcome);
    if (told) {
      lined.push({ person, told, email: emailFor(context, person, told, request.emailDeclined), owed: false });
    }
  }
  const letters = lined.slice(0, MAX_PEOPLE_PER_PRESS);

  const report: SendReport = {
    owedOnly,
    published: 0,
    retried: 0,
    emailed: 0,
    held: 0,
    suppressed: 0,
    failed: 0,
    unconfirmed: 0,
    notEmailed: 0,
    skipped: term.people.length - lined.length,
    changed: 0,
    notReached: lined.length - letters.length,
    failedNames: [],
    unconfirmedNames: [],
    accountsApproved: 0,
    accountsFailed: [],
    accountsRefused: [],
    stopped: null,
    complete: false,
  };

  // ACCEPTING SOMEBODY APPROVES AN ACCOUNT THAT IS STILL WAITING. Two groups:
  // the people this press tells they are in, each approved straight after
  // their result is written and before their email goes; and people an
  // earlier press told, whose approval did not go through then. The roles are
  // read once here to know who to try. They decide nothing: the function that
  // approves reads everything again inside its own transaction.
  const toldBefore = term.people.filter(
    (person) => person.result !== null && holdsAcceptance(applications.get(person.uid) ?? null),
  );
  const newlyIn = letters
    .filter((letter) => !letter.owed && letter.told.kind === "accepted")
    .map((letter) => letter.person);
  const roles = SEND_APPROVES_WAITING_ACCOUNTS
    ? await loadAccountRoles(db, [...toldBefore, ...newlyIn].map((person) => person.uid))
    : new Map<string, string>();

  /** Approve one accepted person's account if it is waiting. Never rejects. */
  const approve = async (person: TermPerson): Promise<void> => {
    const role = roles.get(person.uid);
    if (role === "rejected") {
      // Refused earlier: left exactly as it is, and named for somebody to look at.
      report.accountsRefused.push(person.name);
      return;
    }
    if (role !== "pending") return;
    try {
      const outcome = await approveWaitingAccount(db, {
        uid: person.uid,
        roundId,
        approvedByUid: actor.uid,
      });
      if (outcome.approved) report.accountsApproved += 1;
      else if (outcome.why === "not-waiting") {
        // Somebody settled it in the meantime. Only a refusal is worth a word.
        if (outcome.role === "rejected") report.accountsRefused.push(person.name);
      } else {
        report.accountsFailed.push(person.name);
      }
    } catch (err) {
      console.error("[decision day] could not approve an account", roundId, person.uid, err);
      report.accountsFailed.push(person.name);
    }
  };

  const failedUids: string[] = [];
  const unconfirmedUids: string[] = [];
  const invitable = new Set(form.programmeIds);
  let failuresInARow = 0;

  type Published = { did: "published"; to: string | null } | { did: "skipped" } | { did: "changed" };

  /**
   * Write one person's result, unless they have one or their decision moved.
   * The same write takes their email up, so no other press can send it.
   */
  const publish = (letter: Letter): Promise<Published> =>
    db.runTransaction<Published>(async (tx) => {
      const [applicationSnap, decisionSnap] = await Promise.all([
        tx.get(applicationRef(db, roundId, letter.person.uid)),
        tx.get(decisionRef(db, roundId, letter.person.uid)),
      ]);
      const application = applicationSnap.exists
        ? normaliseApplication(applicationSnap.id, applicationSnap.data(), form.round.availabilityGrid)
        : null;
      if (!application || !application.sent || !isInTerm(application)) return { did: "changed" };
      if (application.result) return { did: "skipped" };
      if (application.status !== "submitted") return { did: "changed" };

      // What the decisions say NOW has to be what this press set out to tell
      // them. A lead who changed their mind a moment ago is not overruled, and
      // the person is left for a press that has seen the change.
      const decision = decisionSnap.exists
        ? normaliseDecision(decisionSnap.id, decisionSnap.data())
        : null;
      const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
      const fresh = publicationFor(outcomeFor(ranked, decision, invitable));
      if (!samePublication(fresh, letter.told)) return { did: "changed" };

      // The address is the one on their application as it is committed with.
      const to = (application.email ?? "").trim() || null;
      // No email earned: settled as deliberately not sent. An email with
      // nowhere to go is owed. Otherwise this press holds it from here.
      const email: ResultEmailState = !letter.email ? "not-sent" : to ? "sending" : "owed";
      const { kind, programmeId } = letter.told;
      tx.update(applicationRef(db, roundId, letter.person.uid), {
        status: kind,
        result: {
          kind,
          programmeId,
          publishedAt: FieldValue.serverTimestamp(),
          email,
          emailedAt: null,
          emailClaimedAt: email === "sending" ? FieldValue.serverTimestamp() : null,
        },
        ...(kind === "invited" && programmeId && form.invitationReplyBy
          ? {
              invitation: {
                programmeId,
                replyBy: form.invitationReplyBy,
                response: null,
                respondedAt: null,
                lastReminderOn: null,
              },
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // The counters move with the status, in the same transaction.
      tx.update(formRef(db, roundId), {
        "applicationCounts.submitted": FieldValue.increment(-1),
        [`applicationCounts.${kind}`]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { did: "published", to };
    });

  type Claimed = { did: "claimed"; to: string } | { did: "skipped" };

  /**
   * Take up an email an earlier press left owed. Only `owed` can be taken, and
   * it is read and written in one transaction, so of two presses racing for
   * the same email exactly one gets it.
   */
  const claim = (letter: Letter): Promise<Claimed> =>
    db.runTransaction<Claimed>(async (tx) => {
      const ref = applicationRef(db, roundId, letter.person.uid);
      const snap = await tx.get(ref);
      const application = snap.exists
        ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)
        : null;
      if (!application || !isInTerm(application) || !application.result) return { did: "skipped" };
      if (emailStanding(application.result, now()) !== "owed") return { did: "skipped" };
      // The email was composed from what this press read. It goes only if
      // that is still what the person was told.
      const told = { kind: application.result.kind, programmeId: application.result.programmeId };
      if (!samePublication(told, letter.told)) return { did: "skipped" };
      const to = (application.email ?? "").trim();
      if (!to) return { did: "skipped" };
      tx.update(ref, {
        "result.email": "sending",
        "result.emailClaimedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { did: "claimed", to };
    });

  /**
   * Record what became of an email this press holds. Only a held email is
   * settled, so this can never overwrite a state another press arrived at.
   * If the record cannot be written the email stays held, and reads as
   * unconfirmed once the claim is old: it is not sent again either way.
   */
  const settle = async (uid: string, fate: Fate): Promise<void> => {
    const state: ResultEmailState = fate === "failed" ? "owed" : fate;
    const ref = applicationRef(db, roundId, uid);
    for (let attempt = 1; ; attempt += 1) {
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const application = snap.exists
            ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)
            : null;
          if (application?.result?.email !== "sending") return;
          tx.update(ref, {
            "result.email": state,
            "result.emailedAt": state === "sent" ? FieldValue.serverTimestamp() : null,
            "result.emailClaimedAt": null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        return;
      } catch (err) {
        if (attempt >= SETTLE_ATTEMPTS) {
          console.error("[decision day] could not record what became of an email", roundId, uid, err);
          return;
        }
        await sleep(RETRY_AFTER_MS);
      }
    }
  };

  /**
   * Hand one email to the mail door. Never rejects. A second attempt is made
   * only when the first is known not to have handed anything over.
   */
  const deliver = async (email: DecisionEmail, to: string, uid: string): Promise<Fate> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await sendDecisionEmail({ to, email, roundId, actorUid: actor.uid });
      } catch (err) {
        console.error("[decision day] email failed", roundId, uid, err);
        if (handoverAfter(err) === "unknown") return "unconfirmed";
        if (attempt >= EMAIL_ATTEMPTS) return "failed";
        await sleep(RETRY_AFTER_MS);
      }
    }
  };

  const stillOwed = (letter: Letter) => {
    report.failed += 1;
    report.failedNames.push(letter.person.name);
    failedUids.push(letter.person.uid);
  };

  /** One person, start to finish. Never rejects: everything it meets is counted. */
  const tell = async (letter: Letter, alone: boolean): Promise<void> => {
    if (report.stopped === null && now().getTime() - startedAt.getTime() > PRESS_BUDGET_MS) {
      report.stopped = "out-of-time";
    }
    if (report.stopped !== null) {
      report.notReached += 1;
      return;
    }

    if (letter.owed && !letter.email) {
      // Owed, and it can no longer be composed (the programme it names has
      // left the form). There is nothing to send, so nothing is taken up: it
      // stays owed and the person is named.
      report.retried += 1;
      stillOwed(letter);
      return;
    }

    let to: string | null;
    let approves = false;
    try {
      if (letter.owed) {
        const claimed = await claim(letter);
        if (claimed.did === "skipped") {
          // Another press holds it or has settled it, or it is no longer theirs to get.
          report.skipped += 1;
          return;
        }
        report.retried += 1;
        to = claimed.to;
      } else {
        const written = await publish(letter);
        if (written.did === "skipped") {
          report.skipped += 1;
          return;
        }
        if (written.did === "changed") {
          report.changed += 1;
          return;
        }
        report.published += 1;
        to = written.to;
        approves = SEND_APPROVES_WAITING_ACCOUNTS && letter.told.kind === "accepted";
      }
    } catch (err) {
      console.error("[decision day] could not publish", roundId, letter.person.uid, err);
      report.notReached += 1;
      return;
    }

    // Their account first, so that by the time "You're in" arrives they are.
    if (approves) await approve(letter.person);

    if (!letter.email) {
      // Told, and deliberately not emailed: published as settled.
      report.notEmailed += 1;
      return;
    }
    if (!to) {
      // No address on the application: the result is published and nobody can
      // be written to. Counted as a failure so it is named in the report.
      stillOwed(letter);
      return;
    }

    const fate = await deliver(letter.email, to, letter.person.uid);
    await settle(letter.person.uid, fate);
    if (fate === "sent" || fate === "held" || fate === "suppressed") {
      failuresInARow = 0;
      if (fate === "sent") report.emailed += 1;
      else if (fate === "held") report.held += 1;
      else report.suppressed += 1;
      return;
    }
    if (fate === "failed") {
      stillOwed(letter);
    } else {
      report.unconfirmed += 1;
      report.unconfirmedNames.push(letter.person.name);
      unconfirmedUids.push(letter.person.uid);
    }
    failuresInARow += 1;
    if (alone || failuresInARow >= FAILURES_IN_A_ROW) report.stopped = "emails-failing";
  };

  // The first email goes on its own, so a mail outage is met by one person
  // rather than by six at once.
  const firstEmailed = letters.findIndex((letter) => letter.email !== null);
  const ordered =
    firstEmailed > 0
      ? [letters[firstEmailed], ...letters.slice(0, firstEmailed), ...letters.slice(firstEmailed + 1)]
      : letters;
  if (ordered.length > 0) {
    await tell(ordered[0], true);
    const rest = ordered.slice(1);
    if (report.stopped === null) await dispatchSends(rest, (letter) => tell(letter, false));
    else report.notReached += rest.length;
  }

  // People an earlier press told they are in, whose account is still waiting.
  if (SEND_APPROVES_WAITING_ACCOUNTS) {
    for (const person of toldBefore) {
      if (now().getTime() - startedAt.getTime() > PRESS_BUDGET_MS) break;
      await approve(person);
    }
  }

  // Sent means everybody has a result. Read the term again rather than trust
  // the counts: another press may have been running beside this one.
  const after = await loadTerm(db, form);
  report.complete =
    after.term.people.length > 0 && after.term.people.every((person) => person.result !== null);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(formRef(db, roundId));
    if (!snap.exists || !isApplicationForm(snap.data())) return;
    const live = normaliseForm(snap.id, snap.data());
    // The press that only sends what is owed tells nobody, so it never marks
    // the term as sent: that belongs to the press that told the last person.
    const stamp = !owedOnly && report.complete && !live.decisionsSentAt;
    if (stamp) {
      tx.update(formRef(db, roundId), {
        decisionsSentAt: FieldValue.serverTimestamp(),
        decisionsSentByUid: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (report.published > 0 || report.retried > 0 || report.accountsApproved > 0 || stamp) {
      tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
        kind: DECISIONS_SENT_AUDIT_KIND,
        // A form is not a run, so the run axis is empty and the form's own id
        // is kept beside it for whoever looks this press up later.
        runId: "",
        roundId,
        groupId: null,
        subjectUid: null,
        actorUid: actor.uid,
        actorName: actor.displayName ?? "",
        targetLabel: form.round.label,
        detail: auditDetail(form.round.label, report, failedUids, unconfirmedUids),
        at: FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true, report };
}
