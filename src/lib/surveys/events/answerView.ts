import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { EventRespondent, EventSurveyDoc } from "@/lib/firestore/surveys";
import { answerPagesOf, type AnswerScreen, type AnswerSubmit } from "../answerView";
import { closedOn, isOpen } from "../repo";
import { CONFIDENTIAL_HEADING, STATE_WORDS, closingWords, paragraphsOf } from "../words";
import { readEventAudience, respondentKey } from "./audience";
import { eventBoxPoints, eventLine } from "./words";

/**
 * WHAT A SURVEY AFTER AN EVENT'S ANSWER PAGE IS HANDED (sv-social-phone,
 * sv-privacy's "An event survey"), built on the server for one person: the
 * event and its day, the title and intro, the confidential box, and the
 * questions. Never a stored document, never a secret but the person's own,
 * and nothing about anybody else.
 *
 * The box says whose name the answers keep and whether the person came or
 * only signed up, which is read for them alone from who came. Reading this
 * page writes nothing: no record that it was opened, ever.
 */

export async function eventAnswerScreen(
  db: Firestore,
  survey: EventSurveyDoc,
  input: {
    /** The person the box is about, or null on a test link. */
    respondent: EventRespondent | null;
    /** Their whole name when they answer signed in with the QR code, else null. */
    signedInAs: string | null;
    answered: boolean;
    submit: AnswerSubmit;
    now: Date;
  },
): Promise<AnswerScreen> {
  if (input.answered) return { state: "message", ...STATE_WORDS.answered(null), consent: null };
  const test = input.submit.kind === "test";
  if (!test && !isOpen(survey, input.now)) {
    const on = closedOn(survey);
    return on ? { state: "message", ...STATE_WORDS.closed(on), consent: null } : { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  }
  if (!survey.closesAt || !survey.namesOffOn) return { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  let came: boolean | null = null;
  if (input.respondent) {
    const read = await readEventAudience(db, survey.audience.eventId);
    const key = respondentKey(input.respondent);
    came = read?.people.find((member) => member.key === key)?.came ?? false;
  }
  const box = eventBoxPoints({ namesOffOn: survey.namesOffOn, signedInAs: input.signedInAs, came });
  return {
    state: "open",
    survey: {
      eyebrow: [eventLine(survey.event.title, survey.event.startAt)],
      title: survey.title,
      intro: paragraphsOf(survey.intro),
      box: { heading: CONFIDENTIAL_HEADING, points: box.points, note: box.note },
      pages: answerPagesOf(survey),
      closing: closingWords(survey.closesAt),
      submit: input.submit,
      kairos: null,
    },
    consent: null,
  };
}
