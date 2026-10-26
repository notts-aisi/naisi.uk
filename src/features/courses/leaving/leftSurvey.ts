import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { RunAccess } from "@/features/courses/runAccess";
import { leavingSurveyCardFor, type SurveyCard } from "@/lib/surveys/waiting";

/**
 * THE LEAVING SURVEY'S CARD for the page that says somebody left
 * (wk-left-phone, Q46): the survey of the run they left while it waits for
 * them, by the one answer Home asks (`surveysWaitingFor`), or null. Read for
 * the session's own person, never in a view-as session, and a read that fails
 * draws no card. The three pages that draw the left page ask this, so each
 * shows the same.
 */
export async function leftPageSurvey(db: Firestore, access: Pick<RunAccess, "user" | "run">): Promise<SurveyCard | null> {
  try {
    return await leavingSurveyCardFor(db, access.user, access.run.id, new Date());
  } catch (err) {
    console.warn("[left page] could not read the leaving survey waiting for this person", access.run.id, err);
    return null;
  }
}
