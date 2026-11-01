import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunLead } from "@/lib/courses/programmeLead";
import type { CheckInSurveyDoc } from "@/lib/firestore/surveys";
import type { AnswerPage, AnswerSubmit, AnswerSurvey } from "../answerView";
import { CONFIDENTIAL_HEADING } from "../words";
import {
  CHECK_IN_PAGE_WORDS,
  checkInBoxPoints,
  checkInClosingWords,
  checkInMinutesWords,
  sessionLineWords,
} from "./words";

/**
 * A CHECK-IN, AS ITS PAGE DRAWS IT for the person answering: "Check-in · 2
 * minutes", "How was week 3?", "Group C, today at 3pm." (the day and time on
 * any other London day), the confidential box AT THE TOP (every survey says
 * so there: the privacy policy's "each survey says so at the top"), the
 * questions on one page, and "Send check-in". No line about which questions
 * need an answer: the one that does not says "(optional)" beside it.
 *
 * The box names the programme's lead while they still stand as its lead,
 * from records, and says what the group's facilitators see: the group's
 * totals, never the person's answers. Nothing about anybody else is read.
 * Reading this writes nothing.
 */
export async function checkInSurveyFor(
  db: Firestore,
  survey: CheckInSurveyDoc,
  input: { pages: AnswerPage[]; submit: AnswerSubmit; now: Date },
): Promise<AnswerSurvey> {
  const lead = await readRunLead(db, survey.runId);
  return {
    eyebrow: [CHECK_IN_PAGE_WORDS.eyebrow, checkInMinutesWords(survey.minutes)],
    title: survey.title,
    intro: [sessionLineWords(survey.checkIn.groupName, survey.checkIn.startsAt, input.now)],
    rule: "",
    box: {
      heading: CONFIDENTIAL_HEADING,
      points: checkInBoxPoints({
        leadName: lead?.firstName || null,
        programmeName: survey.programmeName,
        namesOffOn: survey.namesOffOn ?? "",
        programmeKind: survey.programmeKind,
      }),
      note: "",
    },
    pages: input.pages,
    closing: survey.closesAt ? checkInClosingWords(survey.closesAt, input.now) : "",
    submit: input.submit,
    kairos: null,
    send: CHECK_IN_PAGE_WORDS.send,
    bar: CHECK_IN_PAGE_WORDS.eyebrow,
  };
}
