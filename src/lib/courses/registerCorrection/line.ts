import "server-only";
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { readMirrorPlan, type MirrorPlan, type RegisterOverride } from "@/lib/courses/attendanceMirror";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { displayNameOf, type MirrorMember } from "@/lib/courses/registerAccess";
import type { ResolvedSession } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import {
  ATTENDANCE_LIMITS,
  CORRECTED,
  EXCUSAL_KEPT,
  ONLINE,
  SET_BY,
  attendanceDocId,
  cameBy,
  normalizeCourseAttendance,
  type AttendanceStatus,
  type CourseAttendanceDoc,
  type ExcusalKept,
} from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { afterValues, beforeValues, lineOf, sameLine, wordsOf, type RegisterLine } from "./model";
import { lineCorrectedDetail } from "./words";

/**
 * CORRECTING LINES OF A FINISHED REGISTER, in one transaction: the admin's
 * and the lead's correction (`PATCH .../attendance`), an approved request
 * (`POST /api/courses/requests/[requestId]/approve`) and an approved request
 * to be excused that finds the line Absent on a finished register
 * (`.../excused/approve`, `ApprovalCorrection`) all come here, so a line is
 * corrected one way whoever asked.
 *
 * WHAT ONE CORRECTION WRITES, together or not at all:
 *  - each line's mark, and whether they were in the room or online;
 *  - who set it (`setBy`, `how: "correction"`), and that it was corrected,
 *    when and by whom (`corrected`), for each line it moved; a line it
 *    clears loses both, as a cleared line always loses its stamp;
 *  - the figures of everybody whose figures read this group's registers,
 *    worked out again in full from the registers (`readMirrorPlan`);
 *  - one history row per line it moved (`attendance-edit`, registers), with
 *    the week, the person, what the line said before (and who set it, when),
 *    what it says after, the reason, and the request it came from.
 *
 * NEVER A NOTE'S WORDS. A session's note can change on the admin's lane
 * beside a correction; its row says that it changed, never what it said,
 * because the history is read by the programme's lead, who is never sent a
 * facilitator's notes.
 *
 * NOBODY IS EMAILED. The person sees the corrected line on their own list of
 * sessions, with the day it was corrected and nothing else.
 *
 * All reads happen in `readLineCorrection`, before any write: a Firestore
 * transaction refuses a read after a write.
 */

/** No register for the session. */
export class CorrectionMissingError extends Error {}
/** The register is still its facilitators' draft. */
export class CorrectionUnfinishedError extends Error {}
/** The register says the session did not happen. */
export class CorrectionNotHeldError extends Error {}
/** The merged register would hold more lines than a register may. */
export class CorrectionFullError extends Error {}

/** One line a correction asks for: its mark (null clears it), and where they were when the press says. */
export type WantedLine = { mark: AttendanceStatus | null; online: boolean | undefined };

/** One line the correction moves. */
export type MovedLine = { uid: string; before: RegisterLine; after: RegisterLine };

export type LineCorrectionPlan = {
  ref: DocumentReference;
  register: CourseAttendanceDoc;
  moved: MovedLine[];
  mirror: MirrorPlan;
};

/**
 * Where somebody marked as having come was after a correction: what the
 * press says, else what the register kept beside a mark that already said
 * they came, else their own word in advance that they were joining online.
 */
function placeAfter(given: boolean | undefined, before: RegisterLine, saidOnline: boolean): boolean {
  if (typeof given === "boolean") return given;
  if (cameBy(before.mark)) return before.online;
  return saidOnline;
}

/** Read the register and everything the figures need, and work out what moves. Reads only. */
export async function readLineCorrection(
  tx: Transaction,
  db: Firestore,
  input: {
    run: Pick<CourseRunDoc, "id">;
    groupId: string;
    session: ResolvedSession;
    sessions: ResolvedSession[];
    mirrorMembers: MirrorMember[];
    wanted: ReadonlyMap<string, WantedLine>;
    now: Date;
  },
): Promise<LineCorrectionPlan> {
  const { run, groupId, session, now } = input;
  const ref = db.collection("courseAttendance").doc(attendanceDocId(run.id, groupId, session.weekNumber, session.occurrence));
  const snap = await tx.get(ref);
  if (!snap.exists) throw new CorrectionMissingError();
  const data = snap.data() ?? {};
  const register = normalizeCourseAttendance(snap.id, data);
  if (!register.pushedAt) throw new CorrectionUnfinishedError();
  // A session that did not happen, called off or said so on its register,
  // has no line to correct: whether it happened is the column's.
  if (session.cancelled || !register.held) throw new CorrectionNotHeldError();

  const moved: MovedLine[] = [];
  for (const [uid, want] of input.wanted) {
    const before = lineOf(register, uid);
    const said = Boolean(register.onlineSaid[uid]);
    const after: RegisterLine = {
      mark: want.mark,
      online: cameBy(want.mark) && placeAfter(want.online, before, said),
    };
    if (!sameLine(before, after)) moved.push({ uid, before, after });
  }

  // The cap is a property of the MERGED map, counted on the raw keys so a
  // register already over it is counted honestly.
  const keys = new Set(Object.keys((data.records ?? {}) as Record<string, unknown>));
  for (const line of moved) {
    if (line.after.mark === null) keys.delete(line.uid);
    else keys.add(line.uid);
  }
  if (keys.size > ATTENDANCE_LIMITS.maxRecords) throw new CorrectionFullError();

  const overrides = new Map<string, RegisterOverride>([
    [
      session.sessionKey,
      {
        marks: new Map(moved.map((line) => [line.uid, line.after.mark])),
        online: new Map(moved.map((line) => [line.uid, cameBy(line.after.mark) ? line.after.online : null])),
        // Finished, and staying finished: stated so the figures count this
        // session whatever the read raced with.
        pushedAt: register.pushedAt,
      },
    ],
  ]);
  const mirror = await readMirrorPlan(tx, db, {
    runId: run.id,
    groupId,
    sessions: input.sessions,
    members: input.mirrorMembers,
    overrides,
    now,
  });
  return { ref, register, moved, mirror };
}

/** Who asked for a correction, for an approved request's history row. */
export type AskedBy = { requestId: string; firstName: string; at: Date };

/**
 * A correction made by approving a request to be excused
 * (`src/lib/courses/excused/decide.ts`): the same writes as any correction
 * (the line, the `corrected` stamp, the figures, a history row per line with
 * the request's id), with three differences. The line is stamped as set by
 * the approval (`how: "approval"`); the row's sentence is the approval's own;
 * and the row carries NO reason: the person's reason is read by admins only,
 * and the group's history is read by the programme's lead.
 */
export type ApprovalCorrection = {
  requestId: string;
  /** The history row's sentence for one moved line. Never the reason. */
  detail: (line: MovedLine) => string;
  /** How many people the approval emails. */
  emailed: number;
};

/**
 * Write what `readLineCorrection` worked out, in the same transaction. The
 * session's note may change beside it on the admin's lane (`notes`); its row
 * never holds the note's words.
 */
export function writeLineCorrection(
  tx: Transaction,
  db: Firestore,
  plan: LineCorrectionPlan,
  input: {
    run: Pick<CourseRunDoc, "id">;
    group: Pick<CourseGroupDoc, "id" | "name">;
    session: ResolvedSession;
    actor: Pick<SessionUser, "uid" | "displayName">;
    reason: string;
    /** The name each person goes by, for the history's sentence. */
    names: ReadonlyMap<string, string>;
    asked: AskedBy | null;
    /** A changed session note: "rewritten" or "cleared". Null when it did not change. */
    notes: { value: string } | null;
    now: Date;
    /** Made by approving a request to be excused: see `ApprovalCorrection`. */
    approval?: ApprovalCorrection;
    /**
     * Made by somebody who does not decide excusals (a run's track lead):
     * an excusal standing on a line they correct is kept (`excusalKept`), as
     * the marking route keeps it, so their next correction cannot make it an
     * absence either. Absent: an admin's or the lead's, and an approval.
     */
    excusalHeld?: boolean;
  },
): number {
  const { ref, register, moved, mirror } = plan;
  const { actor, session, now, approval } = input;
  const how = approval ? "approval" : "correction";
  let logged = 0;

  if (moved.length > 0 || input.notes) {
    const records: Record<string, AttendanceStatus | FieldValue> = {};
    const where: Record<string, boolean | FieldValue> = {};
    const stamps: Record<string, { byUid: string; at: Date; how: "correction" | "approval" } | FieldValue> = {};
    const corrected: Record<string, { at: Date; byUid: string } | FieldValue> = {};
    // An admin's or the lead's correction decides the line: an excusal kept
    // beside it goes. Anybody else's keeps it, and sets it when they record
    // that the person came over an excused line (they never set excused: the
    // route refuses it).
    const kept: Record<string, ExcusalKept | FieldValue> = {};
    for (const line of moved) {
      const { uid, after } = line;
      if (!input.excusalHeld) {
        if (register.excusalKept[uid]) kept[uid] = FieldValue.delete();
      } else if (cameBy(after.mark) && line.before.mark === "excused") {
        // With the stamp of the excused line it displaces, as the marking route keeps it.
        kept[uid] = register.setBy[uid] ?? true;
      }
      records[uid] = after.mark === null ? FieldValue.delete() : after.mark;
      if (cameBy(after.mark)) where[uid] = after.online;
      else if (Object.hasOwn(register.online, uid)) where[uid] = FieldValue.delete();
      if (after.mark !== null) {
        stamps[uid] = { byUid: actor.uid, at: now, how };
        corrected[uid] = { at: now, byUid: actor.uid };
      } else {
        // A cleared line is no line: it loses its stamps, as a cleared line
        // always has. The history row keeps what it said and who set it.
        if (register.setBy[uid]) stamps[uid] = FieldValue.delete();
        if (register.corrected[uid]) corrected[uid] = FieldValue.delete();
      }
    }
    tx.set(
      ref,
      {
        ...(moved.length > 0 ? { records } : {}),
        ...(Object.keys(where).length > 0 ? { [ONLINE]: where } : {}),
        ...(Object.keys(stamps).length > 0 ? { [SET_BY]: stamps } : {}),
        ...(Object.keys(corrected).length > 0 ? { [CORRECTED]: corrected } : {}),
        ...(Object.keys(kept).length > 0 ? { [EXCUSAL_KEPT]: kept } : {}),
        ...(input.notes ? { notes: input.notes.value } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        // `markedByUid` and the finished stamps are NOT moved: they record who
        // took the register and who finished it. Who corrected it is what the
        // stamps above and the history rows are for.
      },
      { merge: true },
    );
  }

  for (const write of mirror.writes) {
    tx.set(write.ref, { attendance: write.rollup }, { merge: true });
  }

  // The request a row came from: an approval's own, or the asked correction's.
  const requestId = approval?.requestId ?? input.asked?.requestId ?? null;
  // ONE HISTORY ROW PER LINE MOVED, with what it said before and after.
  for (const line of moved) {
    tx.set(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      ...groupHistoryRow({
        kind: "attendance-edit",
        run: input.run,
        group: input.group,
        actor,
        detail: approval
          ? approval.detail(line)
          : lineCorrectedDetail({
              weekNumber: session.weekNumber,
              occurrence: session.occurrence,
              name: input.names.get(line.uid) ?? "NAISI member",
              from: wordsOf(line.before),
              to: wordsOf(line.after),
              reason: input.reason,
              asked: input.asked ? { firstName: input.asked.firstName, at: input.asked.at } : null,
              at: now,
            }),
        weekId: session.weekId,
        before: beforeValues(line.before, register.setBy[line.uid]),
        after: afterValues(line.after),
        // An approval's row carries no reason: the person's is read by admins only.
        reason: approval ? null : input.reason,
        emailed: approval ? approval.emailed : 0,
        subjectUid: line.uid,
      }),
      sessionKey: session.sessionKey,
      ...(requestId ? { requestId } : {}),
    });
    logged += 1;
  }

  if (input.notes) {
    // The note's TEXT is never copied into the row: it is a facilitator's
    // account of a session and can name people, and the history is read by
    // the programme's lead. That it changed, who changed it and why is the
    // fact the row is for.
    tx.set(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      ...groupHistoryRow({
        kind: "attendance-edit",
        run: input.run,
        group: input.group,
        actor,
        detail: input.notes.value
          ? `Session note on week ${session.weekNumber} session ${session.occurrence} rewritten after the push.`
          : `Session note on week ${session.weekNumber} session ${session.occurrence} cleared after the push.`,
        weekId: session.weekId,
        reason: input.reason,
        emailed: 0,
      }),
      sessionKey: session.sessionKey,
    });
    logged += 1;
  }
  return logged;
}

/** The name each of these people goes by, read before the transaction: never an address. */
export async function namesGoneBy(db: Firestore, uids: Iterable<string>): Promise<Map<string, string>> {
  const wanted = [...new Set(uids)].filter((uid) => uid && !uid.includes("/"));
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) names.set(snap.id, snap.exists ? displayNameOf(snap.data() ?? {}) : "NAISI member");
  return names;
}

