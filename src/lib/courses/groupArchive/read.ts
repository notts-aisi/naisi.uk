import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore, Query, QuerySnapshot, Transaction } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import type { RegisterState } from "@/lib/courses/unmarkedRegisters";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { startedSessions, type GroupArchiveFacts } from "./plan";

/**
 * WHAT ARCHIVING OR RESTORING ONE GROUP READS, once before the press's
 * transaction and again inside it, so the decision the press writes on is
 * the one made of what the transaction read.
 *
 * The group, its run, the run's groups and every place on the run (two
 * queries of one equality each, so no declared index), and the registers of
 * the group's sessions that have started, addressed by id. Null when the
 * group is not there.
 */
export async function readGroupArchiveFacts(
  db: Firestore,
  groupId: string,
  now: Date,
  tx?: Transaction,
): Promise<GroupArchiveFacts | null> {
  const get = (ref: DocumentReference): Promise<DocumentSnapshot> => (tx ? tx.get(ref) : ref.get());
  const list = (query: Query): Promise<QuerySnapshot> => (tx ? tx.get(query) : query.get());

  const groupSnap = await get(db.collection("courseGroups").doc(groupId));
  if (!groupSnap.exists) return null;
  const group: CourseGroupDoc = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});

  const runId = isAddressableId(group.runId) ? group.runId : "";
  if (!runId) {
    return { group, run: null, destroying: false, runGroups: [group], places: [], registers: new Map() };
  }
  const [runSnap, groupsSnap, placesSnap] = await Promise.all([
    get(db.collection("courseRuns").doc(runId)),
    list(db.collection("courseGroups").where("runId", "==", runId)),
    list(db.collection("courseEnrolments").where("runId", "==", runId)),
  ]);
  const run = runSnap.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}) : null;
  const destroying = runSnap.exists && runSnap.data()?.destroying === true;
  const runGroups = groupsSnap.docs
    .map((doc) => (doc.id === group.id ? group : normalizeCourseGroup(doc.id, doc.data() ?? {})))
    .filter((each) => each.runId === runId);
  if (!runGroups.some((each) => each.id === group.id)) runGroups.push(group);
  const places = placesSnap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter((place) => place.runId === runId);

  const registers = new Map<string, RegisterState>();
  if (run) {
    // Only sessions that have started and were not called off: a register of
    // a session called off is not asked about, whatever it says.
    const started = startedSessions(run, group, now).filter((session) => !session.cancelled);
    const refs = started.map((session) =>
      db.collection("courseAttendance").doc(attendanceDocId(runId, group.id, session.weekNumber, session.occurrence)),
    );
    const snaps = refs.length === 0 ? [] : tx ? await tx.getAll(...refs) : await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const register = normalizeCourseAttendance(snap.id, snap.data() ?? {});
      if (register.runId !== runId || register.groupId !== group.id) continue;
      registers.set(register.sessionKey, { exists: true, held: register.held, pushedAt: register.pushedAt });
    }
  }

  return { group, run, destroying, runGroups, places, registers };
}
