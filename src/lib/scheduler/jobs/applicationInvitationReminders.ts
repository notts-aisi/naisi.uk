import "server-only";

/**
 * `application-invitation-reminders`: the daily reminder to somebody who was
 * invited on decision day and has not replied yet.
 *
 * An invitation is an offer of a programme the person did not pick, and it
 * has a reply-by day. Until they answer, they are reminded once a day. Who is
 * due one, and at what time of day, is the pure rule in
 * `src/lib/applications/decisionDay/reminders.ts`; read its header first. This
 * file is the part that reads, claims and sends.
 *
 * ## Nothing is scheduled
 *
 * Like every job here it works out what is due from live data on each tick:
 * the forms whose decisions have been sent, then on each one the invited
 * people with no reply. A tick that never fired costs lateness, never a
 * duplicate, and a reply-by day that passes ends the reminders by itself.
 *
 * ## ONE A DAY IS A FIELD ON THE INVITATION, TAKEN BEFORE THE SEND
 *
 * `invitation.lastReminderOn` is the London day of the last reminder. A
 * reminder is sent only by a run that first writes today into it, in a
 * transaction that reads the application again and checks the whole rule on
 * what it read. So two ticks at once cannot both send, a reply that landed a
 * second ago stops the reminder, and nothing is sent to an application
 * withdrawn in the same moment.
 *
 * The day is taken BEFORE the email, not after, because the failure worth
 * avoiding is two reminders in a day, not none. If the send then fails in a
 * way that is known to have handed nothing over (`handoverAfter`), the day is
 * given back and a later tick tries again. If nobody can say whether it went,
 * the day stays taken.
 *
 * This is the one place outside decision day that writes to an applicant's
 * own document, and it writes that one field. It reads no decision document
 * and changes nothing the person was told.
 *
 * ## The courses row is its off switch
 *
 * It is a scheduled nudge, so somebody who has switched course emails off is
 * not sent it, the same as the application deadline reminder. The invitation
 * itself was the answer to their application and went regardless. A `users`
 * read that fails is not a refusal: only an explicit "off" is.
 *
 * ## It ships switched off
 *
 * `enabledByDefault: false`, because it emails people. It is switched on from
 * the Site status page once the scheduler is running on that copy of the
 * site. The decision-day page says invited people "get a reminder each day"
 * only while this job is switched on and has run recently.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  composeInvitationReminder,
  type DecisionEmail,
} from "@/lib/applications/decisionDay/emailCopy";
import { sendDecisionEmail } from "@/lib/applications/decisionDay/deliver";
import { handoverAfter } from "@/lib/applications/decisionDay/emailState";
import { appUrl, emailContext, type EmailContext } from "@/lib/applications/decisionDay/letters";
import { civilDateLabel, firstNameOf } from "@/lib/applications/decisionDay/plan";
import {
  formRemindsInvitations,
  invitationReminderDue,
  reminderWindow,
} from "@/lib/applications/decisionDay/reminders";
import type { INVITATION_REMINDERS_JOB_ID } from "@/lib/applications/decisionDay/reminders";
import { FORM_VERSION, type ApplicationDoc } from "@/lib/applications/model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseForm,
  type ApplicationForm,
} from "@/lib/applications/normalise";
import { applicationRef } from "@/lib/applications/repo";
import { rankedProgrammes } from "@/lib/applications/sections";
import { listSentApplications } from "@/lib/applications/staffRepo";
import { hasOptedOutOfCourseAnnouncements } from "@/lib/email/courseFacilitatorEmails";
import { getAdminDb } from "@/lib/firebase/admin";
import { ROUNDS_COLLECTION } from "@/lib/firestore/admissionRounds";
import { errorText } from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/** This many sends failing one after another ends the run: the mail is not going out. */
const FAILURES_IN_A_ROW = 3;

/** What one run did, for the receipt. */
type Summary = {
  sent: number;
  held: number;
  suppressed: number;
  failed: number;
  unconfirmed: number;
  optedOut: number;
  noAddress: number;
};

/**
 * Every application form. One equality on one field, so it needs no declared
 * index. The query asks the database for forms, and each stored document is
 * asked the contract's own question as well, so this job is held to the rule
 * every other read of a round is: nothing is read as a form unless
 * `isApplicationForm` says it is one.
 */
async function listForms(db: Firestore): Promise<ApplicationForm[]> {
  const snap = await db.collection(ROUNDS_COLLECTION).where("formVersion", "==", FORM_VERSION).get();
  return snap.docs
    .filter((doc) => isApplicationForm(doc.data()))
    .map((doc) => normaliseForm(doc.id, doc.data()));
}

/** True when this person has switched course emails off. A failed read is not a refusal. */
async function hasOptedOut(db: Firestore, uid: string): Promise<boolean> {
  try {
    const snap = await db.collection("users").doc(uid).get();
    return snap.exists ? hasOptedOutOfCourseAnnouncements(snap.data() as Record<string, unknown>) : false;
  } catch {
    return false;
  }
}

type Claim =
  | { taken: true; to: string; email: DecisionEmail; previous: string | null; today: string }
  | { taken: false; why: string };

/**
 * Take today's reminder for one person: read their application again, check
 * the whole rule on what was read, and write today into the invitation. The
 * email is composed from that same read, so it says what is true now.
 */
function claimToday(
  db: Firestore,
  context: EmailContext,
  uid: string,
  now: Date,
): Promise<Claim> {
  const { form } = context;
  const ref = applicationRef(db, form.round.id, uid);
  return db.runTransaction<Claim>(async (tx) => {
    const snap = await tx.get(ref);
    const application = snap.exists
      ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)
      : null;
    if (!application) return { taken: false, why: "gone" };
    const check = invitationReminderDue(application, now);
    if (!check.due) return { taken: false, why: check.why };
    const to = (application.email ?? "").trim();
    if (!to) return { taken: false, why: "no-address" };
    const replyBy = civilDateLabel(check.replyBy);
    const email = replyBy
      ? composeInvitationReminder(
          {
            outcome: { kind: "invited", programmeId: check.programmeId },
            firstName: firstNameOf(application),
            form,
            ranked: application.sent
              ? rankedProgrammes(form, application.sent).map((programme) => programme.id)
              : [],
            leadNames: context.leadNames,
            replyBy,
            links: context.links,
          },
          { replyBy, lastDay: check.lastDay },
        )
      : null;
    // The programme has left the form: there is nothing true to remind them of.
    if (!email) return { taken: false, why: "no-programme" };
    tx.update(ref, { "invitation.lastReminderOn": check.today });
    return {
      taken: true,
      to,
      email,
      previous: application.invitation?.lastReminderOn ?? null,
      today: check.today,
    };
  });
}

/** Give today back after a send that is known to have handed nothing over. */
async function giveBack(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
  claim: { previous: string | null; today: string },
): Promise<void> {
  const ref = applicationRef(db, form.round.id, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const application = snap.exists
      ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)
      : null;
    // Only this run's own mark is undone.
    if (application?.invitation?.lastReminderOn !== claim.today) return;
    tx.update(ref, { "invitation.lastReminderOn": claim.previous });
  });
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "admin sdk unavailable" };

  const window = reminderWindow(ctx.now, ctx.maxLateHours);
  if (window !== "open") {
    return {
      processed: 0,
      hasMore: false,
      note: window === "before" ? "before today's reminder time" : "past today's reminder time",
    };
  }
  // The reminder's buttons open the person's own application page. With no
  // address for this site they would lead nowhere, so nothing is sent.
  if (!appUrl()) return { processed: 0, hasMore: false, note: "this site does not know its own address" };

  let forms: ApplicationForm[];
  try {
    forms = (await listForms(db)).filter((form) => formRemindsInvitations(form, ctx.now));
  } catch (err) {
    return { processed: 0, hasMore: true, note: `scan failed: ${errorText(err)}` };
  }

  const summary: Summary = {
    sent: 0,
    held: 0,
    suppressed: 0,
    failed: 0,
    unconfirmed: 0,
    optedOut: 0,
    noAddress: 0,
  };
  let taken = 0;
  let hasMore = false;
  let failuresInARow = 0;
  let stopped: string | null = null;

  scan: for (const form of forms) {
    let invited: ApplicationDoc[];
    let context: EmailContext;
    try {
      const applications = await listSentApplications(db, form);
      invited = applications.filter((application) => invitationReminderDue(application, ctx.now).due);
      if (invited.length === 0) continue;
      context = await emailContext(db, form);
    } catch (err) {
      ctx.log("could not read a form's invitations", { roundId: form.round.id, error: errorText(err) });
      hasMore = true;
      continue;
    }

    for (const application of invited) {
      if (ctx.budget.expired() || taken >= ctx.maxPerTick) {
        hasMore = true;
        break scan;
      }
      const { uid } = application;
      if (await hasOptedOut(db, uid)) {
        summary.optedOut += 1;
        continue;
      }

      let claim: Claim;
      try {
        claim = await claimToday(db, context, uid, ctx.now);
      } catch (err) {
        ctx.log("could not take today's reminder", { roundId: form.round.id, uid, error: errorText(err) });
        hasMore = true;
        continue;
      }
      if (!claim.taken) {
        if (claim.why === "no-address") summary.noAddress += 1;
        continue;
      }
      taken += 1;

      try {
        const delivery = await sendDecisionEmail({
          to: claim.to,
          email: claim.email,
          roundId: form.round.id,
        });
        failuresInARow = 0;
        if (delivery === "sent") summary.sent += 1;
        else if (delivery === "held") summary.held += 1;
        else summary.suppressed += 1;
      } catch (err) {
        const certain = handoverAfter(err) === "not-handed-over";
        ctx.log("a reminder could not be sent", {
          roundId: form.round.id,
          uid,
          handedOver: certain ? "no" : "unknown",
          error: errorText(err),
        });
        if (certain) {
          summary.failed += 1;
          // Nothing went, so today is theirs again and a later tick retries.
          try {
            await giveBack(db, form, uid, claim);
          } catch (undo) {
            ctx.log("could not give today's reminder back", { roundId: form.round.id, uid, error: errorText(undo) });
          }
        } else {
          // It may have gone. The day stays taken: one a day at most.
          summary.unconfirmed += 1;
        }
        failuresInARow += 1;
        if (failuresInARow >= FAILURES_IN_A_ROW) {
          // Not reported as more to do: running again at once would only
          // fail again. The next scheduled run finds everybody still due.
          stopped = "stopped: emails are failing";
          break scan;
        }
      }
    }
  }

  const parts = [`${summary.sent} sent`];
  if (summary.held > 0) parts.push(`${summary.held} held`);
  if (summary.suppressed > 0) parts.push(`${summary.suppressed} suppressed`);
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);
  if (summary.unconfirmed > 0) parts.push(`${summary.unconfirmed} unconfirmed`);
  if (summary.optedOut > 0) parts.push(`${summary.optedOut} opted out`);
  if (summary.noAddress > 0) parts.push(`${summary.noAddress} with no address`);
  if (stopped) parts.push(stopped);
  return {
    processed: summary.sent + summary.held + summary.suppressed,
    hasMore,
    note: parts.join(", "),
  };
}

/**
 * The registration.
 *
 * The id is written out here, as every job's is, because the guard that holds
 * mailing jobs to "switched off by default" reads it from this file. It is
 * TYPED as the constant the decision-day page looks the job's receipts up by
 * (`INVITATION_REMINDERS_JOB_ID`), so the two cannot drift apart without a
 * type error. And because that type is its own literal, adding this job to
 * the registry's `JOBS` is a type error until the id is in
 * `SCHEDULER_JOB_IDS`: the two have to land together.
 */
export const applicationInvitationRemindersJob: Omit<JobRegistration, "id"> & {
  id: typeof INVITATION_REMINDERS_JOB_ID;
} = {
  id: "application-invitation-reminders",
  label: "Invitation reminders",
  description:
    "Once a day, from 10:00, emails everybody who was invited to a programme on decision day and has not replied yet, up to their reply-by day. Nothing is sent before a term's decisions have gone out. While it is on, the Send decisions page tells admins that invited people are reminded daily.",
  handler,
  // A term invites a handful of people. The ceiling is for a mistake, not a plan.
  maxPerTick: 100,
  // Reminders go from 10:00 London. A run later than 18:00 sends nothing.
  maxLateHours: 8,
  // This job claims no marker: the day is taken on the invitation itself.
  // The number is the default rather than 0 for the reason the heartbeat gives.
  reclaimAfterMinutes: 20,
  enabledByDefault: false,
};
