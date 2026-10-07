import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { formatRoundDate } from "@/lib/admissions/window";
import { admissionApplicationUrl } from "@/lib/email/admissionEmails";
import { resolveEmailAudience } from "@/lib/email/audience";
import { dispatchSends } from "@/lib/email/dispatch";
import { COURSE_AUDIT_COLLECTION, COURSE_AUDIT_LIMITS } from "@/lib/firestore/courseAudit";
import { outcomeFor } from "../decisions";
import { own } from "../keys";
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
import { emailsLabel, placesDetail, pooledDetail } from "./boardWords";
import { sendDecisionEmail, type Delivery } from "./deliver";
import {
  DECISION_REPLY_TO,
  composeDecisionEmail,
  type DecisionEmail,
  type DecisionEmailKind,
} from "./emailCopy";
import { countWaitingAccounts, loadFirstNames } from "./people";
import {
  civilDateLabel,
  countOf,
  emailCount,
  emailOutcomeFor,
  isInTerm,
  publicationFor,
  samePublication,
  sendBlockers,
  toldTo,
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
 *     after one that was cut short, never tells anybody twice and never
 *     changes what somebody was told.
 *  2. THEN EMAIL, after the commit. The email's buttons open the person's own
 *     application page, so the result has to be there before the email is.
 *
 * A failed email does not undo the result: the person can already see it on
 * the site. It is counted, named in the report and written to the audit row,
 * so somebody can write to them.
 *
 * ## A press is bounded, and can be pressed again
 *
 * A request has about a minute. Each person costs one transaction and one
 * email, and `dispatchSends` runs six at a time, so a full press of
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
 * ## What marks the term as sent
 *
 * `decisionsSentAt` is stamped on the form only once everybody in the term has
 * a result, in the same transaction as the audit row for the press that
 * finished it. A press that reaches only some people leaves the form unsent
 * and says so.
 */

/** The most people one press reaches. See the module comment for the sum. */
export const MAX_PEOPLE_PER_PRESS = 150;

/** After this long, a press stops starting new people and reports what is left. */
const PRESS_BUDGET_MS = 40_000;

/** This many emails failing one after another stops the press. */
const FAILURES_IN_A_ROW = 3;

/** An email that throws is tried once more before it counts as failed. */
const EMAIL_ATTEMPTS = 2;

/** How long to wait before that second attempt. */
const RETRY_AFTER_MS = 400;

// ---------------------------------------------------------------------------
// The emails, for a preview, a test and the send alike
// ---------------------------------------------------------------------------

type EmailContext = {
  form: ApplicationForm;
  leadNames: Record<string, string>;
  replyBy: string | null;
  links: { application: string; events: string };
};

/** This site's own address, with no trailing slash. Empty when it is not set. */
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

async function emailContext(db: Firestore, form: ApplicationForm): Promise<EmailContext> {
  const leads = form.programmeIds.map((programmeId) => programmeOf(form, programmeId)?.leadUid ?? "");
  const names = await loadFirstNames(db, leads);
  // Built from entries, so every programme id is the object's own key
  // whatever the id happens to be called.
  const leadNames: Record<string, string> = Object.fromEntries(
    form.programmeIds.map((programmeId) => {
      const leadUid = programmeOf(form, programmeId)?.leadUid;
      return [programmeId, leadUid ? (names.get(leadUid) ?? "") : ""];
    }),
  );
  return {
    form,
    leadNames,
    replyBy: civilDateLabel(form.invitationReplyBy),
    links: {
      application: admissionApplicationUrl(form.round.id, "status"),
      events: `${appUrl()}/events`,
    },
  };
}

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
  const [accountsWaiting, sender] = await Promise.all([
    countWaitingAccounts(
      db,
      accepted.people.map((person) => person.uid),
    ),
    loadFirstNames(db, form.decisionsSentByUid ? [form.decisionsSentByUid] : []),
  ]);
  const todo = unpublished(term).filter((person) => publicationFor(person.outcome) !== null);

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
    accountsWaiting,
    fromName: process.env.SMTP_FROM_NAME ?? "NAISI",
    replyTo: DECISION_REPLY_TO,
    emailsEveryone: resolveEmailAudience(process.env).mode === "everyone",
    pending: {
      people: todo.length,
      emails: emailCount(todo, false),
      declined: todo.filter((person) => person.outcome.kind === "declined").length,
      perPress: MAX_PEOPLE_PER_PRESS,
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

// ---------------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------------

export type SendRequest = {
  /** How many emails the page said this press would send. */
  emails: number;
  /** The "Email them" switch on the declined group. */
  emailDeclined: boolean;
};

export type SendOutcome =
  | { ok: true; report: SendReport }
  | { ok: false; status: 404 | 409; error: string };

type Letter = {
  person: TermPerson;
  told: Publication;
  /** Null when this outcome is not emailed. */
  email: DecisionEmail | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The sentence the audit log keeps for one press. Cut at the log's own limit. */
export function auditDetail(
  termLabel: string,
  report: SendReport,
  failedUids: readonly string[],
): string {
  const parts = [
    `Published ${countOf(report.published, "decision", "decisions")} for ${termLabel}:`,
    `${report.emailed} emailed, ${report.held} held, ${report.suppressed} suppressed,`,
    `${report.failed} failed, ${report.notEmailed} not emailed.`,
  ];
  if (report.skipped + report.changed + report.notReached > 0) {
    parts.push(
      `${report.skipped} already told, ${report.changed} changed, ${report.notReached} not reached.`,
    );
  }
  if (report.stopped === "emails-failing") parts.push("Stopped because emails were failing.");
  if (report.stopped === "out-of-time") parts.push("Stopped when the press ran out of time.");
  parts.push(report.complete ? "Everybody in the term now has their result." : "The term is not finished.");
  if (failedUids.length > 0) parts.push(`Email failed for: ${failedUids.join(", ")}.`);
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

  const startedAt = now();
  const { term } = await loadTerm(db, form);
  const blockers = sendBlockers({ form, term, now: startedAt, appUrl: appUrl() });
  if (blockers.length > 0) return { ok: false, status: 409, error: blockers.join(" ") };

  // With no blocker, everybody not yet told has an outcome that can be published.
  const todo = unpublished(term);
  const expected = emailCount(todo, request.emailDeclined);
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
  const letters: Letter[] = [];
  for (const person of todo.slice(0, MAX_PEOPLE_PER_PRESS)) {
    const told = publicationFor(person.outcome);
    if (told) letters.push({ person, told, email: emailFor(context, person, told, request.emailDeclined) });
  }

  const report: SendReport = {
    published: 0,
    emailed: 0,
    held: 0,
    suppressed: 0,
    failed: 0,
    notEmailed: 0,
    skipped: term.people.length - todo.length,
    changed: 0,
    notReached: todo.length - letters.length,
    failedNames: [],
    stopped: null,
    complete: false,
  };
  const failedUids: string[] = [];
  const invitable = new Set(form.programmeIds);
  let failuresInARow = 0;

  /** Write one person's result, unless they have one or their decision moved. */
  const publish = (letter: Letter): Promise<"published" | "skipped" | "changed"> =>
    db.runTransaction(async (tx) => {
      const [applicationSnap, decisionSnap] = await Promise.all([
        tx.get(applicationRef(db, roundId, letter.person.uid)),
        tx.get(decisionRef(db, roundId, letter.person.uid)),
      ]);
      const application = applicationSnap.exists
        ? normaliseApplication(applicationSnap.id, applicationSnap.data(), form.round.availabilityGrid)
        : null;
      if (!application || !application.sent || !isInTerm(application)) return "changed";
      if (application.result) return "skipped";
      if (application.status !== "submitted") return "changed";

      // What the decisions say NOW has to be what this press set out to tell
      // them. A lead who changed their mind a moment ago is not overruled, and
      // the person is left for a press that has seen the change.
      const decision = decisionSnap.exists
        ? normaliseDecision(decisionSnap.id, decisionSnap.data())
        : null;
      const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
      const fresh = publicationFor(outcomeFor(ranked, decision, invitable));
      if (!samePublication(fresh, letter.told)) return "changed";

      const { kind, programmeId } = letter.told;
      tx.update(applicationRef(db, roundId, letter.person.uid), {
        status: kind,
        result: { kind, programmeId, publishedAt: FieldValue.serverTimestamp() },
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
      return "published";
    });

  /** One attempt, and one more after a short wait if the first threw. */
  const deliver = async (email: DecisionEmail, to: string): Promise<Delivery> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await sendDecisionEmail({ to, email, roundId, actorUid: actor.uid });
      } catch (err) {
        if (attempt >= EMAIL_ATTEMPTS) throw err;
        await sleep(RETRY_AFTER_MS);
      }
    }
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
    let written: "published" | "skipped" | "changed";
    try {
      written = await publish(letter);
    } catch (err) {
      console.error("[decision day] could not publish", roundId, letter.person.uid, err);
      report.notReached += 1;
      return;
    }
    if (written === "skipped") {
      report.skipped += 1;
      return;
    }
    if (written === "changed") {
      report.changed += 1;
      return;
    }
    report.published += 1;
    if (!letter.email) {
      report.notEmailed += 1;
      return;
    }
    if (!letter.person.email) {
      // No address on the application: the result is published and nobody can
      // be written to. Counted as a failure so it is named in the report.
      report.failed += 1;
      report.failedNames.push(letter.person.name);
      failedUids.push(letter.person.uid);
      return;
    }
    try {
      const delivery = await deliver(letter.email, letter.person.email);
      failuresInARow = 0;
      if (delivery === "sent") report.emailed += 1;
      else if (delivery === "held") report.held += 1;
      else report.suppressed += 1;
    } catch (err) {
      console.error("[decision day] email failed", roundId, letter.person.uid, err);
      report.failed += 1;
      report.failedNames.push(letter.person.name);
      failedUids.push(letter.person.uid);
      failuresInARow += 1;
      if (alone || failuresInARow >= FAILURES_IN_A_ROW) report.stopped = "emails-failing";
    }
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

  // Sent means everybody has a result. Read the term again rather than trust
  // the counts: another press may have been running beside this one.
  const after = await loadTerm(db, form);
  report.complete =
    after.term.people.length > 0 && after.term.people.every((person) => person.result !== null);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(formRef(db, roundId));
    if (!snap.exists || !isApplicationForm(snap.data())) return;
    const live = normaliseForm(snap.id, snap.data());
    const stamp = report.complete && !live.decisionsSentAt;
    if (stamp) {
      tx.update(formRef(db, roundId), {
        decisionsSentAt: FieldValue.serverTimestamp(),
        decisionsSentByUid: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (report.published > 0 || stamp) {
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
        detail: auditDetail(form.round.label, report, failedUids),
        at: FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true, report };
}
