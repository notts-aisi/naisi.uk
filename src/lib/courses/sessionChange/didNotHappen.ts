import "server-only";
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { linesSetForSession } from "@/lib/courses/registerCover/didNotHappen";
import { countSessionReports } from "@/lib/courses/sessionReports/readers";
import { sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { registerFollowUpTaskId } from "@/lib/courses/unmarkedRegisters";
import type { SessionUser } from "@/lib/firebase/session";
import {
  COVER,
  FACILITATOR_RECORD,
  ONLINE,
  SET_BY,
  normalizeCourseAttendance,
} from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { REGISTER_FOLLOW_UP_TASK_SOURCE } from "@/lib/firestore/courseTasks";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { checkInWasOpened } from "@/lib/surveys/checkIns/facilitatorView";
import { groupHistoryRow } from "../groupChange/facts";

export { callsOffDraft, takenRefusal } from "@/lib/courses/registerCover/didNotHappen";

/**
 * IT DIDN'T HAPPEN, ON A REGISTER SOMEBODY STARTED: calling off a session
 * after it passed, with the two cancels ("Cancel and keep pace", "Cancel and
 * push the rest back a week"), when its register is a DRAFT that has marks.
 * Kept beside the one-week change and asked from it, never folded into it:
 *
 *  - WHO: the change route's own gate (the group's facilitators with
 *    standing, the programme's lead, the run's track leads, admins).
 *  - A DRAFT WITH MARKS may be called off (`callsOffDraft`). A FINISHED
 *    register may not, here: whether it happened is a correction then
 *    (`takenRefusal`). A register that already says it did not happen, and
 *    every other change to a session whose register was taken, keep the
 *    one-week change's own refusal.
 *  - IN THE SAME TRANSACTION as the change, the lines set for the session go
 *    (`writeDidNotHappen`), and what each said goes into one history row's
 *    `before` (`session-did-not-happen`, registers), so nothing is lost
 *    silently. What people said in advance stays, as the one-week change
 *    keeps it for any cancelled or pushed week. The register is no longer
 *    taken after it: the person who last saved it is cleared with the lines.
 *  - PUSHED BACK, the register is the replacing session's, a week later, so
 *    nothing of the session that did not happen stays on it: its cover and
 *    the record of whether its facilitators were there go too, and its start
 *    follows the session. Kept pace, they stay: that record is the record of
 *    a session nobody ran.
 *  - AFTER IT, best effort, the card the unfinished-register job raised for
 *    the session is archived (`closeCalledOffFollowUp`): there is no register
 *    left to finish.
 */

/** What the preview of calling off a session after it passed says will happen, beyond the change itself. */
export type DidNotHappenFacts = {
  /** The week leaves everyone's attendance. */
  leavesAttendance: true;
  /** The reminders to the facilitators about its register stop, and nothing more chases it. */
  chaseStops: true;
  /** A check-in was opened for the session. */
  checkIn: boolean;
  /** How many session reports it has. */
  reports: number;
  /** How many lines set for the session would be cleared, with what each said. */
  lines: { cleared: number; said: Record<string, string> };
};

export async function didNotHappenFacts(
  db: Firestore,
  input: { run: Pick<CourseRunDoc, "id">; group: Pick<CourseGroupDoc, "id">; session: ResolvedSession; register: Readonly<Record<string, unknown>> | undefined },
): Promise<DidNotHappenFacts> {
  const { run, group, session } = input;
  const [checkIn, reports] = await Promise.all([
    checkInWasOpened(db, run.id, group.id, session.sessionKey),
    countSessionReports(db, run.id, group.id, session.sessionKey),
  ]);
  const lines = input.register ? linesSetForSession(normalizeCourseAttendance("register", input.register)) : { uids: [], said: {} };
  return {
    leavesAttendance: true,
    chaseStops: true,
    checkIn,
    reports,
    lines: { cleared: lines.uids.length, said: lines.said },
  };
}

/** The names the history's sentence gives the people whose lines are cleared, read before the transaction. */
export async function clearedNames(db: Firestore, register: Readonly<Record<string, unknown>> | undefined): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!register) return names;
  const { uids } = linesSetForSession(normalizeCourseAttendance("register", register));
  const wanted = uids.filter((uid) => uid && !uid.includes("/"));
  if (wanted.length === 0) return names;
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) names.set(snap.id, snap.exists ? displayNameOf(snap.data() ?? {}) : "NAISI member");
  return names;
}

/**
 * CLEAR THE LINES SET FOR A SESSION THAT DID NOT HAPPEN, inside the change's
 * transaction (every read is done), and write the history row that keeps
 * what each said. `register` is the draft as read in the transaction.
 */
export function writeDidNotHappen(
  tx: Transaction,
  db: Firestore,
  input: {
    ref: DocumentReference;
    register: Readonly<Record<string, unknown>>;
    kind: "cancel" | "push";
    run: Pick<CourseRunDoc, "id">;
    group: Pick<CourseGroupDoc, "id" | "name">;
    actor: Pick<SessionUser, "uid" | "displayName">;
    weekNumber: number;
    weekId: string;
    /** The session after the press: a pushed one starts a week later. */
    after: ResolvedSession | null;
    reason: string;
    emailed: number;
    names: ReadonlyMap<string, string>;
  },
): void {
  const stored = normalizeCourseAttendance(input.ref.id, input.register);
  const { uids, said } = linesSetForSession(stored);
  const records: Record<string, FieldValue> = {};
  const online: Record<string, FieldValue> = {};
  const stamps: Record<string, FieldValue> = {};
  for (const uid of uids) {
    records[uid] = FieldValue.delete();
    if (Object.hasOwn(stored.online, uid)) online[uid] = FieldValue.delete();
    if (stored.setBy[uid]) stamps[uid] = FieldValue.delete();
  }
  const raw = input.register as Record<string, unknown>;
  const pushed = input.kind === "push";
  const startsAt = pushed && input.after ? sessionInstants(input.after).startsAt : null;
  tx.set(
    input.ref,
    {
      ...(uids.length > 0 ? { records } : {}),
      ...(Object.keys(online).length > 0 ? { [ONLINE]: online } : {}),
      ...(Object.keys(stamps).length > 0 ? { [SET_BY]: stamps } : {}),
      // Nobody has taken it any more: the register is not taken.
      ...(raw.markedByUid !== undefined ? { markedByUid: FieldValue.delete() } : {}),
      // Pushed back, the register is the next session's: nothing of this one stays.
      ...(pushed && raw[COVER] !== undefined ? { [COVER]: FieldValue.delete() } : {}),
      ...(pushed && raw[FACILITATOR_RECORD] !== undefined ? { [FACILITATOR_RECORD]: FieldValue.delete() } : {}),
      ...(startsAt ? { sessionAt: startsAt } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const lines = uids.map((uid) => `${input.names.get(uid) ?? "NAISI member"} ${said[uid]}`);
  const what = pushed ? "the rest pushed back a week" : "the group keeping pace";
  tx.set(
    db.collection(COURSE_AUDIT_COLLECTION).doc(),
    groupHistoryRow({
      kind: "session-did-not-happen",
      run: input.run,
      group: input.group,
      actor: input.actor,
      detail:
        uids.length > 0
          ? `Week ${input.weekNumber} didn’t happen, ${what}. Cleared ${uids.length === 1 ? "1 line" : `${uids.length} lines`} of its register: ${lines.join(", ")}.`
          : `Week ${input.weekNumber} didn’t happen, ${what}.`,
      weekId: input.weekId,
      before: uids.length > 0 ? said : null,
      after: { kind: input.kind, cleared: uids.length },
      reason: input.reason,
      emailed: input.emailed,
    }),
  );
}

/**
 * Archive the card the unfinished-register job raised for a session that
 * did not happen, if it raised one: there is no register left to finish.
 * Best effort, after the change: the card is found by its deterministic id
 * and by the pointer it was aimed with, archived and never deleted.
 */
export async function closeCalledOffFollowUp(
  db: Firestore,
  input: { runId: string; groupId: string; sessionKey: string },
): Promise<void> {
  const { runId, groupId, sessionKey } = input;
  try {
    const patch = { archived: true, updatedAt: FieldValue.serverTimestamp() };
    const ours = (data: Record<string, unknown> | undefined): boolean => {
      const pointer = data?.sourceRef as Record<string, unknown> | null | undefined;
      return data?.source === REGISTER_FOLLOW_UP_TASK_SOURCE && pointer?.groupId === groupId && pointer?.sessionKey === sessionKey;
    };
    const primary = db.collection("tasks").doc(registerFollowUpTaskId(runId, groupId, sessionKey));
    const snap = await primary.get();
    if (snap.exists && ours(snap.data())) {
      if (!snap.data()?.archived) await primary.update(patch);
      return;
    }
    const found = await db
      .collection("tasks")
      .where("source", "==", REGISTER_FOLLOW_UP_TASK_SOURCE)
      .where("sourceRef.groupId", "==", groupId)
      .where("sourceRef.sessionKey", "==", sessionKey)
      .limit(5)
      .get();
    await Promise.all(found.docs.filter((doc) => !doc.data().archived).map((doc) => doc.ref.update(patch)));
  } catch (err) {
    console.error("[courses session change] could not close the unfinished-register card", groupId, sessionKey, err);
  }
}
