import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { SURVEYS_COLLECTION, isCheckIn, normalizeSurvey } from "@/lib/firestore/surveys";
import { isOpen } from "../repo";
import { checkInSurveyId } from "./ids";
import { CHECK_IN_REFUSAL } from "./words";

/**
 * "CLOSE IT NOW", from the register: the check-in of one session of the group
 * takes no more answers from this moment, and it is never opened again, as a
 * survey closed by hand never is. Nobody is emailed. The route has asked the
 * register's gate first (the group's live facilitators and admins), and the
 * page asked once, naming how many have not sent it.
 *
 * The check-in is found by its id, worked out from the session, so a request
 * can only ever close this group's own.
 */
export async function closeCheckIn(
  db: Firestore,
  input: { runId: string; group: CourseGroupDoc; sessionKey: string; now: Date },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ref = db.collection(SURVEYS_COLLECTION).doc(checkInSurveyId(input.runId, input.group.id, input.sessionKey));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 409, error: CHECK_IN_REFUSAL.notOpen } as const;
    const survey = normalizeSurvey(snap.id, snap.data() ?? {});
    if (!isCheckIn(survey) || survey.audience.groupId !== input.group.id || !isOpen(survey, input.now)) {
      return { ok: false, status: 409, error: CHECK_IN_REFUSAL.notOpen } as const;
    }
    tx.update(ref, { closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { ok: true } as const;
  });
}
