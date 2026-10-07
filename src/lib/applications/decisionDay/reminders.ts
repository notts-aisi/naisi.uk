import { londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import type { ApplicationDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { emailStanding } from "./emailState";
import { isInTerm } from "./plan";

/**
 * WHO IS REMINDED ABOUT AN INVITATION, AND WHEN.
 *
 * Somebody invited on decision day accepts by a reply-by day, and is reminded
 * once a day until they reply. This module is the whole rule for that, as
 * pure functions over one application and one clock, so the scheduled job
 * that sends the reminders and the tests that hold them to the rule read the
 * same code.
 *
 * ## The rule
 *
 * A person is due a reminder today when ALL of these hold:
 *
 *  - decisions for their form have been sent (the form is stamped), and the
 *    form has not since been archived or cancelled;
 *  - their application is sent and not withdrawn, their status is still
 *    "invited", and their invitation has no reply;
 *  - today in London is after the day they were told, and on or before their
 *    own reply-by day. Nobody is reminded on the day they were invited, and
 *    nobody is reminded once the day to reply has passed;
 *  - they have not already been reminded today (`invitation.lastReminderOn`);
 *  - their invitation email went, or nobody can say whether it did. Somebody
 *    whose invitation email is still owed gets the invitation first, from the
 *    decision-day page: a reminder of something not yet sent would read as a
 *    mistake. An email this copy of the site held, or the do-not-email list
 *    refused, is not followed by reminders either. Somebody whose email
 *    nobody can vouch for IS reminded: the reminder carries the whole
 *    invitation, so it is also how they hear if the first one never arrived.
 *
 * Whether the person has switched course emails off is asked by the job,
 * which holds their account. It is not part of this rule.
 *
 * ## The time of day
 *
 * The job runs every quarter of an hour, so "once a day" needs a time. The
 * day's reminders go from {@link REMINDER_TIME} London time, and a run that
 * comes too late in the day sends nothing: no reminder is better than one in
 * the middle of the night.
 */

/**
 * The id of the scheduled job that sends the reminders. It is the key of the
 * job's switch and the name on its receipts, so it never changes once it has
 * shipped.
 */
export const INVITATION_REMINDERS_JOB_ID = "application-invitation-reminders";

/** The London wall clock a day's reminders go out from. */
export const REMINDER_TIME = "10:00";

/** How long after decisions were sent a form is still looked at. */
export const REMINDER_SCAN_DAYS = 60;

/** Where the clock stands against today's reminder time. */
export type ReminderWindow = "before" | "open" | "after";

export function reminderWindow(now: Date, maxLateHours: number): ReminderWindow {
  const dueAt = londonWallClockToInstant(londonDateKey(now), REMINDER_TIME);
  if (now.getTime() < dueAt.getTime()) return "before";
  return now.getTime() - dueAt.getTime() > maxLateHours * 3_600_000 ? "after" : "open";
}

/** True for a form whose invited people may be reminded at all. */
export function formRemindsInvitations(form: ApplicationForm, now: Date): boolean {
  if (!form.decisionsSentAt) return false;
  if (form.round.archived || form.round.status === "cancelled") return false;
  return now.getTime() - form.decisionsSentAt.getTime() <= REMINDER_SCAN_DAYS * 86_400_000;
}

/** Why somebody is not reminded today. */
export type ReminderSkip =
  | "not-in-term"
  | "not-invited"
  | "replied"
  | "past-reply-by"
  | "told-today"
  | "reminded-today"
  | "email-not-sent";

export type ReminderCheck =
  | {
      due: true;
      /** The programme they are invited to. */
      programmeId: string;
      /** Their own reply-by day, a civil date. */
      replyBy: string;
      /** True on the reply-by day itself. */
      lastDay: boolean;
      /** Today in London, which is what `lastReminderOn` is set to. */
      today: string;
    }
  | { due: false; why: ReminderSkip };

type Reminded = Pick<ApplicationDoc, "sent" | "status" | "result" | "invitation">;

export function invitationReminderDue(application: Reminded, now: Date): ReminderCheck {
  const skip = (why: ReminderSkip): ReminderCheck => ({ due: false, why });
  if (!isInTerm(application)) return skip("not-in-term");
  const { result, invitation } = application;
  if (application.status !== "invited" || result?.kind !== "invited" || !invitation) {
    return skip("not-invited");
  }
  if (invitation.response !== null) return skip("replied");

  const today = londonDateKey(now);
  if (today > invitation.replyBy) return skip("past-reply-by");
  // The day they were told is the day of the invitation itself. A result with
  // no day on it cannot be shown to be older than today, so it waits.
  const toldOn = result.publishedAt ? londonDateKey(result.publishedAt) : null;
  if (!toldOn || today <= toldOn) return skip("told-today");
  if (invitation.lastReminderOn !== null && invitation.lastReminderOn >= today) {
    return skip("reminded-today");
  }
  const standing = emailStanding(result, now);
  if (standing !== "sent" && standing !== "unconfirmed") return skip("email-not-sent");

  return {
    due: true,
    programmeId: invitation.programmeId,
    replyBy: invitation.replyBy,
    lastDay: today === invitation.replyBy,
    today,
  };
}
