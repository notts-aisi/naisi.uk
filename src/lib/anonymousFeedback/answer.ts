import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { ANONYMOUS_WAITING_COLLECTION, answerToKeep, dayOf, type AnonymousForm, type SentAnswers } from "./model";

/**
 * KEEPING ONE ANSWER TO THE ANONYMOUS FORM: the one writer of an answer as it
 * comes in.
 *
 * It is handed the form the link opened and the three answers, and writes
 * exactly `ANSWER_FIELDS` (`./model`): the answers, the programme and the
 * day in London. It is never handed a request, a session, a cookie or an
 * address, so it cannot keep one. The record waits in
 * `anonymousFeedbackWaiting` until the night's move (`./move`), and its id is
 * never handed back to anybody, so nobody can point to an answer as theirs.
 */
export async function keepAnonymousAnswer(
  db: Firestore,
  form: Pick<AnonymousForm, "roundId" | "programmeId" | "runId">,
  sent: SentAnswers,
  now: Date,
): Promise<void> {
  const answer = answerToKeep(form, { keep: sent.keep, change: sent.change, drop: sent.drop }, dayOf(now));
  await db.collection(ANONYMOUS_WAITING_COLLECTION).add({
    roundId: answer.roundId,
    programmeId: answer.programmeId,
    runId: answer.runId,
    keep: answer.keep,
    change: answer.change,
    drop: answer.drop,
    day: answer.day,
  });
}
