import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isProgrammeAudience, type SurveyDoc, type SurveyKind } from "@/lib/firestore/surveys";
import { readSurvey } from "./repo";

/**
 * A PROGRAMME'S SURVEY RESULTS FOR ITS LEAD (Q41, Q49 A): totals and comments
 * for their own programme, made on the server, never a name, from the first
 * answer, as admins read them. The pages that ask this have held the caller
 * to the programme's lead or an admin first (`loadProgrammeRun`).
 *
 * WHICH SURVEYS: every kind a programme has of its own (`LEAD_READS`): the
 * survey before it, the one at its end, the follow-ups at 6 and 12 months
 * and the survey about leaving. Never a survey after an event, which is no
 * programme's, and never another programme's. The box at the top of each of
 * these tells the person the lead sees totals and comments and never names
 * (`confidentialPoints` in `./words.ts`), and the privacy policy says the
 * same; a kind added here is a kind the box and the policy say the lead reads.
 *
 * The lead's pages list each question's comments by their words, not in the
 * order they came in, so their order says nothing of when, or after whom,
 * each was written.
 */
export const LEAD_READS: readonly SurveyKind[] = ["before", "after", "followUp6", "followUp12", "leaving"];

/** The programme's survey with this id, when it is one its lead reads; null for any other. */
export async function leadSurveyOf(db: Firestore, roundId: string, programmeId: string, surveyId: string): Promise<SurveyDoc | null> {
  const survey = await readSurvey(db, surveyId);
  if (!survey || !LEAD_READS.includes(survey.kind)) return null;
  if (!isProgrammeAudience(survey.audience, roundId, programmeId)) return null;
  return survey;
}
