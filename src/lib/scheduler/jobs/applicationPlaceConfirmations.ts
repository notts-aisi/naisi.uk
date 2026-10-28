import "server-only";

/**
 * `application-place-confirmations`: the daily reminder to confirm a place,
 * to somebody holding one who has not pressed "I'm coming", while their form
 * asks people to confirm by a day (`placeConfirmBy`).
 *
 * Who is due one is the pure rule in
 * `src/lib/applications/status/confirming.ts`; read its header first. This
 * file reads, claims and sends, exactly as the invitation reminder does
 * (`./applicationInvitationReminders.ts`, whose header says why each part is
 * the way it is). The differences:
 *
 *  - It reads people holding a place, not people invited.
 *  - ONE A DAY IS `confirmReminderOn` on the application, taken before the
 *    send in a transaction that reads the application again, and given back
 *    only after a send known to have handed nothing over.
 *  - The email is the "You're in" email again, as it would go today with the
 *    day to confirm by, under a line saying it is a reminder
 *    (`composeConfirmReminder`).
 *  - After the day it sends nothing, and nothing happens by itself: the
 *    People tab says who did not confirm, and a person decides.
 *
 * The courses row of somebody's notifications is its off switch, as for the
 * invitation reminder. This is the one other place outside decision day that
 * writes to an applicant's own document, and it writes that one field.
 *
 * It ships switched off (`enabledByDefault: false`), because it emails
 * people. An admin switches it on from the Site status page.
 */
import type { Firestore } from "firebase-admin/firestore";
import { composeConfirmReminder, type DecisionEmail } from "@/lib/applications/decisionDay/emailCopy";
import { sendDecisionEmail } from "@/lib/applications/decisionDay/deliver";
import { handoverAfter } from "@/lib/applications/decisionDay/emailState";
import { appUrl, emailContext, type EmailContext } from "@/lib/applications/decisionDay/letters";
import { civilDateLabel, firstNameOf } from "@/lib/applications/decisionDay/plan";
import { reminderWindow } from "@/lib/applications/decisionDay/reminders";
import { FORM_VERSION, type ApplicationDoc } from "@/lib/applications/model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseForm,
  type ApplicationForm,
} from "@/lib/applications/normalise";
import { applicationRef } from "@/lib/applications/repo";
import { rankedProgrammes } from "@/lib/applications/sections";
import {
  confirmationReminderDue,
  formAsksToConfirm,
  type PLACE_CONFIRMATIONS_JOB_ID,
} from "@/lib/applications/status/confirming";
import { listSentApplications } from "@/lib/applications/staffRepo";
import { hasOptedOutOfCourseAnnouncements } from "@/lib/email/courseFacilitatorEmails";
import { getAdminDb } from "@/lib/firebase/admin";
import { ROUNDS_COLLECTION } from "@/lib/firestore/admissionRounds";
import { errorText } from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/** This many sends failing one after another ends the run: the mail is not going out. */
const FAILURES_IN_A_ROW = 3;

type Summary = {
  sent: number;
  held: number;
  suppressed: number;
  failed: number;
  unconfirmed: number;
  optedOut: number;
  noAddress: number;
};

/** Every application form: one equality on one field, and `isApplicationForm` asked of each. */
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

/** Take today's reminder for one person, from their application read again, and compose it from that read. */
function claimToday(db: Firestore, context: EmailContext, uid: string, now: Date): Promise<Claim> {
  const { form } = context;
  const ref = applicationRef(db, form.round.id, uid);
  return db.runTransaction<Claim>(async (tx) => {
    const snap = await tx.get(ref);
    const application = snap.exists
      ? normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)
      : null;
    if (!application) return { taken: false, why: "gone" };
    const check = confirmationReminderDue(form, application, now);
    if (!check.due) return { taken: false, why: check.why };
    const to = (application.email ?? "").trim();
    if (!to) return { taken: false, why: "no-address" };
    const confirmBy = civilDateLabel(check.confirmBy);
    const email = confirmBy
      ? composeConfirmReminder(
          {
            outcome: { kind: "accepted", programmeId: check.programmeId },
            firstName: firstNameOf(application),
            form,
            ranked: application.sent
              ? rankedProgrammes(form, application.sent).map((programme) => programme.id)
              : [],
            leadNames: context.leadNames,
            replyBy: context.replyBy,
            links: context.links,
          },
          { confirmBy, lastDay: check.lastDay },
        )
      : null;
    // The programme has left the form: there is nothing true to remind them of.
    if (!email) return { taken: false, why: "no-programme" };
    tx.update(ref, { confirmReminderOn: check.today });
    return { taken: true, to, email, previous: application.confirmReminderOn, today: check.today };
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
    if (application?.confirmReminderOn !== claim.today) return;
    tx.update(ref, { confirmReminderOn: claim.previous });
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
  // The reminder's buttons open the person's own application page.
  if (!appUrl()) return { processed: 0, hasMore: false, note: "this site does not know its own address" };

  let forms: ApplicationForm[];
  try {
    forms = (await listForms(db)).filter((form) => formAsksToConfirm(form, ctx.now));
  } catch (err) {
    return { processed: 0, hasMore: true, note: `scan failed: ${errorText(err)}` };
  }

  const summary: Summary = { sent: 0, held: 0, suppressed: 0, failed: 0, unconfirmed: 0, optedOut: 0, noAddress: 0 };
  let taken = 0;
  let hasMore = false;
  let failuresInARow = 0;
  let stopped: string | null = null;

  scan: for (const form of forms) {
    let due: ApplicationDoc[];
    let context: EmailContext;
    try {
      const applications = await listSentApplications(db, form);
      due = applications.filter((application) => confirmationReminderDue(form, application, ctx.now).due);
      if (due.length === 0) continue;
      context = await emailContext(db, form);
    } catch (err) {
      ctx.log("could not read a form's places", { roundId: form.round.id, error: errorText(err) });
      hasMore = true;
      continue;
    }

    for (const application of due) {
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
        const delivery = await sendDecisionEmail({ to: claim.to, email: claim.email, roundId: form.round.id });
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
          try {
            await giveBack(db, form, uid, claim);
          } catch (undo) {
            ctx.log("could not give today's reminder back", { roundId: form.round.id, uid, error: errorText(undo) });
          }
        } else {
          summary.unconfirmed += 1;
        }
        failuresInARow += 1;
        if (failuresInARow >= FAILURES_IN_A_ROW) {
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
  return { processed: summary.sent + summary.held + summary.suppressed, hasMore, note: parts.join(", ") };
}

/**
 * The registration. The id is written out, as every job's is, for the guard
 * that holds mailing jobs to "switched off by default", and typed as the
 * constant the screens look its receipts up by, so the two cannot drift.
 */
export const applicationPlaceConfirmationsJob: Omit<JobRegistration, "id"> & {
  id: typeof PLACE_CONFIRMATIONS_JOB_ID;
} = {
  id: "application-place-confirmations",
  label: "Place confirmation reminders",
  description:
    "Once a day, from 10:00, emails everybody holding a place who has not pressed “I’m coming” yet, while their form asks people to confirm by a day, up to that day. Nothing is sent before a term's decisions have gone out, or on a form with no day to confirm by. Nobody's place changes: after the day, the People tab says who did not confirm.",
  handler,
  // A term places a few dozen people. The ceiling is for a mistake, not a plan.
  maxPerTick: 150,
  // Reminders go from 10:00 London. A run later than 18:00 sends nothing.
  maxLateHours: 8,
  // This job claims no marker: the day is taken on the application itself.
  reclaimAfterMinutes: 20,
  enabledByDefault: false,
};
