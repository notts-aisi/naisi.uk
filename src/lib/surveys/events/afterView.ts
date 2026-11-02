import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { addLaterUntil, openingOf } from "@/lib/events/checkIns";
import { newSurveyAfter, type StoredSurveyAfter } from "@/lib/events/surveyAfter";
import type { EventDoc } from "@/lib/firestore/events";
import type { EventSurveyDoc } from "@/lib/firestore/surveys";
import type { SurveyItem } from "../items";
import { eventStandardItems } from "../questionSetsStore";
import { surveyState } from "../repo";
import { asksMissed, firstPressOf, settingsOf } from "./after";
import { SURVEY_AFTER_REFUSAL, sendNowCount, sendNowCountBefore, sendNowSetting } from "./setUp";

/**
 * WHAT THE EVENT'S ORGANISERS ARE HANDED ON ITS SURVEY AFTER TAB, built on the
 * server: the setting to change, what is fixed and why, and "Send it now"
 * with the number it emails. Counts only: never an answer, a count of
 * answers or a name (the people it emails are counted by `sendNowCount`,
 * from who it reaches less who it has reached). Its results stay admins'.
 *
 * Only for a published event whose survey its event set up, or which has
 * none yet; an admin's survey from Surveys is run from there, and a cancelled
 * event's survey goes nowhere, so there is nothing left to change or send.
 * An event with no survey yet is offered "Send it now" from its start, which
 * sets one up as it sends (`sendItNow`); switched off or with no stored
 * setting, with the line that it sends the standard questions. An event with
 * no stored setting (one published before the step) has no setting here to
 * change, only that button.
 */

export type SurveyAfterPanel = {
  /** The setting the form starts from: the survey's own, once it is set up. */
  setting: StoredSurveyAfter & { items: SurveyItem[] };
  /** Whether the event has its survey set up. */
  setUp: boolean;
  /** Whether the setting is drawn to change: never for an event with no stored setting and no survey. */
  settings: boolean;
  /** What can no longer change, each with the line that says why; null where it still can. */
  locks: { questions: string | null; send: string | null; reminder: string | null; off: string | null };
  /**
   * "Send it now (21)": the number it emails now, whether the survey it sends
   * has its one reminder on, and the line said above it (that it sends the
   * standard questions, where it sets them up); null when it isn't offered.
   */
  send: { emails: number; reminder: boolean; line: string | null } | null;
  /** Why "Send it now" isn't offered, when it would be but for this; null otherwise. */
  sendNote: string | null;
  /** "Send a test to me" is offered. */
  test: boolean;
  /** The standard questions as they stand, for "Back to the standard questions" and the step's marks. */
  standard: SurveyItem[];
};

const NOT_YET_STARTED = "You can send it from here once the event has started.";

/** Above "Send it now" at an event switched off or with no setting: what the press sets up and sends. */
export function standardLine(asksMissedToo: boolean): string {
  return asksMissedToo
    ? "No survey is set up for this event, so this sends the standard questions to everyone who came, and asks people who had a place and weren’t checked in what stopped them."
    : "No survey is set up for this event, so this sends the standard questions to everyone who came.";
}

const NOBODY = {
  signups: "Nobody to send it to yet: nobody has a place.",
  came: "Nobody to send it to yet: nobody has been checked in.",
} as const;

/** "Nobody to send it to yet: nobody has been checked in." */
function nobodyWords(survey: EventSurveyDoc): string {
  return survey.audience.kind === "event-signups" ? NOBODY.signups : NOBODY.came;
}

export async function surveyAfterPanel(
  db: Firestore,
  input: { event: EventDoc; survey: EventSurveyDoc | null; now: Date },
): Promise<SurveyAfterPanel | null> {
  const { event, survey, now } = input;
  if (event.status !== "published") return null;
  if (survey && !survey.auto) return null;
  if (!survey) {
    const standard = await eventStandardItems(db);
    const stored = event.surveyAfter;
    // "Send it now", which sets the survey up as it sends: from the start
    // until a week after, when its survey would reach people too late.
    const toSend = sendNowSetting(event);
    let send: SurveyAfterPanel["send"] = null;
    let sendNote: string | null = null;
    const until = addLaterUntil(event);
    if (!event.startAt || now.getTime() < event.startAt.getTime()) {
      sendNote = NOT_YET_STARTED;
    } else if (until && until.getTime() > now.getTime()) {
      const count = await sendNowCountBefore(db, event, toSend.setting);
      const missedToo = asksMissed(toSend.setting, event.noSignup) && openingOf(event) !== null;
      if (count.emails > 0) {
        send = { emails: count.emails, reminder: toSend.setting.reminder, line: toSend.standard ? standardLine(missedToo) : null };
      } else {
        sendNote = toSend.setting.who === "signups" && !event.noSignup ? NOBODY.signups : NOBODY.came;
      }
    }
    if (!stored && !send && !sendNote) return null;
    const base = stored ?? { ...newSurveyAfter(), on: false };
    return {
      setting: { ...base, items: settingsOf(base, standard).items },
      setUp: false,
      settings: stored !== null,
      locks: { questions: null, send: null, reminder: null, off: null },
      send,
      sendNote,
      test: false,
      standard,
    };
  }
  const auto = survey.auto;
  if (!auto) return null;
  const standard = await eventStandardItems(db);
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
      if (count.emails > 0) send = { emails: count.emails, reminder: auto.reminder, line: null };
      else sendNote = nobodyWords(survey);
    }
  }
  return {
    setting,
    setUp: true,
    settings: true,
    locks: {
      questions: opened ? SURVEY_AFTER_REFUSAL.opened : null,
      send: went ? SURVEY_AFTER_REFUSAL.sent : null,
      reminder: auto.remindedAt ? SURVEY_AFTER_REFUSAL.reminded : null,
      off: opened ? SURVEY_AFTER_REFUSAL.offOpened : null,
    },
    send,
    sendNote,
    test: live,
    standard,
  };
}
