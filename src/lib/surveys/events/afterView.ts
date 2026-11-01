import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { StoredSurveyAfter } from "@/lib/events/surveyAfter";
import type { EventDoc } from "@/lib/firestore/events";
import type { EventSurveyDoc } from "@/lib/firestore/surveys";
import type { SurveyItem } from "../items";
import { surveyState } from "../repo";
import { firstPressOf, settingsOf } from "./after";
import { SURVEY_AFTER_REFUSAL, sendNowCount } from "./setUp";

/**
 * WHAT THE EVENT'S ORGANISERS ARE HANDED ON ITS SURVEY AFTER TAB, built on the
 * server: the setting to change, what is fixed and why, and "Send it now"
 * with the number it emails. Counts only: never an answer, a count of
 * answers or a name (the people it emails are counted by `sendNowCount`,
 * from who it reaches less who it has reached). Its results stay admins'.
 *
 * Only for a published event whose survey its event set up, or whose step
 * set one and has none yet; an admin's survey from Surveys is run from there,
 * an event with no stored setting has none, and a cancelled event's survey
 * goes nowhere, so there is nothing left to change or send.
 */

export type SurveyAfterPanel = {
  /** The setting the form starts from: the survey's own, once it is set up. */
  setting: StoredSurveyAfter & { items: SurveyItem[] };
  /** Whether the event has its survey set up. */
  setUp: boolean;
  /** What can no longer change, each with the line that says why; null where it still can. */
  locks: { questions: string | null; send: string | null; reminder: string | null; off: string | null };
  /** "Send it now (21)": the number it emails now; null when it isn't offered. */
  send: { emails: number } | null;
  /** Why "Send it now" isn't offered, when it would be but for this; null otherwise. */
  sendNote: string | null;
  /** "Send a test to me" is offered. */
  test: boolean;
};

const NOT_YET_STARTED = "You can send it from here once the event has started.";

/** "Nobody to send it to yet: nobody has been checked in." */
function nobodyWords(survey: EventSurveyDoc): string {
  return survey.audience.kind === "event-signups"
    ? "Nobody to send it to yet: nobody has a place."
    : "Nobody to send it to yet: nobody has been checked in.";
}

export async function surveyAfterPanel(
  db: Firestore,
  input: { event: EventDoc; survey: EventSurveyDoc | null; now: Date },
): Promise<SurveyAfterPanel | null> {
  const { event, survey, now } = input;
  if (event.status !== "published") return null;
  if (survey && !survey.auto) return null;
  if (!survey) {
    if (!event.surveyAfter) return null;
    const settings = settingsOf(event.surveyAfter);
    return {
      setting: { ...event.surveyAfter, items: settings.items },
      setUp: false,
      locks: { questions: null, send: null, reminder: null, off: null },
      send: null,
      sendNote: null,
      test: false,
    };
  }
  const auto = survey.auto;
  if (!auto) return null;
  const opened = survey.firstSentAt !== null;
  const went = firstPressOf(survey) !== null;
  const state = surveyState(survey, now);
  const setting: SurveyAfterPanel["setting"] = {
    on: true,
    items: survey.items,
    who: survey.audience.kind === "event-signups" ? "signups" : "came",
    missed: auto.missed,
    when: auto.when,
    hours: auto.hours,
    reminder: auto.reminder,
    showCode: auto.showCode,
  };
  const live = !went && state !== "closed";
  let send: SurveyAfterPanel["send"] = null;
  let sendNote: string | null = null;
  if (live) {
    if (!event.startAt || now.getTime() < event.startAt.getTime()) {
      sendNote = NOT_YET_STARTED;
    } else {
      const count = await sendNowCount(db, survey, event);
      if (count.emails > 0) send = { emails: count.emails };
      else sendNote = nobodyWords(survey);
    }
  }
  return {
    setting,
    setUp: true,
    locks: {
      questions: opened ? SURVEY_AFTER_REFUSAL.opened : null,
      send: went ? SURVEY_AFTER_REFUSAL.sent : null,
      reminder: auto.remindedAt ? SURVEY_AFTER_REFUSAL.reminded : null,
      off: opened ? SURVEY_AFTER_REFUSAL.offOpened : null,
    },
    send,
    sendNote,
    test: live,
  };
}
