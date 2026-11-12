import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { FOLLOW_UP_WINDOW_HOURS, registerFollowUpFallbackTaskId, registerFollowUpTaskId } from "@/lib/courses/unmarkedRegisters";
import { readCoursesConfig } from "@/lib/firestore/config";
import type { CourseAttendanceDoc } from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { REGISTER_FOLLOW_UP_TASK_SOURCE } from "@/lib/firestore/courseTasks";
import { jobStateFor, readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import {
  SCHEDULER_MARKERS_COLLECTION,
  registerReminderMarker,
  unmarkedRegisterMarker,
} from "@/lib/firestore/schedulerMarkers";
import { REGISTER_REMINDERS_JOB, UNMARKED_REGISTERS_JOB } from "@/lib/scheduler/registerJobs";

/**
 * THE CHASE OF A REGISTER THAT GOES BACK TO NOT TAKEN, as far as the jobs
 * allow. Two corrections put a finished register back to not taken: the
 * column was taken for the wrong session (cleared), or its lines belonged to
 * another session (moved there). The register is then chased again, the way
 * any register nobody has finished is:
 *
 *  - THE REMINDER to the group's facilitators (`courses-register-reminders`)
 *    goes in its own band, from 36 hours after the session ended for a day.
 *    Its markers for the session are taken away, so it goes again while that
 *    band is still to come or still open. Once the band has passed, it never
 *    goes for this session again: the job does not look that far back.
 *  - THE CARD for the programme's lead and admins
 *    (`courses-unmarked-registers`). A card the session already had, which
 *    finishing it archived, is put back on the board. With none, its marker
 *    is taken away, so the job raises one in its own band, from 60 hours
 *    after the session ended for a day; once that band has passed, none is
 *    raised.
 *
 * `chaseFacts` says which of these is true before anything is pressed, so
 * the preview says only what will happen; `restartChase` does it, after the
 * correction's transaction and best effort, as finishing a register
 * archives its card.
 */

const HOUR_MS = 3_600_000;

export type ChaseFacts = {
  /** The reminder email to the facilitators: it goes again, its time for this session has passed, or the job is off. */
  email: "returns" | "passed" | "off";
  /** The card for the programme's lead and admins: it comes back (or is raised in its time), its time has passed, or the job is off. */
  card: "returns" | "passed" | "off";
};

/** The card the unfinished-register job raised for this session, if it raised one. */
async function cardsOf(db: Firestore, runId: string, groupId: string, sessionKey: string) {
  const ours = (data: Record<string, unknown> | undefined): boolean => {
    const pointer = data?.sourceRef as Record<string, unknown> | null | undefined;
    return data?.source === REGISTER_FOLLOW_UP_TASK_SOURCE && pointer?.groupId === groupId && pointer?.sessionKey === sessionKey;
  };
  const refs = [
    db.collection("tasks").doc(registerFollowUpTaskId(runId, groupId, sessionKey)),
    db.collection("tasks").doc(registerFollowUpFallbackTaskId(runId, groupId, sessionKey)),
  ];
  const snaps = await db.getAll(...refs);
  return snaps.filter((snap) => snap.exists && ours(snap.data()));
}

export async function chaseFacts(
  db: Firestore,
  input: { runId: string; groupId: string; session: ResolvedSession; now: Date },
): Promise<ChaseFacts> {
  const { runId, groupId, session, now } = input;
  const [courses, scheduler, cards] = await Promise.all([
    readCoursesConfig(db),
    readSchedulerConfig(db),
    cardsOf(db, runId, groupId, session.sessionKey),
  ]);
  const endsAt = sessionInstants(session).endsAt;
  const until = (hours: number) => (endsAt ? endsAt.getTime() + (hours + FOLLOW_UP_WINDOW_HOURS) * HOUR_MS : 0);
  const emailOn = jobStateFor(scheduler, REGISTER_REMINDERS_JOB.id, REGISTER_REMINDERS_JOB.enabledByDefault).enabled;
  const cardOn = jobStateFor(scheduler, UNMARKED_REGISTERS_JOB.id, UNMARKED_REGISTERS_JOB.enabledByDefault).enabled;
  return {
    email: !emailOn ? "off" : now.getTime() < until(courses.unmarkedRegisterGraceHours) ? "returns" : "passed",
    card: !cardOn ? "off" : cards.length > 0 || now.getTime() < until(courses.registerTaskHours) ? "returns" : "passed",
  };
}

/**
 * Chase a register again that a correction put back to not taken: take its
 * markers away and put a card it had back on the board. Best effort, after
 * the correction: a failure leaves a register the group's page shows as not
 * taken, and the Overview's Needs attention still lists it.
 */
export async function restartChase(
  db: Firestore,
  input: {
    runId: string;
    group: Pick<CourseGroupDoc, "id" | "facilitatorUids">;
    sessionKey: string;
    /** The register as it was before the correction: who it could have chased. */
    register: Pick<CourseAttendanceDoc, "cover" | "markedByUid">;
  },
): Promise<void> {
  const { runId, group, sessionKey, register } = input;
  try {
    const chased = new Set<string>(group.facilitatorUids);
    if (register.cover) {
      chased.add(register.cover.byUid);
      if (register.cover.grantedByUid) chased.add(register.cover.grantedByUid);
    }
    if (register.markedByUid) chased.add(register.markedByUid);
    // A uid a marker id cannot hold names no marker: it is skipped, never a
    // reason to leave the rest.
    const reminderIds = [...chased].flatMap((uid) => {
      try {
        return [registerReminderMarker(group.id, sessionKey, uid).id];
      } catch {
        return [];
      }
    });
    const markers = [unmarkedRegisterMarker(group.id, sessionKey).id, ...reminderIds];
    const batch = db.batch();
    for (const id of markers) batch.delete(db.collection(SCHEDULER_MARKERS_COLLECTION).doc(id));
    await batch.commit();
    const cards = await cardsOf(db, runId, group.id, sessionKey);
    await Promise.all(
      cards
        .filter((snap) => snap.data()?.archived === true)
        .map((snap) => snap.ref.update({ archived: false, updatedAt: FieldValue.serverTimestamp() })),
    );
  } catch (err) {
    console.error("[courses register correction] could not chase the register again", group.id, sessionKey, err);
  }
}
