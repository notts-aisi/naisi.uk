import "server-only";
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { readMirrorPlan, type RegisterOverride } from "@/lib/courses/attendanceMirror";
import {
  groupHistoryRow,
  iso,
  lateFromOf,
  momentOf,
  momentValues,
  startOf,
  toldFacts,
} from "@/lib/courses/groupChange/facts";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { loadMirrorMembers, type RegisterMember } from "@/lib/courses/registerAccess";
import { linesSetForSession } from "@/lib/courses/registerCover/didNotHappen";
import { sessionInTransaction } from "@/lib/courses/registerCover/sessionInTransaction";
import { finishCounts } from "@/lib/courses/registerCover/model";
import { CHANGE_FIELDS, ChangeRefusal, checkPress, overrideAfterPutBack, putBackSetsChangeFields } from "@/lib/courses/sessionChange/check";
import {
  clearedNames,
  closeCalledOffFollowUp,
  didNotHappenFacts,
  writeDidNotHappen,
} from "@/lib/courses/sessionChange/didNotHappen";
import { startMoves, takenStartMoves } from "@/lib/courses/sessionChange/metSessions";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { oneWeekHistoryDetail, oneWeekNoticeFor, weekSessionAfter } from "@/lib/courses/sessionChange/notice";
import type { ChangePress } from "@/lib/courses/sessionChange/parse";
import { REFUSAL, countChangedWords, movesMetWords } from "@/lib/courses/sessionChange/words";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { updateEmailAudience } from "@/lib/courses/updates/audience";
import { isValidDateKey } from "@/lib/courses/weekPlan";
import type { SessionUser } from "@/lib/firebase/session";
import {
  CORRECTED,
  COVER,
  FACILITATOR_RECORD,
  ONLINE,
  SET_BY,
  attendanceDocId,
  cameBy,
  normalizeCourseAttendance,
  registerIsTaken,
  type AttendanceStatus,
  type CourseAttendanceDoc,
} from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION, type CourseAuditValue } from "@/lib/firestore/courseAudit";
import { normalizeCourseGroup, sessionChangeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { chaseFacts, restartChase } from "./chase";
import { namesGoneBy } from "./line";
import { CORRECTION_REASON_MAX, lineOf, parseAskedLine, parseCorrectionReason, wordsOf, type RegisterLine } from "./model";
import {
  CORRECTION_REFUSAL,
  clearedDetail,
  didHappenDetail,
  heldOnlineDetail,
  lineMissingWords,
  movedDetail,
  targetCancelledWords,
  targetCoveredWords,
  targetMissingWords,
  targetNotStartedWords,
  targetTakenWords,
} from "./words";

/**
 * CORRECTING A WHOLE COLUMN OF A FINISHED REGISTER
 * (`POST /api/courses/groups/[groupId]/attendance/column`), for admins and
 * the people leading the programme, with a reason, and a preview
 * (`preview: true`) that says what would change before anything is saved:
 *
 *  - `online`: it was held online. Every line that says in the room says
 *    online; the others stay.
 *  - `move`: these lines belong to another session. The register moves to
 *    another week's session of the group whose register is not taken: its
 *    lines, who set them, the finished stamps and who took it. Its own goes
 *    back to not taken, and is chased again (`./chase`). What people said in
 *    advance about each session stays with its own session; a check-in, a
 *    session report and the session's notes stay where they are, and the
 *    preview says so.
 *  - `clear`: it was taken for the wrong session. Back to not taken, every
 *    cleared line in the history row's `before`, and chased again. Notes,
 *    and who took it, stay on the register.
 *  - `did-not-happen`: keep pace, or push the rest back, as "Change a
 *    session" calls a session off, with its reason and its optional notice
 *    (the answer carries the notice's words; the page posts it through the
 *    updates route, as the change route's page does). The lines go into the
 *    history row's `before` and the register stops being finished.
 *  - `did-happen`: the reverse, for a session called off with the group
 *    keeping pace, or a register from before that says it did not happen:
 *    who was there, and the session comes back into every figure, finished
 *    by the person correcting. A week whose cancel pushed the rest back is
 *    refused: the weeks after it have moved, which is a change of time.
 *
 * EVERY KIND, in one transaction: the register, the figures worked out again
 * in full (`readMirrorPlan`), `corrected` stamps on every line it changed
 * (a cleared line has no stamp: it is no line), and ONE history row with the
 * kind, how many lines, the reason, and `before` and `after` by person.
 * Nobody is emailed, except by the optional notice a page posts after
 * "It didn't happen".
 */

export type ColumnKind = "online" | "move" | "clear" | "did-not-happen" | "did-happen";

export const COLUMN_KINDS: readonly ColumnKind[] = ["online", "move", "clear", "did-not-happen", "did-happen"];

export type ColumnPress = {
  kind: ColumnKind;
  weekNumber: number;
  occurrence: number;
  reason: string;
  preview: boolean;
  /** `move`: the session the lines belong to. Null in a preview that asks only which sessions could take them. */
  to: { weekNumber: number; occurrence: number } | null;
  /** `did-not-happen`: keep pace or push the rest back, and the session's date as the page showed it. */
  pace: "keep" | "push" | null;
  dateKey: string | null;
  tell: boolean;
  emailCount: number;
  /** `did-happen`: how each person was there. */
  lines: Map<string, RegisterLine> | null;
};

const FIELDS = new Set(["weekNumber", "occurrence", "kind", "reason", "preview", "to", "pace", "dateKey", "tell", "emailCount", "lines"]);

/** A session's week and occurrence from a body, or null. */
function sessionOf(raw: unknown, occurrenceRaw: unknown): { weekNumber: number; occurrence: number } | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 60) return null;
  const occurrence = occurrenceRaw === undefined || occurrenceRaw === null ? 1 : occurrenceRaw;
  if (typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > 4) return null;
  return { weekNumber: raw, occurrence };
}

/** What a press of one of the column's corrections asks for, checked before anything is read. */
export function parseColumnPress(raw: unknown): { ok: true; value: ColumnPress } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: CORRECTION_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!FIELDS.has(key)) return { ok: false, error: CORRECTION_REFUSAL.body };
  const session = sessionOf(body.weekNumber, body.occurrence);
  if (!session) return { ok: false, error: "Say which week’s session this is about." };
  if (!COLUMN_KINDS.includes(body.kind as ColumnKind)) return { ok: false, error: CORRECTION_REFUSAL.kind };
  const kind = body.kind as ColumnKind;
  if (body.preview !== undefined && typeof body.preview !== "boolean") return { ok: false, error: CORRECTION_REFUSAL.flag };
  const preview = body.preview === true;
  const reason = parseCorrectionReason(body.reason, {
    preview,
    missing: CORRECTION_REFUSAL.reason,
    empty: CORRECTION_REFUSAL.reason,
    text: CORRECTION_REFUSAL.reasonText,
    line: CORRECTION_REFUSAL.reasonLine,
    link: CORRECTION_REFUSAL.reasonLink,
    max: CORRECTION_REASON_MAX,
  });
  if (!reason.ok) return { ok: false, error: reason.error };

  let to: ColumnPress["to"] = null;
  if (kind === "move") {
    if (body.to !== undefined && body.to !== null) {
      const asked = body.to as Record<string, unknown>;
      to = typeof asked === "object" && !Array.isArray(asked) ? sessionOf(asked.weekNumber, asked.occurrence) : null;
      if (!to) return { ok: false, error: CORRECTION_REFUSAL.toWeek };
    } else if (!preview) {
      return { ok: false, error: CORRECTION_REFUSAL.toWeek };
    }
  } else if (body.to !== undefined) {
    return { ok: false, error: CORRECTION_REFUSAL.body };
  }

  let pace: ColumnPress["pace"] = null;
  let dateKey: string | null = null;
  let tell = false;
  let emailCount = 0;
  if (kind === "did-not-happen") {
    if (body.pace !== "keep" && body.pace !== "push") return { ok: false, error: CORRECTION_REFUSAL.pace };
    pace = body.pace;
    if (typeof body.dateKey !== "string" || !isValidDateKey(body.dateKey)) return { ok: false, error: CORRECTION_REFUSAL.date };
    dateKey = body.dateKey;
    if (body.tell !== undefined && typeof body.tell !== "boolean") return { ok: false, error: CORRECTION_REFUSAL.tell };
    if (body.tell === undefined && !preview) return { ok: false, error: CORRECTION_REFUSAL.tell };
    tell = body.tell === true;
    if (tell && !preview) {
      if (typeof body.emailCount !== "number" || !Number.isInteger(body.emailCount) || body.emailCount < 0) {
        return { ok: false, error: CORRECTION_REFUSAL.emailCount };
      }
      emailCount = body.emailCount;
    }
  } else if (body.pace !== undefined || body.dateKey !== undefined || body.tell !== undefined || body.emailCount !== undefined) {
    return { ok: false, error: CORRECTION_REFUSAL.body };
  }

  let lines: ColumnPress["lines"] = null;
  if (kind === "did-happen") {
    if (body.lines !== undefined || !preview) {
      if (!Array.isArray(body.lines) || body.lines.length > 40) return { ok: false, error: CORRECTION_REFUSAL.lines };
      lines = new Map();
      for (const entry of body.lines) {
        const uid = (entry as Record<string, unknown> | null)?.uid;
        const line = parseAskedLine(entry && typeof entry === "object" ? { status: (entry as Record<string, unknown>).status, online: (entry as Record<string, unknown>).online } : null);
        if (typeof uid !== "string" || !uid || uid.includes("/") || !line) return { ok: false, error: CORRECTION_REFUSAL.lines };
        lines.set(uid, line);
      }
    }
  } else if (body.lines !== undefined) {
    return { ok: false, error: CORRECTION_REFUSAL.body };
  }

  return {
    ok: true,
    value: { kind, ...session, reason: reason.value, preview, to, pace, dateKey, tell, emailCount, lines },
  };
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type ColumnContext = {
  db: Firestore;
  actor: SessionUser;
  run: CourseRunDoc;
  group: CourseGroupDoc;
  sessions: ResolvedSession[];
  session: ResolvedSession;
  /** The register's rows, named for the reader. */
  members: RegisterMember[];
  now: Date;
};

/** An answer the route turns into a response. */
export type ColumnAnswer = { status: number; body: Record<string, unknown> };

/** Thrown inside a transaction, answered as a status outside it. */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const refuse = (status: number, error: string, detail: Record<string, unknown> = {}): ColumnAnswer => ({
  status,
  body: { error, ...detail },
});

function registerRef(ctx: ColumnContext, session: Pick<ResolvedSession, "weekNumber" | "occurrence">): DocumentReference {
  return ctx.db.collection("courseAttendance").doc(attendanceDocId(ctx.run.id, ctx.group.id, session.weekNumber, session.occurrence));
}

/** The register as stored, normalised, or null. */
function registerOf(snap: DocumentSnapshot): CourseAttendanceDoc | null {
  return snap.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}) : null;
}

/** A finished register of a session that happened, or why not. */
function finishedOrWhy(register: CourseAttendanceDoc | null, session: ResolvedSession): string | null {
  if (session.cancelled) return CORRECTION_REFUSAL.alreadyNotHeld;
  if (!register) return CORRECTION_REFUSAL.noRegister;
  if (!register.pushedAt) return CORRECTION_REFUSAL.notFinished;
  if (!register.held) return CORRECTION_REFUSAL.alreadyNotHeld;
  return null;
}

/** People named for the reader, by uid: the register's rows first, anybody else read once. */
async function namesForReader(ctx: ColumnContext, uids: Iterable<string>): Promise<Map<string, string>> {
  const out = new Map(ctx.members.map((member) => [member.uid, member.displayName]));
  const missing = [...new Set(uids)].filter((uid) => uid && !uid.includes("/") && !out.has(uid));
  if (missing.length > 0) {
    const snaps = await ctx.db.getAll(...missing.map((uid) => ctx.db.collection("users").doc(uid)));
    for (const snap of snaps) out.set(snap.id, snap.exists ? nameForViewer(ctx.actor, accountNamesOf(snap.data() ?? {}), "NAISI member") : "NAISI member");
  }
  return out;
}

/** "In the room" lines and the rest of a register, named. */
function namedLines(register: CourseAttendanceDoc, uids: readonly string[], names: ReadonlyMap<string, string>) {
  return uids
    .map((uid) => ({ uid, name: names.get(uid) ?? "NAISI member", line: wordsOf(lineOf(register, uid)) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
}

/** A history row's map of what each line said, by uid. */
function wordsByUid(register: CourseAttendanceDoc, uids: readonly string[]): Record<string, CourseAuditValue> {
  const out: Record<string, CourseAuditValue> = {};
  for (const uid of uids) out[uid] = wordsOf(lineOf(register, uid));
  return out;
}

/** The session's start, for a register's `sessionAt`. */
function startsAtOf(session: ResolvedSession): Date | null {
  return sessionInstants(session).startsAt;
}

function started(session: ResolvedSession, now: Date): boolean {
  const startsAt = startsAtOf(session);
  return Boolean(startsAt && startsAt.getTime() <= now.getTime());
}

/** One history row for a column's correction. */
function columnRow(
  ctx: ColumnContext,
  input: {
    kind: "register-held-online" | "register-moved" | "register-cleared" | "session-did-happen";
    session: ResolvedSession;
    detail: string;
    before: Record<string, CourseAuditValue> | null;
    after: Record<string, CourseAuditValue> | null;
    reason: string;
    toSessionKey?: string;
  },
): Record<string, unknown> {
  return {
    ...groupHistoryRow({
      kind: input.kind,
      run: ctx.run,
      group: ctx.group,
      actor: ctx.actor,
      detail: input.detail,
      weekId: input.session.weekId,
      before: input.before && Object.keys(input.before).length > 0 ? input.before : null,
      after: input.after && Object.keys(input.after).length > 0 ? input.after : null,
      reason: input.reason,
      emailed: 0,
    }),
    sessionKey: input.session.sessionKey,
    ...(input.toSessionKey ? { toSessionKey: input.toSessionKey } : {}),
    // How many lines it changed: the keys of `after`, said once more as a number.
    lines: Object.keys(input.after ?? {}).length,
  };
}

async function runInTransaction(ctx: ColumnContext, work: (tx: FirebaseFirestore.Transaction) => Promise<void>): Promise<ColumnAnswer | null> {
  try {
    await ctx.db.runTransaction(work);
    return null;
  } catch (err) {
    if (err instanceof Refused) return refuse(err.status, err.message, err.detail);
    if (err instanceof ChangeRefusal) return refuse(err.status, err.message, err.detail);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// It was held online
// ---------------------------------------------------------------------------

/** The lines a register says were in the room: a mark that says they came, and not online. */
function inTheRoom(register: CourseAttendanceDoc): string[] {
  return Object.keys(register.records)
    .filter((uid) => cameBy(register.records[uid]) && register.online[uid] !== true)
    .sort();
}

async function heldOnline(ctx: ColumnContext, press: ColumnPress): Promise<ColumnAnswer> {
  const { db, session, now } = ctx;
  const ref = registerRef(ctx, session);
  const register = registerOf(await ref.get());
  const why = finishedOrWhy(register, session);
  if (why || !register) return refuse(409, why ?? CORRECTION_REFUSAL.noRegister);
  const changing = inTheRoom(register);
  if (press.preview) {
    const staying = Object.keys(register.records).filter((uid) => !changing.includes(uid));
    const names = await namesForReader(ctx, Object.keys(register.records));
    return {
      status: 200,
      body: {
        ok: true,
        preview: {
          kind: "online",
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          dateKey: session.dateKey,
          changes: changing.length,
          from: "In the room",
          to: "Online",
          changing: namedLines(register, changing, names),
          staying: namedLines(register, staying, names),
          figures: true,
          emailed: 0,
          at: iso(now),
        },
      },
    };
  }
  if (changing.length === 0) return refuse(409, CORRECTION_REFUSAL.nothingInTheRoom);

  const mirrorMembers = await loadMirrorMembers(db, ctx.run.id, ctx.group.id);
  let changed = 0;
  const failed = await runInTransaction(ctx, async (tx) => {
    const fresh = registerOf(await tx.get(ref));
    const again = finishedOrWhy(fresh, session);
    if (again || !fresh) throw new Refused(409, again ?? CORRECTION_REFUSAL.noRegister);
    const lines = inTheRoom(fresh);
    if (lines.length === 0) throw new Refused(409, CORRECTION_REFUSAL.nothingInTheRoom);
    const plan = await readMirrorPlan(tx, db, {
      runId: ctx.run.id,
      groupId: ctx.group.id,
      sessions: ctx.sessions,
      members: mirrorMembers,
      overrides: new Map<string, RegisterOverride>([
        [session.sessionKey, { online: new Map(lines.map((uid) => [uid, true])), pushedAt: fresh.pushedAt ?? now }],
      ]),
      now,
    });
    const before = wordsByUid(fresh, lines);
    const after: Record<string, CourseAuditValue> = {};
    for (const uid of lines) after[uid] = wordsOf({ mark: fresh.records[uid], online: true });
    tx.set(
      ref,
      {
        [ONLINE]: Object.fromEntries(lines.map((uid) => [uid, true])),
        [CORRECTED]: Object.fromEntries(lines.map((uid) => [uid, { at: now, byUid: ctx.actor.uid }])),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    for (const write of plan.writes) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      columnRow(ctx, {
        kind: "register-held-online",
        session,
        detail: heldOnlineDetail(session.weekNumber, session.occurrence, lines.length, press.reason),
        before,
        after,
        reason: press.reason,
      }),
    );
    changed = lines.length;
  });
  if (failed) return failed;
  return { status: 200, body: { ok: true, kind: "online", changed } };
}

// ---------------------------------------------------------------------------
// These lines belong to another session
// ---------------------------------------------------------------------------

/**
 * Why a session cannot take another session's lines, or null when it can:
 * it must have met (started, and not called off), and its register must be
 * one nobody took and nobody is covering.
 */
function targetRefusal(ctx: ColumnContext, target: ResolvedSession, snap: DocumentSnapshot | undefined): string | null {
  if (target.cancelled) return targetCancelledWords(target.weekNumber);
  if (!started(target, ctx.now)) return targetNotStartedWords(target.weekNumber);
  if (!snap?.exists) return null;
  if (registerIsTaken(snap.data() ?? {})) return targetTakenWords(target.weekNumber);
  const register = registerOf(snap);
  if (register && (register.cover || Object.keys(register.facilitatorRecord).length > 0)) return targetCoveredWords(target.weekNumber);
  return null;
}

async function moveColumn(ctx: ColumnContext, press: ColumnPress): Promise<ColumnAnswer> {
  const { db, session, now, group, run } = ctx;
  const sourceRef = registerRef(ctx, session);
  const source = registerOf(await sourceRef.get());
  const why = finishedOrWhy(source, session);
  if (why || !source) return refuse(409, why ?? CORRECTION_REFUSAL.noRegister);
  const { uids } = linesSetForSession(source);
  if (uids.length === 0) return refuse(409, CORRECTION_REFUSAL.nothingToMove);

  // Every other session of the group, and whether its register could take these lines.
  const others = ctx.sessions.filter((each) => each.sessionKey !== session.sessionKey);
  const otherSnaps = others.length ? await db.getAll(...others.map((each) => registerRef(ctx, each))) : [];
  const targets = others.map((each, index) => {
    const refusal = targetRefusal(ctx, each, otherSnaps[index]);
    return {
      weekNumber: each.weekNumber,
      occurrence: each.occurrence,
      sessionKey: each.sessionKey,
      dateKey: each.dateKey,
      ok: refusal === null,
      why: refusal,
    };
  });

  let target: ResolvedSession | null = null;
  if (press.to) {
    const to = press.to;
    if (to.weekNumber === session.weekNumber && to.occurrence === session.occurrence) return refuse(400, CORRECTION_REFUSAL.sameWeek);
    target = ctx.sessions.find((each) => each.weekNumber === to.weekNumber && each.occurrence === to.occurrence) ?? null;
    if (!target) return refuse(400, targetMissingWords(to.weekNumber));
    const found = targets.find((each) => each.sessionKey === target?.sessionKey);
    if (found && !found.ok) return refuse(409, found.why ?? targetTakenWords(target.weekNumber));
  }

  if (press.preview) {
    const [names, facts, chase] = await Promise.all([
      namesForReader(ctx, Object.keys(source.records)),
      // Whether a check-in was opened for it and how many reports it has, as
      // calling a session off counts them: neither moves.
      didNotHappenFacts(db, { run, group, session, register: undefined }),
      chaseFacts(db, { runId: run.id, groupId: group.id, session, now }),
    ]);
    const staying = Object.keys(source.records).filter((uid) => !uids.includes(uid));
    return {
      status: 200,
      body: {
        ok: true,
        preview: {
          kind: "move",
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          dateKey: session.dateKey,
          to: target ? { weekNumber: target.weekNumber, occurrence: target.occurrence, dateKey: target.dateKey } : null,
          targets,
          moves: uids.length,
          moving: namedLines(source, uids, names),
          // What people said in advance about this session stays with it.
          staying: namedLines(source, staying, names),
          // What stays with this session: its check-in, its reports, and any
          // notes on its register (said whether or not there are any: the
          // notes are never the reader's to count).
          stays: { checkIn: facts.checkIn, reports: facts.reports, notesWith: session.sessionKey },
          chase,
          figures: true,
          emailed: 0,
          at: iso(now),
        },
      },
    };
  }
  if (!target) return refuse(400, CORRECTION_REFUSAL.toWeek);
  const moveTo = target;
  const targetRef = registerRef(ctx, moveTo);

  const [mirrorMembers] = await Promise.all([loadMirrorMembers(db, run.id, group.id)]);
  let moved = 0;
  const failed = await runInTransaction(ctx, async (tx) => {
    // The session the lines go to, as the group says it now: the start its
    // register keeps is never worked out from a group read before this.
    const where = await sessionInTransaction(tx, db, run, group.id, moveTo);
    if (!where.ok) throw new Refused(409, where.reason === "cancelled" ? targetCancelledWords(moveTo.weekNumber) : CORRECTION_REFUSAL.changed);
    const [freshSourceSnap, freshTargetSnap] = await tx.getAll(sourceRef, targetRef);
    const fresh = registerOf(freshSourceSnap);
    const again = finishedOrWhy(fresh, session);
    if (again || !fresh) throw new Refused(409, again ?? CORRECTION_REFUSAL.noRegister);
    const refusal = targetRefusal(ctx, moveTo, freshTargetSnap);
    if (refusal) throw new Refused(409, refusal);
    const lines = linesSetForSession(fresh).uids;
    if (lines.length === 0) throw new Refused(409, CORRECTION_REFUSAL.nothingToMove);

    const plan = await readMirrorPlan(tx, db, {
      runId: run.id,
      groupId: group.id,
      sessions: ctx.sessions,
      members: mirrorMembers,
      overrides: new Map<string, RegisterOverride>([
        [session.sessionKey, { marks: new Map(lines.map((uid) => [uid, null])), unpushed: true }],
        [
          moveTo.sessionKey,
          {
            marks: new Map(lines.map((uid) => [uid, fresh.records[uid]])),
            online: new Map(lines.map((uid) => [uid, cameBy(fresh.records[uid]) ? fresh.online[uid] === true : null])),
            pushedAt: fresh.pushedAt ?? now,
          },
        ],
      ]),
      now,
    });

    // The source: its lines and everything that says it was taken go.
    const cleared = (keys: readonly string[]) => Object.fromEntries(keys.map((uid) => [uid, FieldValue.delete()]));
    tx.set(
      sourceRef,
      {
        records: cleared(lines),
        ...(lines.some((uid) => Object.hasOwn(fresh.online, uid)) ? { [ONLINE]: cleared(lines.filter((uid) => Object.hasOwn(fresh.online, uid))) } : {}),
        ...(lines.some((uid) => fresh.setBy[uid]) ? { [SET_BY]: cleared(lines.filter((uid) => fresh.setBy[uid])) } : {}),
        ...(lines.some((uid) => fresh.corrected[uid]) ? { [CORRECTED]: cleared(lines.filter((uid) => fresh.corrected[uid])) } : {}),
        pushedAt: FieldValue.delete(),
        pushedByUid: FieldValue.delete(),
        markedByUid: FieldValue.delete(),
        ...(fresh.cover ? { [COVER]: FieldValue.delete() } : {}),
        ...(Object.keys(fresh.facilitatorRecord).length > 0 ? { [FACILITATOR_RECORD]: FieldValue.delete() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // The session they belong to: the lines, who set them, who took it and
    // the finished stamps, and every line stamped as corrected.
    const raw = freshSourceSnap.data() ?? {};
    const startsAt = where.startsAt;
    tx.set(
      targetRef,
      {
        runId: run.id,
        groupId: group.id,
        weekNumber: moveTo.weekNumber,
        occurrence: moveTo.occurrence,
        records: Object.fromEntries(lines.map((uid) => [uid, fresh.records[uid]])),
        ...(lines.some((uid) => Object.hasOwn(fresh.online, uid))
          ? { [ONLINE]: Object.fromEntries(lines.filter((uid) => Object.hasOwn(fresh.online, uid)).map((uid) => [uid, fresh.online[uid]])) }
          : {}),
        ...(lines.some((uid) => fresh.setBy[uid]) ? { [SET_BY]: Object.fromEntries(lines.filter((uid) => fresh.setBy[uid]).map((uid) => [uid, fresh.setBy[uid]])) } : {}),
        [CORRECTED]: Object.fromEntries(lines.map((uid) => [uid, { at: now, byUid: ctx.actor.uid }])),
        pushedAt: raw.pushedAt ?? fresh.pushedAt,
        pushedByUid: fresh.pushedByUid,
        ...(fresh.markedByUid ? { markedByUid: fresh.markedByUid } : {}),
        ...(raw[COVER] !== undefined ? { [COVER]: raw[COVER] } : {}),
        ...(raw[FACILITATOR_RECORD] !== undefined ? { [FACILITATOR_RECORD]: raw[FACILITATOR_RECORD] } : {}),
        held: true,
        ...(startsAt ? { sessionAt: startsAt } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    for (const write of plan.writes) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
    const said = wordsByUid(fresh, lines);
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      columnRow(ctx, {
        kind: "register-moved",
        session,
        detail: movedDetail(session, moveTo, lines.length, press.reason),
        before: said,
        after: said,
        reason: press.reason,
        toSessionKey: moveTo.sessionKey,
      }),
    );
    moved = lines.length;
  });
  if (failed) return failed;
  // The register they left is not taken any more, so it is chased again; the
  // one they reached is finished, so any card raised for it is archived.
  await restartChase(db, { runId: run.id, group, sessionKey: session.sessionKey, register: source });
  await closeCalledOffFollowUp(db, { runId: run.id, groupId: group.id, sessionKey: moveTo.sessionKey });
  return { status: 200, body: { ok: true, kind: "move", moved, to: { weekNumber: moveTo.weekNumber, occurrence: moveTo.occurrence } } };
}

// ---------------------------------------------------------------------------
// It was taken for the wrong session: clear the column
// ---------------------------------------------------------------------------

async function clearColumn(ctx: ColumnContext, press: ColumnPress): Promise<ColumnAnswer> {
  const { db, session, now, group, run } = ctx;
  const ref = registerRef(ctx, session);
  const register = registerOf(await ref.get());
  const why = finishedOrWhy(register, session);
  if (why || !register) return refuse(409, why ?? CORRECTION_REFUSAL.noRegister);
  const { uids } = linesSetForSession(register);

  if (press.preview) {
    const [names, facts, chase] = await Promise.all([
      namesForReader(ctx, Object.keys(register.records)),
      didNotHappenFacts(db, { run, group, session, register: undefined }),
      chaseFacts(db, { runId: run.id, groupId: group.id, session, now }),
    ]);
    const staying = Object.keys(register.records).filter((uid) => !uids.includes(uid));
    return {
      status: 200,
      body: {
        ok: true,
        preview: {
          kind: "clear",
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          dateKey: session.dateKey,
          clears: uids.length,
          clearing: namedLines(register, uids, names),
          staying: namedLines(register, staying, names),
          stays: { checkIn: facts.checkIn, reports: facts.reports, notesWith: session.sessionKey },
          chase,
          figures: true,
          emailed: 0,
          at: iso(now),
        },
      },
    };
  }

  const [mirrorMembers, historyNames] = await Promise.all([
    loadMirrorMembers(db, run.id, group.id),
    namesGoneBy(db, uids),
  ]);
  let cleared = 0;
  const failed = await runInTransaction(ctx, async (tx) => {
    const fresh = registerOf(await tx.get(ref));
    const again = finishedOrWhy(fresh, session);
    if (again || !fresh) throw new Refused(409, again ?? CORRECTION_REFUSAL.noRegister);
    const lines = linesSetForSession(fresh).uids;
    const plan = await readMirrorPlan(tx, db, {
      runId: run.id,
      groupId: group.id,
      sessions: ctx.sessions,
      members: mirrorMembers,
      overrides: new Map<string, RegisterOverride>([
        [session.sessionKey, { marks: new Map(lines.map((uid) => [uid, null])), unpushed: true }],
      ]),
      now,
    });
    const gone = (keys: readonly string[]) => Object.fromEntries(keys.map((uid) => [uid, FieldValue.delete()]));
    tx.set(
      ref,
      {
        ...(lines.length > 0 ? { records: gone(lines) } : {}),
        ...(lines.some((uid) => Object.hasOwn(fresh.online, uid)) ? { [ONLINE]: gone(lines.filter((uid) => Object.hasOwn(fresh.online, uid))) } : {}),
        ...(lines.some((uid) => fresh.setBy[uid]) ? { [SET_BY]: gone(lines.filter((uid) => fresh.setBy[uid])) } : {}),
        ...(lines.some((uid) => fresh.corrected[uid]) ? { [CORRECTED]: gone(lines.filter((uid) => fresh.corrected[uid])) } : {}),
        // Back to not taken. Who took it, the facilitators' record and the
        // session's notes stay on the register: nothing a correction clears
        // is a note, and the history row keeps every cleared line.
        pushedAt: FieldValue.delete(),
        pushedByUid: FieldValue.delete(),
        markedByUid: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    for (const write of plan.writes) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
    const before = wordsByUid(fresh, lines);
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      columnRow(ctx, {
        kind: "register-cleared",
        session,
        detail: clearedDetail(
          session.weekNumber,
          session.occurrence,
          lines.map((uid) => ({ name: historyNames.get(uid) ?? "NAISI member", words: wordsOf(lineOf(fresh, uid)) })),
          press.reason,
        ),
        before,
        after: Object.fromEntries(lines.map((uid) => [uid, "Not set"])),
        reason: press.reason,
      }),
    );
    cleared = lines.length;
  });
  if (failed) return failed;
  await restartChase(db, { runId: run.id, group, sessionKey: session.sessionKey, register });
  return { status: 200, body: { ok: true, kind: "clear", cleared } };
}

// ---------------------------------------------------------------------------
// It didn't happen, on a finished register
// ---------------------------------------------------------------------------

/** The register of every session whose start a change moves, any occurrence. */
function moveRefs(ctx: ColumnContext, before: readonly ResolvedSession[], after: readonly ResolvedSession[]): DocumentReference[] {
  return startMoves(before, after).map((move) => registerRef(ctx, move.before));
}

/** Nothing may move the start of a session whose register is taken, but the one this press calls off. */
function refuseMovingMet(
  before: readonly ResolvedSession[],
  after: readonly ResolvedSession[],
  snaps: ReadonlyArray<DocumentSnapshot | undefined>,
  calledOffKey: string,
): void {
  const registers = new Map<string, Record<string, unknown>>();
  startMoves(before, after).forEach((move, index) => {
    const snap = snaps[index];
    if (snap?.exists && move.before.sessionKey !== calledOffKey) registers.set(move.before.sessionKey, snap.data() ?? {});
  });
  const [met] = takenStartMoves(before, after, registers);
  if (met) throw new ChangeRefusal(movesMetWords(met.before.weekNumber, met.before.occurrence), 409);
}

/** The press "Change a session" would make: cancel, keeping pace, or push the rest back. */
function changePressOf(press: ColumnPress): ChangePress {
  return {
    weekNumber: press.weekNumber,
    dateKey: press.dateKey ?? "",
    kind: press.pace === "push" ? "push" : "cancel",
    move: null,
    metAtAnotherTime: false,
    preview: press.preview,
    reason: press.reason,
    tell: press.tell,
    emailCount: press.emailCount,
  };
}

async function didNotHappen(ctx: ColumnContext, press: ColumnPress): Promise<ColumnAnswer> {
  const { db, session, now, run, group, actor } = ctx;
  if (session.occurrence !== 1) return refuse(400, CORRECTION_REFUSAL.kind);
  const ref = registerRef(ctx, session);
  const snap = await ref.get();
  const register = registerOf(snap);
  const why = finishedOrWhy(register, session);
  if (why || !register) return refuse(409, why ?? CORRECTION_REFUSAL.noRegister);
  const change = changePressOf(press);
  const naming = await readNamingProgramme(db, run.id);
  const context = { groupName: group.name.trim() || "Untitled group", incubator: naming?.kind === "incubator" };
  const groupRef = db.collection("courseGroups").doc(group.id);

  try {
    // Called off as if nobody had taken it: its lines are cleared in the same write.
    const first = checkPress(run, group, change, now, undefined);
    if (press.preview) {
      const before = resolveSessions(run, group);
      const after = resolveSessions(run, first.after);
      const refs = moveRefs(ctx, before, after);
      refuseMovingMet(before, after, refs.length ? await db.getAll(...refs) : [], session.sessionKey);
      const afterSession = sessionOfWeek(after, press.weekNumber);
      const lastOf = (sessions: readonly ResolvedSession[]) =>
        sessions.filter((s) => !s.cancelled && s.dateKey).reduce((last, s) => (s.dateKey > last ? s.dateKey : last), "");
      const [facts, told, names] = await Promise.all([
        didNotHappenFacts(db, { run, group, session: first.session, register: snap.data() ?? {} }),
        toldFacts(db, run, group, actor.uid),
        namesForReader(ctx, Object.keys(register.records)),
      ]);
      const { uids } = linesSetForSession(register);
      return {
        status: 200,
        body: {
          ok: true,
          preview: {
            kind: "did-not-happen",
            pace: press.pace,
            weekNumber: press.weekNumber,
            before: momentOf(group, first.session),
            after: momentOf(first.after, afterSession),
            lastSession: { before: lastOf(before), after: lastOf(after) },
            lateFrom: { before: lateFromOf(before, press.weekNumber), after: lateFromOf(after, press.weekNumber) },
            clearing: namedLines(register, uids, names),
            didNotHappen: facts,
            told,
            notice: oneWeekNoticeFor(run, first, change, context),
            figures: true,
            at: iso(now),
          },
        },
      };
    }

    if (press.tell && press.emailCount > 0) {
      const audience = await updateEmailAudience(db, run, [group], "group", group.id, actor.uid, { withFacilitators: true });
      if (audience.refused) return refuse(400, REFUSAL.overCap);
      if (audience.recipients.length === 0) return refuse(400, REFUSAL.nobodyToEmail);
      if (audience.recipients.length !== press.emailCount) {
        return refuse(409, countChangedWords(audience.recipients.length), { emails: audience.recipients.length });
      }
    }
  } catch (err) {
    if (err instanceof ChangeRefusal) return refuse(err.status, err.message, err.detail);
    throw err;
  }

  const [mirrorMembers, names] = await Promise.all([
    loadMirrorMembers(db, run.id, group.id),
    clearedNames(db, snap.data() ?? {}),
  ]);
  let outcome: { kind: "cancel" | "push"; newDateKey: string | null; notice: { title: string; message: string } } | null = null;
  const failed = await runInTransaction(ctx, async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) throw new ChangeRefusal(REFUSAL.gone, 400);
    const fresh = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (fresh.archived || fresh.runId !== run.id) throw new ChangeRefusal(REFUSAL.gone, 400);
    const registerSnap = await tx.get(ref);
    const stored = registerOf(registerSnap);
    const again = finishedOrWhy(stored, session);
    if (again || !stored) throw new Refused(409, again ?? CORRECTION_REFUSAL.noRegister);
    const checked = checkPress(run, fresh, change, now, undefined);

    const before = resolveSessions(run, fresh);
    const after = resolveSessions(run, checked.after);
    const refs = moveRefs(ctx, before, after);
    refuseMovingMet(before, after, refs.length ? await tx.getAll(...refs) : [], session.sessionKey);
    // Every other session whose start moves keeps it on a register nobody took.
    const moved = after.filter((now_) => {
      if (now_.occurrence !== 1 || now_.sessionKey === session.sessionKey) return false;
      const was = before.find((each) => each.weekNumber === now_.weekNumber && each.occurrence === 1);
      const from = startOf(was);
      const to = startOf(now_);
      return Boolean(to && (!from || from.getTime() !== to.getTime()));
    });
    const movedRefs = moved.map((each) => registerRef(ctx, each));
    const movedSnaps = movedRefs.length ? await tx.getAll(...movedRefs) : [];
    const lines = linesSetForSession(stored).uids;
    const plan = await readMirrorPlan(tx, db, {
      runId: run.id,
      groupId: group.id,
      sessions: after,
      members: mirrorMembers,
      overrides: new Map<string, RegisterOverride>([
        [session.sessionKey, { marks: new Map(lines.map((uid) => [uid, null])), unpushed: true }],
      ]),
      now,
    });

    const weekId = checked.weekId;
    const record = {
      reason: press.reason,
      dateKey: checked.dateKey,
      byUid: actor.uid,
      at: FieldValue.serverTimestamp(),
      ...(checked.was ? { was: checked.was } : {}),
    };
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (change.kind === "push") {
      if (!checked.pushed) throw new ChangeRefusal(REFUSAL.noPlan, 400);
      update.paceWeekPlan = checked.pushed.plan;
      update[`sessionChanges.${weekId}`] = { kind: "pushed", ...record };
    } else {
      update[`sessionChanges.${weekId}`] = { kind: "cancelled", ...record };
    }
    tx.update(groupRef, update);
    moved.forEach((each, index) => {
      const movedSnap = movedSnaps[index];
      const startsAt = startsAtOf(each);
      if (!movedSnap?.exists || !startsAt || registerIsTaken(movedSnap.data() ?? {})) return;
      tx.update(movedRefs[index], { sessionAt: startsAt });
    });

    const emailed = press.tell ? press.emailCount : 0;
    const afterSession = weekSessionAfter(run, checked, press.weekNumber);
    const raw = registerSnap.data() ?? {};
    // The lines go, each kept in the history row's `before`, exactly as a
    // draft called off after the fact is cleared (`writeDidNotHappen`); and
    // a finished register stops being finished, so it counts for nobody.
    writeDidNotHappen(tx, db, {
      ref,
      register: raw,
      kind: change.kind as "cancel" | "push",
      run,
      group: fresh,
      actor,
      weekNumber: press.weekNumber,
      weekId,
      after: afterSession,
      reason: press.reason,
      emailed,
      names,
    });
    const stamps = lines.filter((uid) => stored.corrected[uid]);
    tx.set(
      ref,
      {
        pushedAt: FieldValue.delete(),
        pushedByUid: FieldValue.delete(),
        ...(stamps.length > 0 ? { [CORRECTED]: Object.fromEntries(stamps.map((uid) => [uid, FieldValue.delete()])) } : {}),
      },
      { merge: true },
    );
    for (const write of plan.writes) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      {
        ...groupHistoryRow({
          kind: checked.auditKind,
          run,
          group: fresh,
          actor,
          detail: oneWeekHistoryDetail(run, checked, change, emailed),
          weekId,
          before: momentValues(momentOf(fresh, checked.session)),
          after: momentValues(momentOf(checked.after, afterSession)),
          reason: press.reason,
          emailed,
        }),
        sessionKey: session.sessionKey,
      },
    );
    outcome = {
      kind: change.kind as "cancel" | "push",
      newDateKey: change.kind === "push" ? (checked.pushed?.newDateKey ?? null) : null,
      notice: oneWeekNoticeFor(run, checked, change, context),
    };
  });
  if (failed) return failed;
  // A session that did not happen has no register left to finish.
  await closeCalledOffFollowUp(db, { runId: run.id, groupId: group.id, sessionKey: session.sessionKey });
  const done = outcome as { kind: "cancel" | "push"; newDateKey: string | null; notice: { title: string; message: string } } | null;
  return {
    status: 200,
    body: {
      ok: true,
      kind: "did-not-happen",
      change: { kind: done?.kind ?? change.kind, weekNumber: press.weekNumber, dateKey: session.dateKey, newDateKey: done?.newDateKey ?? null },
      update:
        press.tell && done
          ? { groupId: group.id, ...done.notice, emailCount: press.emailCount, withFacilitators: true as const }
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// It did happen
// ---------------------------------------------------------------------------

/** Why this session cannot be said to have happened, or null when it can: cancelled keeping pace, or an old register saying it did not. */
function didHappenRefusal(ctx: ColumnContext, register: CourseAttendanceDoc | null, group: CourseGroupDoc): string | null {
  const { session, now } = ctx;
  const record = sessionChangeForWeek(group, session.weekId);
  if (record?.kind === "pushed") return CORRECTION_REFUSAL.pushedBack;
  if (!started(session, now)) return CORRECTION_REFUSAL.notYet;
  if (session.cancelled) return record?.kind === "cancelled" ? null : CORRECTION_REFUSAL.changed;
  if (register && !register.held) return null;
  return CORRECTION_REFUSAL.happened;
}

async function didHappen(ctx: ColumnContext, press: ColumnPress): Promise<ColumnAnswer> {
  const { db, session, now, run, group, actor, members } = ctx;
  if (session.occurrence !== 1) return refuse(400, CORRECTION_REFUSAL.kind);
  const ref = registerRef(ctx, session);
  const groupRef = db.collection("courseGroups").doc(group.id);
  const register = registerOf(await ref.get());
  const why = didHappenRefusal(ctx, register, group);
  if (why) return refuse(409, why);

  // Who is asked about: the register's rows who had joined by this week.
  const due = members.filter((member) => member.joinedWeekNumber <= session.weekNumber);
  const lines = press.lines ?? new Map<string, RegisterLine>();
  for (const uid of lines.keys()) {
    if (!due.some((member) => member.uid === uid)) return refuse(400, CORRECTION_REFUSAL.lineUnknown);
  }
  if (!press.preview) {
    const missing = due.find((member) => !lines.has(member.uid));
    if (missing) return refuse(400, lineMissingWords(missing.displayName));
  }

  // The group with this week put back, as "Hold it as usual" puts it back.
  const putBack = (fresh: CourseGroupDoc): { group: CourseGroupDoc; update: Record<string, unknown> | null } => {
    const record = sessionChangeForWeek(fresh, session.weekId);
    if (!record || record.kind !== "cancelled") return { group: fresh, update: null };
    const overrides = { ...fresh.sessionOverrides };
    const changes = { ...(fresh.sessionChanges ?? {}) };
    const left = overrideAfterPutBack(record, overrides[session.weekId]);
    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      [`sessionModes.${session.weekId}`]: FieldValue.delete(),
      [`sessionChanges.${session.weekId}`]: FieldValue.delete(),
    };
    if (!left) update[`sessionOverrides.${session.weekId}`] = FieldValue.delete();
    else if (putBackSetsChangeFields(record)) {
      for (const field of CHANGE_FIELDS) {
        const value = left[field];
        update[`sessionOverrides.${session.weekId}.${field}`] = value !== undefined ? value : FieldValue.delete();
      }
    }
    if (left) overrides[session.weekId] = left;
    else delete overrides[session.weekId];
    delete changes[session.weekId];
    return { group: { ...fresh, sessionOverrides: overrides, sessionChanges: changes }, update };
  };

  if (press.preview) {
    const after = putBack(group).group;
    const afterSessions = resolveSessions(run, after);
    const record = sessionChangeForWeek(group, session.weekId);
    const [names, setter] = await Promise.all([
      namesForReader(ctx, [...due.map((member) => member.uid)]),
      record?.byUid ? namesForReader(ctx, [record.byUid]) : Promise.resolve(new Map<string, string>()),
    ]);
    const counts = finishCounts(
      Object.fromEntries([...lines].map(([uid, line]) => [uid, line.mark as AttendanceStatus])),
      Object.fromEntries([...lines].map(([uid, line]) => [uid, line.online])),
    );
    return {
      status: 200,
      body: {
        ok: true,
        preview: {
          kind: "did-happen",
          weekNumber: session.weekNumber,
          dateKey: session.dateKey,
          // Who said it did not happen, when and why, from the change's own record.
          calledOff: record?.kind === "cancelled"
            ? { byName: setter.get(record.byUid) ?? "", at: record.at ? record.at.toISOString() : null, reason: record.reason }
            : null,
          people: due.map((member) => ({
            uid: member.uid,
            name: names.get(member.uid) ?? member.displayName,
            line: register ? wordsOf(lineOf(register, member.uid)) : "Not set",
          })),
          counts,
          lateFrom: { before: lateFromOf(ctx.sessions, session.weekNumber), after: lateFromOf(afterSessions, session.weekNumber) },
          figures: true,
          emailed: 0,
          at: iso(now),
        },
      },
    };
  }

  const [mirrorMembers] = await Promise.all([loadMirrorMembers(db, run.id, group.id)]);
  let counted: ReturnType<typeof finishCounts> | null = null;
  const failed = await runInTransaction(ctx, async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) throw new Refused(400, REFUSAL.gone);
    const fresh = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (fresh.archived || fresh.runId !== run.id) throw new Refused(400, REFUSAL.gone);
    const registerSnap = await tx.get(ref);
    const stored = registerOf(registerSnap);
    const freshSession = resolveSessions(run, fresh).find((each) => each.sessionKey === session.sessionKey);
    if (!freshSession) throw new Refused(409, CORRECTION_REFUSAL.changed);
    const again = didHappenRefusal({ ...ctx, session: freshSession }, stored, fresh);
    if (again) throw new Refused(409, again);
    const { group: after, update } = putBack(fresh);
    const before = resolveSessions(run, fresh);
    const afterSessions = resolveSessions(run, after);
    // Putting the week back may only move this session's own start.
    const refs = moveRefs(ctx, before, afterSessions);
    refuseMovingMet(before, afterSessions, refs.length ? await tx.getAll(...refs) : [], session.sessionKey);
    const back = afterSessions.find((each) => each.sessionKey === session.sessionKey);
    if (!back || back.cancelled) throw new Refused(409, CORRECTION_REFUSAL.changed);
    const plan = await readMirrorPlan(tx, db, {
      runId: run.id,
      groupId: group.id,
      sessions: afterSessions,
      members: mirrorMembers,
      overrides: new Map<string, RegisterOverride>([
        [
          session.sessionKey,
          {
            marks: new Map([...lines].map(([uid, line]) => [uid, line.mark])),
            online: new Map([...lines].map(([uid, line]) => [uid, cameBy(line.mark) ? line.online : null])),
            held: true,
            pushedAt: now,
          },
        ],
      ]),
      now,
    });

    if (update) tx.update(groupRef, update);
    const startsAt = startsAtOf(back);
    const entries = [...lines];
    const onlineWrites: Record<string, boolean | FieldValue> = {};
    for (const [uid, line] of entries) {
      if (cameBy(line.mark)) onlineWrites[uid] = line.online;
      else if (stored && Object.hasOwn(stored.online, uid)) onlineWrites[uid] = FieldValue.delete();
    }
    tx.set(
      ref,
      {
        runId: run.id,
        groupId: group.id,
        weekNumber: session.weekNumber,
        occurrence: session.occurrence,
        records: Object.fromEntries(entries.map(([uid, line]) => [uid, line.mark])),
        ...(Object.keys(onlineWrites).length > 0 ? { [ONLINE]: onlineWrites } : {}),
        [SET_BY]: Object.fromEntries(entries.map(([uid]) => [uid, { byUid: actor.uid, at: now, how: "correction" }])),
        [CORRECTED]: Object.fromEntries(entries.map(([uid]) => [uid, { at: now, byUid: actor.uid }])),
        held: true,
        // Finished by the person correcting.
        pushedAt: now,
        pushedByUid: actor.uid,
        ...(startsAt ? { sessionAt: startsAt } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    for (const write of plan.writes) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
    const beforeLines = stored ? Object.keys(stored.records).filter((uid) => lines.has(uid)) : [];
    counted = finishCounts(
      Object.fromEntries(entries.map(([uid, line]) => [uid, line.mark as AttendanceStatus])),
      Object.fromEntries(entries.map(([uid, line]) => [uid, line.online])),
    );
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      columnRow(ctx, {
        kind: "session-did-happen",
        session,
        detail: didHappenDetail(session.weekNumber, session.occurrence, counted, press.reason),
        before: stored ? wordsByUid(stored, beforeLines) : null,
        after: Object.fromEntries(entries.map(([uid, line]) => [uid, wordsOf(line)])),
        reason: press.reason,
      }),
    );
  });
  if (failed) return failed;
  // It is finished now: any card raised for it while it said otherwise is archived.
  await closeCalledOffFollowUp(db, { runId: run.id, groupId: group.id, sessionKey: session.sessionKey });
  return { status: 200, body: { ok: true, kind: "did-happen", counts: counted } };
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

export async function correctColumn(ctx: ColumnContext, press: ColumnPress): Promise<ColumnAnswer> {
  switch (press.kind) {
    case "online":
      return heldOnline(ctx, press);
    case "move":
      return moveColumn(ctx, press);
    case "clear":
      return clearColumn(ctx, press);
    case "did-not-happen":
      return didNotHappen(ctx, press);
    case "did-happen":
      return didHappen(ctx, press);
  }
}

/** A register's session, by key, among the group's: what the door needs to know a press is about one of them. */
export function sessionOfPress(sessions: readonly ResolvedSession[], press: Pick<ColumnPress, "weekNumber" | "occurrence">): ResolvedSession | null {
  return sessions.find((each) => each.weekNumber === press.weekNumber && each.occurrence === press.occurrence) ?? null;
}

