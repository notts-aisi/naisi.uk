import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { loadToldRegisterMembers } from "@/lib/courses/registerAccess";
import type { ResolvedSession } from "@/lib/courses/sessions";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  isCheckIn,
  normalizeSurvey,
  surveyPersonId,
} from "@/lib/firestore/surveys";
import { isOpen } from "../repo";
import { mintSurveyToken } from "../token";
import { checkInSurveyId } from "./ids";
import { HERE_STATUSES, MAX_CHECK_IN_PEOPLE, hereOf } from "./model";
import { readRegisterMarks } from "./sessionRead";

/**
 * SOMEBODY MARKED THERE AFTER THE CHECK-IN OPENED gets their own row on it,
 * and no email: the check-in is on their Home, and the code the facilitator
 * shows opens it for them signed in. Asked by the register's marking route
 * after every mark it keeps: nothing is read unless a mark says somebody was
 * there, and then one read when the session has no open check-in, which is
 * nearly always.
 *
 * Who it reaches is the opening's own rule (`hereOf`): the register's rows
 * (people Publish has told, whoever marked them) its marks say were there,
 * never the group's facilitators. A row made once
 * stays: somebody marked there and then unmarked has been reached, and keeps
 * it. The rows made are counted on the check-in as one `joined` press, so
 * its rate is of everybody it reached.
 *
 * It never throws into the register: a mark is kept whatever happens here,
 * and the caller logs a failure.
 */
export async function reachLateMarks(
  db: Firestore,
  input: {
    runId: string;
    group: CourseGroupDoc;
    session: ResolvedSession;
    /** The marks the register just kept: nothing is read unless one says somebody was there. */
    marked: readonly (AttendanceStatus | null)[];
    markedBy: string;
    now: Date;
  },
): Promise<number> {
  const { runId, group, session, now } = input;
  if (!input.marked.some((status) => status !== null && HERE_STATUSES.includes(status))) return 0;
  const surveyRef = db.collection(SURVEYS_COLLECTION).doc(checkInSurveyId(runId, group.id, session.sessionKey));
  const first = await surveyRef.get();
  if (!first.exists) return 0;
  const survey = normalizeSurvey(first.id, first.data() ?? {});
  if (!isCheckIn(survey) || !isOpen(survey, now)) return 0;

  const [register, roster] = await Promise.all([
    readRegisterMarks(db, runId, group.id, session),
    loadToldRegisterMembers(db, runId, group.id),
  ]);
  if (!register.held) return 0;
  const here = hereOf(register.marks, roster.members, group.facilitatorUids).slice(0, MAX_CHECK_IN_PEOPLE);
  if (here.length === 0) return 0;
  const rowRefs = here.map((uid) => db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(survey.id, { kind: "account", uid })));

  return db.runTransaction(async (tx) => {
    const [surveySnap, ...rowSnaps] = await tx.getAll(surveyRef, ...rowRefs);
    if (!surveySnap.exists) return 0;
    const fresh = normalizeSurvey(surveySnap.id, surveySnap.data() ?? {});
    // Closed by hand, or at its time, since it was read: it reaches nobody now.
    if (!isCheckIn(fresh) || !isOpen(fresh, now)) return 0;
    const missing = here.filter((_, index) => !rowSnaps[index]?.exists);
    if (missing.length === 0) return 0;
    const pressId = randomUUID();
    for (const uid of missing) {
      tx.create(db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(fresh.id, { kind: "account", uid })), {
        surveyId: fresh.id,
        roundId: fresh.audience.roundId,
        respondent: { kind: "account", uid },
        token: mintSurveyToken(),
        pressId,
        sentAt: FieldValue.serverTimestamp(),
        delivery: null,
        remindedAt: null,
        reminders: 0,
        answered: false,
      });
    }
    const presses = Array.isArray((surveySnap.data() ?? {}).presses) ? [...((surveySnap.data() ?? {}).presses as unknown[])] : [];
    presses.push({ id: pressId, kind: "joined", at: now, count: missing.length, byUid: input.markedBy });
    tx.update(surveyRef, { presses, updatedAt: FieldValue.serverTimestamp() });
    return missing.length;
  });
}
