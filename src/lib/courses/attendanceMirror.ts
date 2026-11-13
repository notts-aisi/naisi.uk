import "server-only";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { recomputeRollup, type RegisterFact } from "./attendanceRollup";
import { groupsOfWeeks, hasGroupsByWeek, sessionsWithGroup } from "./groupsByWeek";
import { resolveSessions, type ResolvedSession } from "./sessions";
import type { MirrorMember } from "./registerAccess";
import {
  attendanceDocId,
  normalizeCourseAttendance,
  type AttendanceStatus,
  type CourseAttendanceDoc,
} from "@/lib/firestore/courseAttendance";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  type CourseEnrolmentDoc,
  type EnrolmentAttendanceRollup,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * THE ENROLMENT MIRROR: rebuilding `courseEnrolments.attendance` from the
 * registers, inside the transaction that changed one of them.
 *
 * TWO CALLERS, ONE ARITHMETIC. The push stamps a register as pushed; the
 * admin's post-push edit changes marks on one that already is. Both then have
 * to leave every affected member's rollup correct, and a second
 * implementation of "correct" is how two numbers that must agree stop
 * agreeing. So both express their change as an OVERRIDE laid over what the
 * transaction read, and take the same recompute.
 *
 * ── ALL READS BEFORE ANY WRITE ──────────────────────────────────────────────
 * A Firestore transaction refuses a read after a write, so this is split in
 * two: `readMirrorPlan` does every read the recompute needs and returns the
 * writes; the caller applies them. That is also why the override exists at
 * all, rather than the caller writing first and this re-reading: the register
 * being changed cannot be read back inside the same transaction.
 *
 * ── THE FULL SET OF REGISTERS, ADDRESSED ────────────────────────────────────
 * Every session the group holds has a deterministic register id, so the read
 * is one `getAll` over ids built from `resolveSessions` rather than a query.
 * No index, no ordering surprise, and a session with no register yet simply
 * comes back missing, which is the same thing as a session nobody has marked.
 *
 * ── SCOPE: EVERY ENROLMENT ON THE GROUP, NOT EVERY ACTIVE ONE ───────────────
 * The `members` this is handed come from `loadMirrorMembers`, which reads all
 * four enrolment statuses. A rollup is read on surfaces a withdrawn or removed
 * member still appears on (the admin's enrolment view, their own run
 * overview), so recomputing only the active ones would freeze everybody else's
 * figures at their pre-correction values the moment an admin fixes a register.
 * The REGISTER's rows are a different list, the active members, because they
 * are who a facilitator can mark.
 *
 * ── EACH WEEK FROM THE GROUP THEY WERE IN THAT WEEK ─────────────────────────
 * A member whose place records a move (`groupsByWeek`) has weeks on more than
 * one group's registers: their rollup is rebuilt from each week's register of
 * the group they were in that week (`sessionsWithGroup`), read in the same
 * transaction, so a push of their new group never counts that group's
 * earlier sessions (before they were in it) as absences, and a correction of
 * their old group's register still reaches their figures. A week in a group
 * that no longer meets counts nothing. The override applies only to this
 * group's registers, which are the ones the caller is changing. A member
 * with no such record is rebuilt from this group's registers, as always.
 */

/** What one caller is changing about one register, laid over what was read. */
export type RegisterOverride = {
  /** Marks to apply. `null` clears the mark back to unmarked. */
  marks?: Map<string, AttendanceStatus | null>;
  /**
   * Where people who came were, to apply: `true` online, `false` in the
   * room, `null` no entry (in the room). Read only beside a mark that says
   * they came, as the register's own `online` map is.
   */
  online?: Map<string, boolean | null>;
  /** The session-held switch, when this change moves it. */
  held?: boolean;
  /** The push stamp. Set when this change is what makes the register count. */
  pushedAt?: Date;
  /**
   * The register stops being finished with this change (a correction that
   * moves its lines to another session, or clears them, or calls the session
   * off): it counts for nobody, whatever was stored.
   */
  unpushed?: boolean;
};

export type MirrorPlan = {
  /** Every register of this group that exists, by session key. */
  registers: Map<string, CourseAttendanceDoc>;
  /** One write per member whose rollup this change produced. */
  writes: Array<{ ref: DocumentReference; rollup: EnrolmentAttendanceRollup }>;
};

/**
 * Read every register of the group, apply the caller's override, and compute
 * the rollup each member's enrolment should now carry.
 *
 * Members whose enrolment document is missing are skipped rather than created:
 * a rollup is a mirror of a row that exists, and minting one here would invent
 * an enrolment nobody granted.
 */
export async function readMirrorPlan(
  tx: Transaction,
  db: Firestore,
  args: {
    runId: string;
    /** The run, to resolve the sessions of another group a member's weeks were spent in. */
    run: CourseRunDoc;
    groupId: string;
    sessions: ResolvedSession[];
    /**
     * WHOSE ROLLUP THIS REWRITES. Pass `loadMirrorMembers`, not the register's
     * own rows: the rows are the ACTIVE members, and a withdrawn member's
     * figures are still read on the admin surfaces and on their own run
     * overview. See the module header.
     */
    members: MirrorMember[];
    /** Keyed by session key. */
    overrides?: Map<string, RegisterOverride>;
    now: Date;
  },
): Promise<MirrorPlan> {
  const { runId, groupId, sessions, members, now } = args;
  const overrides = args.overrides ?? new Map<string, RegisterOverride>();

  const registerRefs = sessions.map((s) =>
    db
      .collection("courseAttendance")
      .doc(attendanceDocId(runId, groupId, s.weekNumber, s.occurrence)),
  );
  const enrolmentRefs = members.map((m) =>
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, m.uid)),
  );

  // ONE `getAll` for each side. Both are addressed reads inside the
  // transaction, so both are covered by its consistency guarantee: a
  // concurrent mark on another session cannot make this recompute stale
  // without also aborting it.
  const [registerSnaps, enrolmentSnaps] = await Promise.all([
    registerRefs.length ? tx.getAll(...registerRefs) : Promise.resolve([]),
    enrolmentRefs.length ? tx.getAll(...enrolmentRefs) : Promise.resolve([]),
  ]);

  const registers = new Map<string, CourseAttendanceDoc>();
  for (const snap of registerSnaps) {
    if (!snap.exists) continue;
    const doc = normalizeCourseAttendance(snap.id, snap.data() ?? {});
    // Keyed by the DERIVED session key rather than by the position in the
    // request: `getAll` does answer in order, but a register landing under
    // the wrong session's key is a silent, plausible-looking lie.
    registers.set(doc.sessionKey, doc);
  }

  // Matched by DOC ID, not by result position, so nothing here rests on
  // `getAll` returning documents in the order it was asked for them.
  const uidByEnrolmentId = new Map(
    members.map((m) => [courseEnrolmentId(runId, m.uid), m.uid]),
  );
  const enrolmentByUid = new Map<string, DocumentReference>();
  const placeByUid = new Map<string, CourseEnrolmentDoc>();
  for (const snap of enrolmentSnaps) {
    const uid = uidByEnrolmentId.get(snap.id);
    if (snap.exists && uid) {
      enrolmentByUid.set(uid, snap.ref);
      placeByUid.set(uid, normalizeCourseEnrolment(snap.id, snap.data() ?? {}));
    }
  }

  // The other groups the members' weeks were spent in, their sessions, and
  // the registers of those weeks: read here, still before any write, and only
  // for a member whose place records a move.
  const movers = members.filter((m) => {
    const place = placeByUid.get(m.uid);
    return place !== undefined && hasGroupsByWeek(place);
  });
  const otherGroupIds = [
    ...new Set(movers.flatMap((m) => groupsOfWeeks(placeByUid.get(m.uid) as CourseEnrolmentDoc))),
  ].filter((id) => id !== groupId && !id.includes("/"));
  const otherGroupSnaps = otherGroupIds.length
    ? await tx.getAll(...otherGroupIds.map((id) => db.collection("courseGroups").doc(id)))
    : [];
  const otherSessions = new Map<string, ResolvedSession[]>();
  for (const snap of otherGroupSnaps) {
    if (!snap.exists) continue;
    const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
    // A group that no longer meets holds no week of anybody's figures.
    if (group.archived || group.runId !== runId) continue;
    otherSessions.set(group.id, resolveSessions(args.run, group));
  }
  const sessionsOf = (id: string): readonly ResolvedSession[] | null =>
    id === groupId ? sessions : (otherSessions.get(id) ?? null);
  const weeksOf = new Map<string, Array<{ groupId: string; session: ResolvedSession }>>();
  for (const m of movers) weeksOf.set(m.uid, sessionsWithGroup(placeByUid.get(m.uid) as CourseEnrolmentDoc, sessionsOf));
  const otherRefs = new Map<string, DocumentReference>();
  for (const pairs of weeksOf.values()) {
    for (const pair of pairs) {
      if (pair.groupId === groupId) continue;
      const id = attendanceDocId(runId, pair.groupId, pair.session.weekNumber, pair.session.occurrence);
      otherRefs.set(id, db.collection("courseAttendance").doc(id));
    }
  }
  const otherSnaps = otherRefs.size ? await tx.getAll(...otherRefs.values()) : [];
  const otherRegisters = new Map<string, CourseAttendanceDoc>();
  for (const snap of otherSnaps) {
    if (snap.exists) otherRegisters.set(snap.id, normalizeCourseAttendance(snap.id, snap.data() ?? {}));
  }

  const writes: MirrorPlan["writes"] = [];
  for (const member of members) {
    const ref = enrolmentByUid.get(member.uid);
    if (!ref) continue;
    const facts: RegisterFact[] = [];
    const weeks = weeksOf.get(member.uid) ?? sessions.map((session) => ({ groupId, session }));
    for (const { groupId: weekGroup, session } of weeks) {
      const own = weekGroup === groupId;
      const stored = own
        ? registers.get(session.sessionKey)
        : otherRegisters.get(attendanceDocId(runId, weekGroup, session.weekNumber, session.occurrence));
      const override = own ? overrides.get(session.sessionKey) : undefined;
      // A session with no register and no override in play is a session
      // nobody has opened. It contributes nothing rather than an absence.
      if (!stored && !override) continue;
      const status = override?.marks?.has(member.uid)
        ? (override.marks.get(member.uid) ?? null)
        : (stored?.records[member.uid] ?? null);
      // Where they were, by the same override-then-stored order. Only a mark
      // that says they came carries it (`recomputeRollup` asks again).
      const online = override?.online?.has(member.uid)
        ? override.online.get(member.uid) === true
        : stored?.online[member.uid] === true;
      facts.push({
        sessionKey: session.sessionKey,
        weekNumber: session.weekNumber,
        occurrence: session.occurrence,
        // A session cancelled through "Change a session" did not happen,
        // whatever its register says: it counts for nobody (the rollup's
        // second rule), as the lead's tabs and the register read it.
        held: !session.cancelled && (override?.held ?? stored?.held ?? true),
        pushedAt: override?.unpushed ? null : (override?.pushedAt ?? stored?.pushedAt ?? null),
        status,
        online,
      });
    }
    writes.push({
      ref,
      rollup: recomputeRollup(facts, {
        joinedWeekNumber: member.joinedWeekNumber,
        now,
      }),
    });
  }

  return { registers, writes };
}
