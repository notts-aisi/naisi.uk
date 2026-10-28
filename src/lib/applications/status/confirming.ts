import { londonDateKey } from "@/lib/courses/weekPlan";
import { emailStanding } from "../decisionDay/emailState";
import { isInTerm } from "../decisionDay/plan";
import { REMINDER_SCAN_DAYS } from "../decisionDay/reminders";
import type { ApplicationDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { standingOf } from "./standing";

/**
 * CONFIRMING A PLACE BY A DAY: who is asked, who is reminded today, and where
 * each person stands, for every screen and the job that sends.
 *
 * A form may carry `placeConfirmBy`, a London day. With none, a place is
 * presumed and "I'm coming" is optional, as it always was. With one, somebody
 * holding a place is asked to press "I'm coming" by that day, and:
 *
 *  - THEY ARE REMINDED ONCE A DAY until they do, from the day after they were
 *    told until the day itself (`confirmationReminderDue`), by the
 *    `application-place-confirmations` job. One a day is the field
 *    `confirmReminderOn`, taken before the send, as the invitation reminder
 *    takes `invitation.lastReminderOn`. Only after their decision email went,
 *    as for an invitation: a reminder of something not yet sent would read as
 *    a mistake.
 *  - AFTER THE DAY, nothing is sent and nothing happens by itself. Their place
 *    is still theirs. The programme's People tab says they did not confirm,
 *    and a person decides: the lead or an admin can take them off the run
 *    (Remove), which gives the place back so it can be offered to somebody
 *    else (`src/lib/applications/freedPlaces/`).
 *
 * Accepting an invitation is saying they are coming (`standingOf`), so
 * somebody who joined by an invitation is never asked again.
 *
 * Pure, with no clock of its own: every caller hands over `now`.
 */

/** The job's id: the key of its switch and the name on its receipts. Never changes once shipped. */
export const PLACE_CONFIRMATIONS_JOB_ID = "application-place-confirmations";

/** True for a form whose people holding a place may be reminded to confirm at all. */
export function formAsksToConfirm(form: ApplicationForm, now: Date): boolean {
  if (!form.placeConfirmBy || !form.decisionsSentAt) return false;
  if (form.round.archived || form.round.status === "cancelled") return false;
  return now.getTime() - form.decisionsSentAt.getTime() <= REMINDER_SCAN_DAYS * 86_400_000;
}

/** Why somebody is not reminded today. */
export type ConfirmSkip =
  | "not-asked"
  | "not-in-term"
  | "no-place"
  | "confirmed"
  | "past-confirm-by"
  | "told-today"
  | "reminded-today"
  | "email-not-sent";

export type ConfirmCheck =
  | {
      due: true;
      /** The programme they hold a place on. */
      programmeId: string;
      /** The form's day to confirm by. */
      confirmBy: string;
      /** True on that day itself. */
      lastDay: boolean;
      /** Today in London, which is what `confirmReminderOn` is set to. */
      today: string;
    }
  | { due: false; why: ConfirmSkip };

type Confirming = Pick<
  ApplicationDoc,
  "sent" | "status" | "result" | "invitation" | "attendance" | "confirmReminderOn"
>;

export function confirmationReminderDue(
  form: Pick<ApplicationForm, "placeConfirmBy">,
  application: Confirming,
  now: Date,
): ConfirmCheck {
  const skip = (why: ConfirmSkip): ConfirmCheck => ({ due: false, why });
  const confirmBy = form.placeConfirmBy;
  if (!confirmBy) return skip("not-asked");
  if (!isInTerm(application)) return skip("not-in-term");
  const standing = standingOf(application);
  if (standing.kind !== "place" || !standing.programmeId) return skip("no-place");
  if (standing.saidComing) return skip("confirmed");

  const today = londonDateKey(now);
  if (today > confirmBy) return skip("past-confirm-by");
  // A place that came from an invitation is a place they said yes to: saidComing
  // above. So `result` here is decision day's own, and its day is when they were told.
  const result = application.result;
  const toldOn = result?.publishedAt ? londonDateKey(result.publishedAt) : null;
  if (!toldOn || today <= toldOn) return skip("told-today");
  if (application.confirmReminderOn !== null && application.confirmReminderOn >= today) {
    return skip("reminded-today");
  }
  const sent = result ? emailStanding(result, now) : "none";
  if (sent !== "sent" && sent !== "unconfirmed") return skip("email-not-sent");

  return { due: true, programmeId: standing.programmeId, confirmBy, lastDay: today === confirmBy, today };
}

/**
 * Where somebody holding a place stands on confirming it, for the screens:
 * `presumed` on a form that asks nobody to, `confirmed` once they have said
 * they are coming, `asked` while the day is still to come, and `overdue` once
 * it has passed with no reply. Null for somebody who holds no place.
 */
export type ConfirmStanding = { kind: "presumed" | "confirmed" } | { kind: "asked" | "overdue"; confirmBy: string };

export function confirmStandingOf(
  form: Pick<ApplicationForm, "placeConfirmBy">,
  application: Pick<ApplicationDoc, "status" | "result" | "invitation" | "attendance">,
  now: Date,
): ConfirmStanding | null {
  const standing = standingOf(application);
  if (standing.kind !== "place") return null;
  if (standing.saidComing) return { kind: "confirmed" };
  const confirmBy = form.placeConfirmBy;
  if (!confirmBy) return { kind: "presumed" };
  return { kind: londonDateKey(now) > confirmBy ? "overdue" : "asked", confirmBy };
}
