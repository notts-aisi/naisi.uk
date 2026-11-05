import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import SurveyEmail from "@/emails/SurveyEmail";
import { addDaysToKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { sendNotice } from "@/lib/email/notice";
import { SURVEY_PEOPLE_COLLECTION, normalizeSurveyPerson, type CheckInSurveyDoc, type SurveyPersonDoc } from "@/lib/firestore/surveys";
import { surveyLink } from "../emails";
import { surveyQuestionsOf } from "../items";
import { isOpen, peopleOf } from "../repo";
import { onTheRun } from "../seat";
import { SURVEY_FROM_NAME, SURVEY_REPLY_TO } from "../words";
import { checkInReminderWords } from "./words";

/**
 * THE CHECK-IN'S ONE REMINDER, THE MORNING AFTER (the scheduler's
 * `surveys-check-in-reminders` job, which ships switched off): at 9am in
 * London the day after a session, one email to each person its check-in
 * reached who has not sent it, while it is still open.
 *
 *  - WHICH CHECK-INS (`reminderDueAt`): one opened on its session's own
 *    London day, at the session as it is meant to be. One opened the morning
 *    after, or late by an admin, sent its own email that morning or later,
 *    and is reminded about by nobody.
 *  - WHO (`stillOwed`): each person with a row on it who has not answered and
 *    whose seat on its run is still live and told, the Home card's own test
 *    (`onTheRun`): somebody who left is not chased. A row made for somebody
 *    marked there after it opened has had no email, so this is their first.
 *  - A NOTICE about their own programme, like the reminders before a session:
 *    it reaches them whatever their settings say, with the marker (surface
 *    `course-check-in-reminder`), their own link, and no unsubscribe link. It
 *    never carries an answer or a count of who answered, and never a meeting
 *    link.
 *  - ONCE: the job claims a marker per person before the send. Their row is
 *    stamped with when they were reminded, as a survey's reminder stamps it.
 */

/** The London wall clock the reminder goes at, the day after the session. */
export const REMINDER_CLOCK = "09:00";

/**
 * When a check-in's reminder is due, or null when it has none: 9am in London
 * the day after its session, for a check-in opened on its session's own London
 * day. Pure.
 */
export function reminderDueAt(survey: Pick<CheckInSurveyDoc, "checkIn" | "presses">): Date | null {
  const startsAt = survey.checkIn.startsAt;
  const opened = survey.presses.find((press) => press.kind === "first")?.at ?? null;
  if (!startsAt || !opened) return null;
  const sessionDay = londonDateKey(startsAt);
  if (londonDateKey(opened) !== sessionDay) return null;
  try {
    return londonWallClockToInstant(addDaysToKey(sessionDay, 1), REMINDER_CLOCK);
  } catch {
    return null;
  }
}

/** Why somebody with a row is not reminded, as their marker records it. */
export type NotOwed = "answered" | "left" | "closed";

/** The people a check-in's reminder is owed to now, read fresh: rows not answered. */
export async function unansweredOf(db: Firestore, survey: CheckInSurveyDoc): Promise<SurveyPersonDoc[]> {
  return (await peopleOf(db, survey.id)).filter((person) => !person.answered);
}

/**
 * Whether one person is still owed it, asked again just before their email:
 * the check-in still open, their own row still unanswered, and their seat on
 * the run still live and told.
 */
export async function stillOwed(
  db: Firestore,
  survey: CheckInSurveyDoc,
  person: SurveyPersonDoc,
  now: Date,
): Promise<{ owed: true; person: SurveyPersonDoc } | { owed: false; why: NotOwed }> {
  if (!isOpen(survey, now)) return { owed: false, why: "closed" };
  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).doc(person.id).get();
  const fresh = snap.exists ? normalizeSurveyPerson(snap.id, snap.data() ?? {}) : null;
  if (!fresh || fresh.answered) return { owed: false, why: "answered" };
  if (!(await onTheRun(db, survey.runId, fresh.respondent.uid))) return { owed: false, why: "left" };
  return { owed: true, person: fresh };
}

/**
 * One person's reminder, to their account's own address, with their own
 * link; their row stamped with it once it has gone. Answers what became of it.
 */
export async function sendCheckInReminder(
  db: Firestore,
  input: { survey: CheckInSurveyDoc; person: SurveyPersonDoc; to: string; actorUid: string },
): Promise<"sent" | "held" | "suppressed"> {
  const { survey, person } = input;
  const words = checkInReminderWords({
    groupName: survey.checkIn.groupName,
    startsAt: survey.checkIn.startsAt,
    questions: surveyQuestionsOf(survey.items).length,
    minutes: survey.minutes,
    programmeName: survey.programmeName,
    closesAt: survey.closesAt ?? new Date(),
  });
  // ONE address. One message. Never an array, never a Cc.
  const result = await sendNotice({
    to: input.to,
    subject: words.subject,
    surface: "course-check-in-reminder",
    actorUid: input.actorUid,
    referenceId: survey.id,
    replyTo: SURVEY_REPLY_TO,
    fromName: SURVEY_FROM_NAME,
    render: (marker) => SurveyEmail({ ...words, link: surveyLink(person.token) ?? "", notice: marker }),
  });
  const delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
  if (delivery !== "suppressed") {
    await db
      .collection(SURVEY_PEOPLE_COLLECTION)
      .doc(person.id)
      .update({ remindedAt: FieldValue.serverTimestamp(), reminders: FieldValue.increment(1) });
  }
  return delivery;
}
