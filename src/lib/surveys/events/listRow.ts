import type { ListRow } from "../adminView";
import type { EventSurveyDoc } from "@/lib/firestore/surveys";
import { closedOn, surveyState } from "../repo";
import { LIST_WORDS, closesWords } from "../words";
import { eventListLine } from "./words";

/**
 * A survey after an event as Run NAISI › Surveys lists it (sv-list): its
 * name, "Event: Sun 1 Nov", how many answered and when it closes. Answers are
 * a count, not "of" anybody: the QR code takes answers from people it was
 * never emailed to. Pure, so the list's own module can ask it.
 */

/** One row of Run NAISI › Surveys: "After VR games night", "Event: Sun 1 Nov", "15 answers". */
export function eventListRow(survey: EventSurveyDoc, rows: readonly { answered: boolean }[], now: Date): ListRow {
  const state = surveyState(survey, now);
  const answered = rows.filter((row) => row.answered).length;
  const ends = closedOn(survey);
  return {
    id: survey.id,
    name: survey.name,
    programme: eventListLine(survey.event.startAt),
    state,
    answers: state === "draft" ? LIST_WORDS.notSent : `${answered} ${answered === 1 ? "answer" : "answers"}`,
    share: null,
    closes: state === "draft" || !ends ? "" : closesWords(ends, state === "closed"),
    unanswered: "",
  };
}

