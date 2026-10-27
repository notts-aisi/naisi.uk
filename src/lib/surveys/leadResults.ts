import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isProgrammeAudience, type SurveyDoc, type SurveyKind } from "@/lib/firestore/surveys";
import { readSurvey } from "./repo";

/**
 * A PROGRAMME'S SURVEY RESULTS FOR ITS LEAD (Q41, Q49 A): totals and comments
 * for their own programme, made on the server, never a name, from the first
 * answer, as admins read them. The page that asks this has held the caller to
 * the programme's lead or an admin first (`loadProgrammeRun`).
 *
 * WHICH SURVEYS: the leaving survey alone, for now (`LEAD_READS`). A lead's
 * reading of the programme's other surveys comes with their Surveys tab and
 * the policy's sentence for it; adding a kind here is that change.
 *
 * The lead's page lists each question's comments by their words, not in the
 * order they came in, so their order says nothing of when, or after whom,
 * each was written.
 */
export const LEAD_READS: readonly SurveyKind[] = ["leaving"];

/** The programme's survey with this id, when it is one its lead reads; null for any other. */
export async function leadSurveyOf(db: Firestore, roundId: string, programmeId: string, surveyId: string): Promise<SurveyDoc | null> {
  const survey = await readSurvey(db, surveyId);
  if (!survey || !LEAD_READS.includes(survey.kind)) return null;
  if (!isProgrammeAudience(survey.audience, roundId, programmeId)) return null;
  return survey;
}
