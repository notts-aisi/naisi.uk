import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isValidDateKey } from "@/lib/courses/weekPlan";
import { memberCurrentWeek, resolveCalendar } from "@/lib/courses/groupResolve";
import { readMirrorPlan, type RegisterOverride } from "@/lib/courses/attendanceMirror";
import {
  gateGroupRegister,
  gateGroupRegisterRead,
  isAddressableId,
  loadMirrorMembers,
  loadRegisterMembers,
  readsFacilitatorRecord as readsFacilitatorRecordOf,
  registerSessionAccess,
  type RegisterMember,
} from "@/lib/courses/registerAccess";
import {
  registerCoverExtras,
  standingFacilitators,
  type NamedPerson,
  type RegisterCoverExtras,
} from "@/lib/courses/registerCover/view";
import { didNotHappenLine, leaversOfGroup, readRunRecords } from "@/lib/courses/programmeAttendance";
import { readRegisterEnding, type RegisterEnding } from "@/lib/courses/registerEnding";
import {
  resolveSessions,
  sessionInstants,
  type ResolvedSession,
} from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  ATTENDANCE_LIMITS,
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABEL,
  COVER,
  EXCUSED_IN_ADVANCE,
  FACILITATOR_RECORD,
  ONLINE,
  ONLINE_SAID,
  SET_BY,
  attendanceDocId,
  cameBy,
  normalizeCourseAttendance,
  type AttendanceStatus,
  type CourseAttendanceDoc,
  type LineSetterHow,
} from "@/lib/firestore/courseAttendance";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { facilitatorsByFirstName } from "@/lib/courses/registerCover/people";
import { sessionInTransaction } from "@/lib/courses/registerCover/sessionInTransaction";
import {
  holdsGivenCover,
  lineMoved,
  presenceOnSave,
  saveTakesCover,
  setterHow,
} from "@/lib/courses/registerCover/model";
import { REGISTER_COVER_REFUSAL, tookDetail } from "@/lib/courses/registerCover/words";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  normalizeCourseWeek,
  type CourseRunDoc,
} from "@/lib/firestore/courses";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { reachLateMarks } from "@/lib/surveys/checkIns/lateMark";

/**
 * THE ATTENDANCE REGISTER for one group: the whole grid on GET, one session's
 * marks on POST, an admin's correction to a LOCKED register on PATCH.
 *
 * `courseAttendance` is `read/write: if false` in firestore.rules, so no
 * client ever touches it. This file and its two siblings (`attendance/push`,
 * `participant-notes`) are the only paths to the data in either direction.
 * The access rule lives in `src/lib/courses/registerAccess.ts`: every write
 * answers to `gateGroupRegister`, and this GET to `gateGroupRegisterRead`,
 * which also lets the lead of the programme that names the run read.
 *
 * ── A COLUMN IS A SESSION, NOT A WEEK ───────────────────────────────────────
 * Columns come from `resolveSessions`, so a group that meets twice in a week
 * gets two, each with its own register document, its own held switch and its
 * own push. For every group that meets once, which is all of them today, the
 * columns and the register ids are exactly what they were.
 *
 * ── THE DRAFT / FINISHED BOUNDARY ───────────────────────────────────────────
 * A register is a DRAFT the facilitator saves as often as they like during the
 * session, and finishing it (the push route: "Finish the register" while next
 * week's email is on its schedule, "Push attendance" while the push still
 * sends that email) is the state change: the register locks and the enrolment
 * rollups are recomputed from it. After that:
 *  · POST REFUSES. A facilitator who needs a mark changed asks an admin, and
 *    the reason is not procedural: the push is what mailed the group and moved
 *    the numbers a reviewer reads, so a quiet edit afterwards would leave the
 *    record and the mirror describing different sessions.
 *  · PATCH is that admin's door, and every mark it moves appends its own
 *    `courseAudit` row saying what changed and from what to what.
 * A learner sees their own mark only once the register is pushed, which is
 * what makes the draft a draft.
 *
 * ── MID-RUN JOINERS ─────────────────────────────────────────────────────────
 * `courseEnrolments.joinedWeekNumber` travels with every member and SCOPES the
 * grid: the UI renders the cells before it as inert, and the write gate
 * REFUSES them. Without that, someone who joined in week 5 reads as four weeks
 * absent, a record that is not merely unkind but false.
 *
 * ── V2-3: THE COLUMNS ARE THE GROUP'S RHYTHM ────────────────────────────────
 * Every calendar question here is asked of the GROUP's resolved calendar: its
 * own pacing when its facilitator has set one, the run's otherwise. A group
 * that inserted its own reading week is a group that did not meet that week,
 * and a register offering a column for a session nobody held invites a
 * facilitator to mark a room full of people absent from a class that never
 * happened. Column TITLES resolve group-first too, so a week the facilitator
 * has forked and renamed reads under the name their members see.
 *
 * ── IN THE ROOM OR ONLINE ───────────────────────────────────────────────────
 * Somebody marked present, late or left early was either in the room or
 * joined online, and the register keeps which beside its marks (`online`,
 * `uid -> true` online or `false` in the room), never as a sixth mark. Every
 * mark that says somebody came writes their entry: the place the press
 * gives, or the one the register already keeps, or, the first time, their
 * own word in advance ("Joining online", `onlineSaid`), so somebody who said
 * they are joining online is put down as online until a facilitator says
 * they were in the room. Any other mark, or clearing one, takes the entry
 * away. A register written before this has none, and everybody on it was in
 * the room. An admin's correction of a finished register moves it on the
 * same lane as a mark, with its own audit row.
 *
 * ── A SESSION CANCELLED THROUGH "CHANGE A SESSION" ─────────────────────────
 * Its column reads as not held, as the lead's tabs and the register jobs
 * read it, whatever its register says, and its register needs nothing: a
 * mark, the held switch, a note and an admin's correction are refused in the
 * register's words for a session that did not happen (the push route refuses
 * it the same way). Putting the session back is "Change a session"'s own
 * "Hold it as usual", never the register's switch.
 */

// ---------------------------------------------------------------------------
// Wire types (the contract the AttendanceGrid renders from)
// ---------------------------------------------------------------------------

/** One column: a session the group holds, and the state of its register. */
export type AttendanceSession = {
  weekNumber: number;
  /** 1-based. Two sessions in one week differ only here and in `sessionKey`. */
  occurrence: number;
  /** `sessionKey(weekNumber, occurrence)`. The key of every map below. */
  sessionKey: string;
  weekId: string;
  title: string;
  /** Civil date of the session, or "" when the calendar cannot resolve one. */
  dateKey: string;
  /**
   * False = the session did not happen: its register says so, or it was
   * cancelled through "Change a session". Out of every denominator.
   */
  held: boolean;
  /**
   * The facilitator's note on the session as a whole. "" for a caller the
   * gate admits only as the programme's lead: a register's notes are the
   * group's facilitators' and admins'.
   */
  notes: string;
  /** ISO instant of PUSH ATTENDANCE, or null while this is still a draft. */
  pushedAt: string | null;
};

export type AttendancePayload = {
  group: { id: string; name: string };
  /**
   * The grid's COLUMNS, in plan order: every session that has started (see
   * `columnsFor`). Breaks carry no week and no session, so they never appear.
   */
  sessions: AttendanceSession[];
  /**
   * The grid's ROWS: active members of the group, name-sorted. Names only,
   * by the names rule for the caller (`nameForViewer`: the committee and
   * admins see "Priya Shah (Pri)", a facilitator who is not on it the name
   * people go by). For anybody but an admin, only people Publish has told
   * their group.
   */
  members: RegisterMember[];
  /**
   * True when somebody placed in the group is not a row yet because Publish
   * has not told them their group. Never true for an admin.
   */
  notYetTold: boolean;
  /**
   * SOMEBODY WHO LEFT THE GROUP, read only, as the facilitator's group page shows "Sam
   * Whitfield, Left Fri 13 Nov": the people the lead's Attendance tab lists
   * in this group as having left (`leaversOfGroup`, the grid's own rule, so
   * the two agree), named as the rows are, name-sorted, each with the marks
   * this group's registers hold for them. They are NOT rows of the register: nobody can mark them
   * (a write's marks are checked against `members`), they count in no tally,
   * and nothing chases a session after they left, which is blank.
   */
  leavers: AttendanceLeaver[];
  /**
   * The marks, `sessionKey -> uid -> status`. Sparse in BOTH directions: an
   * absent key means "not marked", which is a real and common state (nobody
   * has opened the register yet) and is deliberately distinct from "absent".
   */
  records: Record<string, Record<string, AttendanceStatus>>;
  /**
   * WHERE EACH PERSON WHO CAME WAS, `sessionKey -> uid -> online`: true
   * joined online, false in the room, as the register keeps it beside the
   * marks above. Rows only, and only beside a mark that says they came
   * (present, late, left early). Somebody who came with no entry was in the
   * room: every register written before this was kept.
   */
  online: Record<string, Record<string, boolean>>;
  /**
   * WHO SAID THEY ARE JOINING ONLINE ("Joining online" on their programme
   * page), `sessionKey -> uids`, for each column: the grid says so beside
   * their cell, and puts them down as online when they are marked as having
   * come. Rows only, in the rows' order.
   */
  onlineSaid: Record<string, string[]>;
  /**
   * Post-session notes about individual participants, `sessionKey -> uid ->
   * note`. PERSONAL DATA ABOUT A NAMED STUDENT: served only to the group's
   * live facilitators and admins (`readsNotes` on the gate's answer), never
   * to the programme's lead, the cohort or the member it is about. Empty for
   * the lead, who reads the marks. The drawer that renders them says so in as
   * many words.
   */
  participantNotes: Record<string, Record<string, string>>;
  /** True when the caller may correct a register that is already pushed. */
  canEditPushed: boolean;
  /**
   * How this register ends, every value from a record: which button it is,
   * the session it finishes, when next week's email goes and who is chased if
   * nobody finishes. The page words it (`registerEndingWords.ts`).
   */
  ending: RegisterEnding;
  /**
   * WHO TOLD US IN ADVANCE THAT THEY CAN'T MAKE A SESSION ("Can't make it" on
   * their programme page, `src/lib/courses/cantMakeIt/`): each session of
   * the group, a column or still to come, where a row of the register said
   * so and is still excused on it, soonest first, with its day and whether
   * it has ended. Rows only, as every map here is. The grid says it over the
   * table for a session that has not ended, and beside the mark in a cell.
   */
  cantMakeIt: AttendanceCantMakeIt[];
  /**
   * WHO SET EACH LINE, AND WHEN, `sessionKey -> uid -> {name, at, how}`:
   * rows only, named by the names rule for the reader. `how: "self"` is the
   * person's own word before the session. A register written before lines
   * were stamped has none, and shows nobody.
   */
  setBy: RegisterCoverExtras["setBy"];
  /** WHO TOOK A SESSION'S REGISTER IN A FACILITATOR'S PLACE, by session key; absent for a session nobody covered. */
  covers: RegisterCoverExtras["covers"];
  /**
   * WHETHER EACH OF THE GROUP'S FACILITATORS WAS THERE, by session key. Sent
   * ONLY to admins and the programme's lead, never to a run's track lead by
   * that alone and never to anybody who facilitates the group: the key is
   * absent from every other reader's answer.
   */
  facilitatorRecord?: RegisterCoverExtras["facilitatorRecord"];
  /** The group's facilitators who stand behind the role, by name: who Finish asks about, and whose place a cover takes. */
  facilitators: NamedPerson[];
  /** What the reader may do here, so the page offers nothing a route would refuse. */
  caller: AttendanceCaller;
};

/** What the reader is on this register, and what they may do on each session of it. */
export type AttendanceCaller = {
  standing: "admin" | "facilitator" | "lead" | "given";
  readsNotes: boolean;
  readsFacilitatorRecord: boolean;
  /** By session key, for each column. */
  sessions: Record<string, { writes: boolean; checksIn: boolean; readsCheckInTotals: boolean; reports: boolean; holdsCover: boolean }>;
};

/** One session where somebody told us in advance they can't make it. */
export type AttendanceCantMakeIt = {
  sessionKey: string;
  weekNumber: number;
  occurrence: number;
  /** Civil date of the session, "" when it has none. */
  dateKey: string;
  /** The session has ended: nothing more to say about it before it. */
  ended: boolean;
  /** The register's rows who said so, in the rows' order. */
  uids: string[];
};

/** Somebody who left the group, as the register lists them: read only. */
export type AttendanceLeaver = {
  uid: string;
  /**
   * Their name by the names rule for the caller, as the register's own rows
   * and the lead's tabs name people: never an address.
   */
  displayName: string;
  /** "Left Fri 13 Nov", or "Left" when the day is not on record. */
  left: string;
  /** Their marks on this group's registers, `sessionKey -> status`. */
  records: Record<string, AttendanceStatus>;
  /**
   * The sessions among those they joined online, by key. Absent when they
   * joined none online: every one was in the room.
   */
  online?: string[];
};

/** POST's answer. `marked` counts cells written, including cells cleared. */
export type AttendanceMarkResult = {
  ok: true;
  sessionKey: string;
  weekNumber: number;
  occurrence: number;
  marked: number;
  held: boolean;
};

/** PATCH's answer: the same, plus how many audit rows it appended. */
export type AttendanceEditResult = AttendanceMarkResult & { logged: number };

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Matches the rules' `weekNumber` bounds and COURSE_FIELD_LIMITS.maxWeekPlanEntries. */
const MAX_WEEK_NUMBER = 60;

/** A group meeting more than twice in one week is not a shape this supports. */
const MAX_OCCURRENCE = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A positive integer inside the plan's bounds, or null. */
function parseWeekParam(raw: string | null): number | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_WEEK_NUMBER ? n : null;
}

/**
 * Which columns the grid gets.
 *
 * Default: every session up to and including the cohort's CURRENT week,
 * `anchorWeekNumber`, so a group sitting in reading week still sees the taught
 * week it is anchored to rather than losing a column mid-break. Sessions that
 * have not started yet are not columns: an empty register for a session three
 * weeks out is noise a facilitator has to scroll past every time.
 *
 * `?week=N` widens that bound to include N. It is the escape hatch for the two
 * cases the default is wrong for, a group meeting on the very edge of the week
 * roll and a run whose `startDate` is not authored yet, and it can only ADD
 * columns, never hide one, so it cannot be used to make a marked session
 * vanish. The floor is the first session, so the surface is never an empty
 * table with nothing to explain itself.
 */
export function columnsFor(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  sessions: ResolvedSession[],
  requestedWeek: number | null,
): ResolvedSession[] {
  let anchor = 0;
  // The week maths throws RangeError on an unusable start date, which is a
  // legitimate half-authored state rather than an error. Guarded on the
  // RESOLVED date, since a group's pacing override can be half-authored
  // exactly as a run's can.
  if (isValidDateKey(resolveCalendar(run, group).startDate)) {
    anchor = memberCurrentWeek(run, group).anchorWeekNumber;
  }
  const first = sessions[0]?.weekNumber ?? 0;
  const upTo = Math.max(anchor, requestedWeek ?? 0, first);
  return sessions.filter((s) => s.weekNumber <= upTo);
}

/** The body shape all three write paths parse out of a request. */
type SessionTarget = { weekNumber: number; occurrence: number };

function parseSessionTarget(
  body: Record<string, unknown>,
): { ok: true; value: SessionTarget } | { ok: false; error: string } {
  const weekNumber = body.weekNumber;
  if (
    typeof weekNumber !== "number" ||
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > MAX_WEEK_NUMBER
  ) {
    return {
      ok: false,
      error: `weekNumber must be a whole number between 1 and ${MAX_WEEK_NUMBER}.`,
    };
  }
  const raw = body.occurrence;
  // ABSENT MEANS THE WEEK'S FIRST SESSION, which is what every client that
  // predates the occurrence dimension means by "week N".
  const occurrence = raw === undefined || raw === null ? 1 : raw;
  if (
    typeof occurrence !== "number" ||
    !Number.isInteger(occurrence) ||
    occurrence < 1 ||
    occurrence > MAX_OCCURRENCE
  ) {
    return {
      ok: false,
      error: `occurrence must be a whole number between 1 and ${MAX_OCCURRENCE}.`,
    };
  }
  return { ok: true, value: { weekNumber, occurrence } };
}

type IncomingMark = { uid?: unknown; status?: unknown; online?: unknown };

/**
 * The marks a write path is asking for, deduplicated by uid, LAST WINS. One
 * cell, one outcome, and the count that comes back is the number of cells that
 * actually changed hands rather than the length of the array.
 *
 * `online` is where somebody marked as having come was, when the press says
 * (true online, false in the room), keyed by uid beside the marks; a press
 * that does not say leaves it to `onlineAfter`. It is refused beside a mark
 * that does not say they came.
 */
function parseMarks(
  raw: unknown,
):
  | { ok: true; value: Map<string, AttendanceStatus | null>; online: Map<string, boolean> }
  | { ok: false; error: string } {
  const wanted = new Map<string, AttendanceStatus | null>();
  const online = new Map<string, boolean>();
  if (raw === undefined || raw === null) return { ok: true, value: wanted, online };
  if (!Array.isArray(raw)) return { ok: false, error: "marks must be a list." };
  if (raw.length > ATTENDANCE_LIMITS.maxRecords) {
    return {
      ok: false,
      error: `That's too many marks at once (maximum ${ATTENDANCE_LIMITS.maxRecords}).`,
    };
  }
  for (const entry of raw as IncomingMark[]) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "That mark looks malformed." };
    }
    const uid = entry.uid;
    if (typeof uid !== "string" || !uid) {
      return { ok: false, error: "That mark looks malformed." };
    }
    const status = entry.status;
    // `null` is the CLEAR instruction, and the only non-status value accepted.
    if (status !== null && !ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
      return {
        ok: false,
        error: `status must be null or one of: ${ATTENDANCE_STATUSES.join(", ")}.`,
      };
    }
    const where = entry.online;
    if (where !== undefined && typeof where !== "boolean") {
      return { ok: false, error: "online must be true or false." };
    }
    if (typeof where === "boolean" && !cameBy(status as AttendanceStatus | null)) {
      return { ok: false, error: "online is only for somebody marked present, late or left early." };
    }
    wanted.set(uid, (status as AttendanceStatus | null) ?? null);
    if (typeof where === "boolean") online.set(uid, where);
    else online.delete(uid);
  }
  return { ok: true, value: wanted, online };
}

/**
 * WHERE SOMEBODY MARKED AS HAVING COME WAS, after a write: what the press
 * says, else what the register keeps beside a mark that already said they
 * came, else their own word in advance that they are joining online. A
 * facilitator who puts somebody in the room keeps them there through every
 * mark that still says they came.
 */
function onlineAfter(given: boolean | undefined, kept: unknown, said: unknown): boolean {
  if (typeof given === "boolean") return given;
  if (typeof kept === "boolean") return kept;
  return Boolean(said);
}

/** A mark as an audit row says it: "Present", "Present online", "not marked". */
function markLabel(status: AttendanceStatus | null, online: boolean): string {
  if (!status) return "not marked";
  return cameBy(status) && online ? `${ATTENDANCE_STATUS_LABEL[status]} online` : ATTENDANCE_STATUS_LABEL[status];
}

/**
 * Every uid must be an ACTIVE member of THIS group, and no mark may land
 * before the week they joined. Unknown uids are REFUSED, not silently dropped:
 * a register that quietly ignored half a batch would read as "marked" to the
 * facilitator who sent it.
 *
 * Clearing is exempt from the joined-week floor: a mark stranded there by an
 * edited `joinedWeekNumber` must stay removable.
 */
function checkMarksAgainstRoster(
  marks: Map<string, AttendanceStatus | null>,
  members: RegisterMember[],
  weekNumber: number,
): string | null {
  const byUid = new Map(members.map((m) => [m.uid, m]));
  for (const [uid, status] of marks) {
    const member = byUid.get(uid);
    if (!member) return "Someone in that batch isn't an active member of this group.";
    if (status !== null && weekNumber < member.joinedWeekNumber) {
      return `${member.displayName} hadn't joined the group in week ${weekNumber}.`;
    }
  }
  return null;
}

/** Free-text session note, bounded and collapsed to what the doc will hold. */
function parseNotes(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "The session note must be text." };
  const text = raw.trim();
  if (text.length > ATTENDANCE_LIMITS.notes) {
    return {
      ok: false,
      error: `That note is too long (maximum ${ATTENDANCE_LIMITS.notes} characters).`,
    };
  }
  return { ok: true, value: text };
}

// ---------------------------------------------------------------------------
// Shared setup for the two write verbs
// ---------------------------------------------------------------------------

type WriteContext = {
  actor: Awaited<ReturnType<typeof getCurrentUser>> & object;
  db: FirebaseFirestore.Firestore;
  group: CourseGroupDoc;
  run: CourseRunDoc;
  runId: string;
  isAdmin: boolean;
  /** A live facilitator of this group. */
  facilitates: boolean;
  /** Leads the programme naming the run, or a track lead of it (not an admin). */
  leads: boolean;
  /** The sessions the caller was given, while each holds. */
  givenSessions: string[];
  /** The group's facilitators and admins: the register's notes are theirs. */
  readsNotes: boolean;
  sessions: ResolvedSession[];
  session: ResolvedSession;
  members: RegisterMember[];
  body: Record<string, unknown>;
};

/**
 * Everything both write paths need, in the order that keeps an unauthorized
 * caller from learning the API's shape: gate first, body second.
 *
 * Validating first is how an unauthorized caller gets told "maximum 40 marks"
 * instead of the uniform 403. Payload-shape errors are a description of the
 * API, and someone who may not read this register is not owed one.
 */
async function prepareWrite(
  groupId: string,
  req: Request,
): Promise<{ ok: true; ctx: WriteContext } | { ok: false; response: NextResponse }> {
  const fail = (error: string, status: number) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status }),
  });

  if (!isAddressableId(groupId)) return fail("Group not found", 404);

  const actor = await getCurrentUser();
  if (!actor) return fail("Not signed in", 401);

  const db = getAdminDb();
  if (!db) return fail("Server not configured", 500);

  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return fail(gated.error, gated.status);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("Invalid JSON body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Expected a JSON object body.", 400);
  }

  const target = parseSessionTarget(body);
  if (!target.ok) return fail(target.error, 400);

  const [runSnap, { members }] = await Promise.all([
    db.collection("courseRuns").doc(gated.runId).get(),
    loadRegisterMembers(db, gated.runId, groupId, { isAdmin: gated.isAdmin, role: actor.role }),
  ]);
  if (!runSnap.exists) return fail("Run not found", 404);
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  // SESSION VALIDITY IS RECOMPUTED, never trusted: the session must be one
  // THIS GROUP holds. A break has no session to attend, and a week number
  // outside the plan would mint a register for a session that does not exist.
  const sessions = resolveSessions(run, gated.group);
  const session = sessions.find(
    (s) =>
      s.weekNumber === target.value.weekNumber &&
      s.occurrence === target.value.occurrence,
  );
  if (!session) {
    return fail(
      `Week ${target.value.weekNumber} isn't a taught session of this group's schedule.`,
      400,
    );
  }

  return {
    ok: true,
    ctx: {
      actor,
      db,
      group: gated.group,
      run,
      runId: gated.runId,
      isAdmin: gated.isAdmin,
      facilitates: gated.facilitates,
      leads: gated.leads,
      givenSessions: gated.givenSessions,
      readsNotes: gated.readsNotes,
      sessions,
      session,
      members,
      body,
    },
  };
}

/**
 * SOMEBODY GIVEN ONE SESSION writes that session's register and no other,
 * and reaches it only while the grant holds: a session of the group they
 * were not given is the same 403 as a group they have no part in. Everybody
 * else the gate admitted writes any session's.
 */
function sessionRefusal(ctx: WriteContext): NextResponse | null {
  if (ctx.isAdmin || ctx.facilitates || ctx.leads) return null;
  if (ctx.givenSessions.includes(ctx.session.sessionKey)) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * A session cancelled through "Change a session" met nobody: its register
 * needs nothing, and nothing written to it could count. Each write verb asks
 * this once its own gate has answered, so a refusal it gave before still
 * comes first.
 */
function cancelledSessionRefusal(ctx: WriteContext): NextResponse | null {
  if (!ctx.session.cancelled) return null;
  return NextResponse.json(
    { error: didNotHappenLine(ctx.group.name.trim() || "This group", ctx.session.dateKey) },
    { status: 409 },
  );
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  // An unaddressable id names no group at all, so answering it plainly leaks
  // nothing: the same 404 the P8 routes give before their own gate.
  if (!isAddressableId(groupId)) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const weekParam = new URL(req.url).searchParams.get("week");
  const requestedWeek = parseWeekParam(weekParam);
  // Present-but-unparseable is an error; absent is the default view.
  if (weekParam !== null && requestedWeek === null) {
    return NextResponse.json(
      { error: `week must be a whole number between 1 and ${MAX_WEEK_NUMBER}.` },
      { status: 400 },
    );
  }

  // Reading is one person wider than marking: the lead of the programme
  // that names the run reads every register of it (`gateGroupRegisterRead`),
  // its marks and none of its notes (`readsNotes`).
  const gated = await gateGroupRegisterRead(groupId, actor, db);
  if (!gated.ok) {
    return NextResponse.json({ error: gated.error }, { status: gated.status });
  }
  const { group, runId } = gated;
  const now = new Date();
  // Somebody GIVEN a session, and admitted no other way, reads that
  // session's register and nothing else of the group: no other column, no
  // session still to come, nobody who left.
  const onlyGiven = !gated.isAdmin && !gated.facilitates && !gated.leads;

  // The run's records too, for who left this group: the lead's grid works
  // that out from the whole run (somebody staff took off is listed where a
  // register last marked them), and the register asks the same function.
  const [runSnap, { members, notYetTold }, runRecords] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    loadRegisterMembers(db, runId, groupId, { isAdmin: gated.isAdmin, role: actor.role }),
    onlyGiven ? Promise.resolve(null) : readRunRecords(db, runId),
  ]);
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const leaving = runRecords ? leaversOfGroup(runRecords, groupId, now) : [];
  const leaverMarks = new Map(leaving.map((leaver) => [leaver.uid, {} as Record<string, AttendanceStatus>]));
  const leaverOnline = new Map(leaving.map((leaver) => [leaver.uid, [] as string[]]));
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const sessions = resolveSessions(run, group);
  const columns = onlyGiven
    ? sessions.filter((session) => gated.givenSessions.includes(session.sessionKey))
    : columnsFor(run, group, sessions, requestedWeek);

  // Three `getAll`s, one round trip: the canonical week docs (titles only),
  // this group's forked copies of the same weeks, and the registers
  // themselves. All addressed, so no queries, no indexes, and the register ids
  // are `attendanceDocId`, which is construct-only by contract. The two week
  // reads are deduplicated because two sessions of one week share a week doc.
  const weekCollection = db.collection("courseRuns").doc(runId).collection("weeks");
  const forkCollection = db.collection("courseGroups").doc(groupId).collection("weeks");
  const weekIds = [...new Set(columns.map((c) => c.weekId))].filter(isAddressableId);
  // The sessions still to end that are not columns yet: somebody may have
  // told us they can't make one ("Can't make it"), and the register says so
  // before its column is drawn. A session cancelled through "Change a
  // session" meets nobody, so nothing is said of it.
  const columnKeys = new Set(columns.map((c) => c.sessionKey));
  const ahead = sessions.filter((s) => {
    if (onlyGiven || s.cancelled || columnKeys.has(s.sessionKey)) return false;
    const { endsAt } = sessionInstants(s);
    return endsAt !== null && endsAt.getTime() > now.getTime();
  });
  const [weekDocs, forkDocs, registerDocs, aheadDocs] = await Promise.all([
    weekIds.length
      ? db.getAll(...weekIds.map((id) => weekCollection.doc(id)))
      : Promise.resolve([]),
    weekIds.length
      ? db.getAll(...weekIds.map((id) => forkCollection.doc(id)))
      : Promise.resolve([]),
    columns.length
      ? db.getAll(
          ...columns.map((c) =>
            db
              .collection("courseAttendance")
              .doc(attendanceDocId(runId, groupId, c.weekNumber, c.occurrence)),
          ),
        )
      : Promise.resolve([]),
    ahead.length
      ? db.getAll(...ahead.map((s) => db.collection("courseAttendance").doc(attendanceDocId(runId, groupId, s.weekNumber, s.occurrence))))
      : Promise.resolve([]),
  ]);

  // Canonical first, the group's fork laid over it: the same overlay the
  // overview route applies to the rail, so staff and members read one title.
  const titleByWeekId = new Map<string, string>();
  for (const doc of [...weekDocs, ...forkDocs]) {
    if (doc.exists) {
      titleByWeekId.set(doc.id, normalizeCourseWeek(doc.id, doc.data() ?? {}).title);
    }
  }

  // Columns keyed by DOC ID rather than by array position: `getAll` does
  // answer in request order, but a register landing under the wrong session's
  // column is a silent, plausible-looking lie, and `attendanceDocId` makes the
  // id to session map free.
  const sessionByDocId = new Map(
    columns.map((c) => [
      attendanceDocId(runId, groupId, c.weekNumber, c.occurrence),
      c,
    ]),
  );
  const memberUids = new Set(members.map((m) => m.uid));
  const records: AttendancePayload["records"] = {};
  const online: AttendancePayload["online"] = {};
  const onlineSaid: AttendancePayload["onlineSaid"] = {};
  const participantNotes: AttendancePayload["participantNotes"] = {};
  const stateByKey = new Map<string, { held: boolean; notes: string; pushedAt: string | null }>();
  // Who told us in advance, by session: every register read, the columns' and
  // the sessions still to come.
  const registerBySessionKey = new Map<string, CourseAttendanceDoc>();
  for (const snap of [...registerDocs, ...aheadDocs]) {
    if (!snap.exists) continue;
    const register = normalizeCourseAttendance(snap.id, snap.data() ?? {});
    registerBySessionKey.set(register.sessionKey, register);
  }

  for (const snap of registerDocs) {
    const column = sessionByDocId.get(snap.id);
    if (!snap.exists || !column) continue;
    const data = snap.data() ?? {};
    const raw = (data.records ?? {}) as Record<string, unknown>;
    const week: Record<string, AttendanceStatus> = {};
    for (const [uid, status] of Object.entries(raw)) {
      if (!ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) continue;
      // Somebody who left the group: their marks are theirs to keep, read
      // only, beside the register and never in it.
      const left = leaverMarks.get(uid);
      if (left) {
        left[column.sessionKey] = status as AttendanceStatus;
        continue;
      }
      // THE ROSTER IS THE FILTER: a mark left behind by someone no longer in
      // the group, and not listed as having left it, has no row to sit in,
      // and shipping their uid would hand out an identifier for a person no
      // longer in this facilitator's group.
      if (!memberUids.has(uid)) continue;
      week[uid] = status as AttendanceStatus;
    }
    if (Object.keys(week).length > 0) records[column.sessionKey] = week;

    // Where each row who came was, beside their mark and nowhere else, and
    // who said they are joining online. Read off the register as its own
    // reader keeps them; somebody who left keeps the sessions they joined
    // online with their marks.
    const kept = normalizeCourseAttendance(snap.id, data);
    const where: Record<string, boolean> = {};
    for (const [uid, status] of Object.entries(week)) {
      if (cameBy(status) && typeof kept.online[uid] === "boolean") where[uid] = kept.online[uid];
    }
    if (Object.keys(where).length > 0) online[column.sessionKey] = where;
    for (const [uid, sessionKeys] of leaverOnline) {
      if (cameBy(kept.records[uid]) && kept.online[uid] === true) sessionKeys.push(column.sessionKey);
    }
    const said = members.map((m) => m.uid).filter((uid) => kept.onlineSaid[uid]);
    if (said.length > 0) onlineSaid[column.sessionKey] = said;

    // A register's notes go to the group's facilitators and admins only: a
    // caller the gate admits as the programme's lead is sent none of them.
    const rawNotes = (gated.readsNotes ? (data.participantNotes ?? {}) : {}) as Record<string, unknown>;
    const notes: Record<string, string> = {};
    for (const [uid, note] of Object.entries(rawNotes)) {
      if (!memberUids.has(uid)) continue;
      if (typeof note !== "string" || !note) continue;
      notes[uid] = note.slice(0, ATTENDANCE_LIMITS.participantNote);
    }
    if (Object.keys(notes).length > 0) participantNotes[column.sessionKey] = notes;

    // Through the collection's own reader, which takes a stored Timestamp
    // and a Date alike.
    const pushedAt = normalizeCourseAttendance(snap.id, data).pushedAt;
    stateByKey.set(column.sessionKey, {
      held: data.held !== false,
      notes: gated.readsNotes && typeof data.notes === "string" ? data.notes : "",
      pushedAt: pushedAt ? pushedAt.toISOString() : null,
    });
  }

  const ending = await readRegisterEnding(db, {
    run,
    group,
    sessions,
    columns: columns.map((session) => ({
      session,
      finished: Boolean(stateByKey.get(session.sessionKey)?.pushedAt),
    })),
    now,
    registers: registerBySessionKey,
  });

  const leavers: AttendanceLeaver[] = leaving
    .map((leaver) => ({
      uid: leaver.uid,
      displayName: nameForViewer(actor, accountNamesOf(runRecords?.accounts.get(leaver.uid) ?? {}), "NAISI member"),
      left: leaver.left,
      records: leaverMarks.get(leaver.uid) ?? {},
      ...((leaverOnline.get(leaver.uid) ?? []).length > 0 ? { online: leaverOnline.get(leaver.uid) } : {}),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.uid.localeCompare(b.uid));

  // Somebody told us in advance, and the register still has them excused:
  // the rows only, in their order, soonest session first.
  const cantMakeIt: AttendanceCantMakeIt[] = [];
  for (const session of [...columns, ...ahead]) {
    const register = registerBySessionKey.get(session.sessionKey);
    if (!register) continue;
    const uids = members
      .map((m) => m.uid)
      .filter((uid) => register.excusedInAdvance[uid] && register.records[uid] === "excused");
    if (uids.length === 0) continue;
    const { endsAt } = sessionInstants(session);
    cantMakeIt.push({
      sessionKey: session.sessionKey,
      weekNumber: session.weekNumber,
      occurrence: session.occurrence,
      dateKey: session.dateKey,
      ended: session.cancelled || (endsAt !== null && endsAt.getTime() <= now.getTime()),
      uids,
    });
  }

  // Who set each line, who covered, and (for admins and the programme's
  // lead, never a facilitator of the group, never a run's track lead by that
  // alone) whether each facilitator was there: the columns' registers only.
  const columnRegisters = columns
    .map((column) => registerBySessionKey.get(column.sessionKey))
    .filter((register): register is CourseAttendanceDoc => register !== undefined);
  const readsFacilitatorRecord = readsFacilitatorRecordOf(gated);
  const [extras, facilitators] = await Promise.all([
    registerCoverExtras(db, {
      registers: columnRegisters,
      rows: memberUids,
      viewer: { uid: actor.uid, isAdmin: gated.isAdmin, role: actor.role },
      readsFacilitatorRecord,
      now,
    }),
    standingFacilitators(db, group, { isAdmin: gated.isAdmin, role: actor.role }),
  ]);
  const caller: AttendanceCaller = {
    standing: gated.isAdmin ? "admin" : gated.facilitates ? "facilitator" : gated.leads ? "lead" : "given",
    readsNotes: gated.readsNotes,
    readsFacilitatorRecord,
    sessions: Object.fromEntries(
      columns.map((column) => {
        const access = registerSessionAccess(gated, {
          uid: actor.uid,
          sessionKey: column.sessionKey,
          cover: registerBySessionKey.get(column.sessionKey)?.cover ?? null,
          now,
        });
        const { writes, checksIn, readsCheckInTotals, reports, holdsCover } = access;
        return [column.sessionKey, { writes, checksIn, readsCheckInTotals, reports, holdsCover }];
      }),
    ),
  };

  const payload: AttendancePayload = {
    group: { id: group.id, name: group.name },
    sessions: columns.map((c) => {
      const state = stateByKey.get(c.sessionKey);
      return {
        weekNumber: c.weekNumber,
        occurrence: c.occurrence,
        sessionKey: c.sessionKey,
        weekId: c.weekId,
        title: titleByWeekId.get(c.weekId) ?? "",
        dateKey: c.dateKey,
        // A session with no register yet HELD, which is the same default the
        // normaliser applies: nobody has said otherwise. A session cancelled
        // through "Change a session" did not happen, whatever its register
        // says, as the lead's tabs and the register jobs read it.
        held: !c.cancelled && (state?.held ?? true),
        notes: state?.notes ?? "",
        pushedAt: state?.pushedAt ?? null,
      };
    }),
    members,
    notYetTold,
    leavers,
    records,
    online,
    onlineSaid,
    participantNotes,
    canEditPushed: gated.isAdmin,
    ending,
    cantMakeIt,
    setBy: extras.setBy,
    covers: extras.covers,
    ...(extras.facilitatorRecord ? { facilitatorRecord: extras.facilitatorRecord } : {}),
    facilitators,
    caller,
  };

  return NextResponse.json(payload);
}

// ---------------------------------------------------------------------------
// POST: marking a DRAFT register
// ---------------------------------------------------------------------------

/** Thrown inside a transaction, answered as a status outside it. */
class RegisterFullError extends Error {}
/** POST met a register that has already been pushed. */
class RegisterLockedError extends Error {}
/** POST by somebody given the session, met a grant that no longer holds. */
class RegisterNotYoursError extends Error {}
/** POST asked a session to be marked as not held, which Change this week now does. */
class NotHeldMovedError extends Error {}
/** POST met a session the group, read in the transaction, no longer holds as it did. */
class SessionChangedError extends Error {
  constructor(
    readonly reason: "gone" | "cancelled",
    readonly dateKey: string,
  ) {
    super(reason);
  }
}

/** One line's stamp as it is written. */
type LineSetterStamp = { byUid: string; at: Date; how: LineSetterHow };

/** One facilitator's entry as it is written. */
type FacilitatorPresenceStamp = {
  state: "there" | "late" | "not-there";
  arrivedAt?: Date;
  byUid: string;
  at: Date;
  how: "cover" | "arrived" | "finish" | "changed";
};
/** PATCH met a session nobody has opened a register for. */
class RegisterMissingError extends Error {}
/** PATCH met a register that is still the facilitator's draft. */
class RegisterUnpushedError extends Error {}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  const prepared = await prepareWrite(groupId, req);
  if (!prepared.ok) return prepared.response;
  const notYours = sessionRefusal(prepared.ctx);
  if (notYours) return notYours;
  const cancelled = cancelledSessionRefusal(prepared.ctx);
  if (cancelled) return cancelled;
  const { actor, db, runId, session, members, body, group, facilitates } = prepared.ctx;

  const parsedMarks = parseMarks(body.marks);
  if (!parsedMarks.ok) {
    return NextResponse.json({ error: parsedMarks.error }, { status: 400 });
  }
  const wanted = parsedMarks.value;
  const givenOnline = parsedMarks.online;

  const hasHeld = body.held !== undefined;
  if (hasHeld && typeof body.held !== "boolean") {
    return NextResponse.json({ error: "held must be true or false." }, { status: 400 });
  }
  const hasNotes = body.notes !== undefined;
  let notes = "";
  if (hasNotes) {
    // The register's notes are its facilitators' and admins': somebody
    // leading the programme, or given the session, saves marks only.
    if (!prepared.ctx.readsNotes) {
      return NextResponse.json({ error: REGISTER_COVER_REFUSAL.notes }, { status: 403 });
    }
    const parsed = parseNotes(body.notes);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    notes = parsed.value;
  }

  if (wanted.size === 0 && !hasHeld && !hasNotes) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  const rosterError = checkMarksAgainstRoster(wanted, members, session.weekNumber);
  if (rosterError) return NextResponse.json({ error: rosterError }, { status: 400 });

  // Somebody who is not one of the group's facilitators may take the register
  // in their place with this save: the facilitators whose place it would take
  // are the ones who stand behind the role now, read before the transaction.
  const coverable = facilitates ? [] : await facilitatorsByFirstName(db, group);

  const ref = db
    .collection("courseAttendance")
    .doc(attendanceDocId(runId, groupId, session.weekNumber, session.occurrence));
  // The register's OWN value after the write, not the request's: a POST that
  // sends no `held` must report what the session actually is rather than
  // assuming the default.
  let held = true;
  const now = new Date();

  try {
    // A TRANSACTION for one document, because the 40-key cap is a property of
    // the MERGED map: two facilitators marking the same session concurrently
    // would each see room and both be right, and the register would end up
    // over the cap that `normalizeCourseAttendance` then silently truncates on
    // read. Raw keys, not the normalised ones, so a doc already over the cap
    // is counted honestly rather than as 40.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // THE SESSION AS THE GROUP SAYS IT NOW, read in this transaction: the
      // start the register keeps (`sessionAt`) and the end a late arrival is
      // measured against are never worked out from a group read before it,
      // so a register marked as the group's weeks are re-dated keeps the
      // session's real start.
      const fresh = await sessionInTransaction(tx, db, prepared.ctx.run, groupId, session);
      if (!fresh.ok) throw new SessionChangedError(fresh.reason, fresh.dateKey);
      const { startsAt, endsAt } = fresh;
      const data = snap.data() ?? {};
      held = hasHeld ? body.held === true : data.held !== false;
      // THE LOCK. A pushed register has already mailed the group and moved the
      // rollups a reviewer reads; a later draft-lane write would leave the two
      // describing different sessions. PATCH is the admin's door.
      if (data.pushedAt) throw new RegisterLockedError();
      // "It didn't happen" now lives with the two cancels in Change this week:
      // a NEW not-held is refused; a register that already says it reads and
      // saves as before.
      if (hasHeld && body.held === false && data.held !== false) throw new NotHeldMovedError();
      const stored = normalizeCourseAttendance(snap.id, data);
      // Somebody given this session holds it only while the grant does: read
      // again here, against the register as it is now.
      if (!prepared.ctx.isAdmin && !facilitates && !prepared.ctx.leads && !holdsGivenCover(stored.cover, actor.uid, now)) {
        throw new RegisterNotYoursError();
      }

      const raw = (data.records ?? {}) as Record<string, unknown>;
      const keys = new Set(Object.keys(raw));
      for (const [uid, status] of wanted) {
        if (status === null) keys.delete(uid);
        else keys.add(uid);
      }
      if (keys.size > ATTENDANCE_LIMITS.maxRecords) throw new RegisterFullError();

      // `set(..., { merge: true })` rather than `update()`: it creates the
      // register on the first mark of a session and merges the `records` MAP
      // key by key on every later one, so two facilitators marking different
      // people never overwrite each other. It is also the dot-safe form: with
      // `update()` a uid would be parsed as a field PATH, whereas nested keys
      // in `set()` are literal field names.
      const records: Record<string, AttendanceStatus | FieldValue> = {};
      for (const [uid, status] of wanted) {
        // Clearing removes the MAP KEY (never the document): the register is
        // shared, and "not marked" is the absence of a key, not a status.
        records[uid] = status === null ? FieldValue.delete() : status;
      }
      // A facilitator's mark makes the line theirs. The note that the person
      // told us in advance they can't make it ("Can't make it") goes with the
      // excused mark it came with, so the person's "I can make it after all"
      // can never clear a mark a facilitator made. Only a key that is there
      // is deleted, so a register nobody told keeps no such map.
      const toldBefore = (data[EXCUSED_IN_ADVANCE] ?? {}) as Record<string, unknown>;
      const toldTakenOver: Record<string, FieldValue> = {};
      for (const uid of wanted.keys()) {
        if (Object.hasOwn(toldBefore, uid)) toldTakenOver[uid] = FieldValue.delete();
      }
      // Where each person marked as having come was (`onlineAfter`): kept
      // only beside a mark that said they came before this write. Any other
      // mark takes their entry away.
      const recordsBefore = (data.records ?? {}) as Record<string, unknown>;
      const onlineBefore = (data[ONLINE] ?? {}) as Record<string, unknown>;
      const saidBefore = (data[ONLINE_SAID] ?? {}) as Record<string, unknown>;
      const where: Record<string, boolean | FieldValue> = {};
      for (const [uid, status] of wanted) {
        if (cameBy(status)) {
          const kept = cameBy(recordsBefore[uid] as AttendanceStatus) ? onlineBefore[uid] : undefined;
          where[uid] = onlineAfter(givenOnline.get(uid), kept, saidBefore[uid]);
        } else if (Object.hasOwn(onlineBefore, uid)) {
          where[uid] = FieldValue.delete();
        }
      }

      // WHO SET EACH LINE: a line this save moved (its mark, or where somebody
      // who came was) is stamped with who saved it and when; a line it cleared
      // loses its stamp; a line it did not move keeps the one it had.
      const stamps: Record<string, LineSetterStamp | FieldValue> = {};
      let changedLines = 0;
      for (const [uid, status] of wanted) {
        const beforeMark = ATTENDANCE_STATUSES.includes(recordsBefore[uid] as AttendanceStatus)
          ? (recordsBefore[uid] as AttendanceStatus)
          : null;
        const beforeOnline = typeof onlineBefore[uid] === "boolean" ? (onlineBefore[uid] as boolean) : undefined;
        const afterOnline = cameBy(status) ? (where[uid] as boolean) : undefined;
        if (!lineMoved({ mark: beforeMark, online: beforeOnline }, { mark: status, online: afterOnline })) continue;
        if (status === null) {
          if (stored.setBy[uid]) stamps[uid] = FieldValue.delete();
        } else {
          stamps[uid] = { byUid: actor.uid, at: now, how: setterHow(facilitates) };
          changedLines += 1;
        }
      }

      // TAKEN IN A FACILITATOR'S PLACE: an admin's or a lead's first line on a
      // register nobody covered and none of its facilitators has started
      // stamps the cover in the same write, so a register is never taken in
      // somebody's place without the record, and the facilitators whose place
      // it takes are recorded as not there.
      const takesCover =
        !facilitates &&
        saveTakesCover({
          changedLines,
          cover: stored.cover,
          markedByUid: stored.markedByUid,
          setBy: stored.setBy,
          facilitatorUids: prepared.ctx.group.facilitatorUids,
        });
      const presence: Record<string, FacilitatorPresenceStamp> = {};
      if (takesCover) {
        for (const facilitator of coverable) {
          if (stored.facilitatorRecord[facilitator.uid]) continue;
          presence[facilitator.uid] = { state: "not-there", byUid: actor.uid, at: now, how: "cover" };
        }
      }
      // A facilitator recorded not there because somebody covered for them,
      // saving anything during the session, arrived late, at this moment.
      if (facilitates) {
        const arrived = presenceOnSave({
          uid: actor.uid,
          cover: stored.cover,
          entry: stored.facilitatorRecord[actor.uid],
          now,
          endsAt,
        });
        if (arrived) presence[actor.uid] = { ...arrived, byUid: actor.uid, at: now, how: "arrived" };
      }

      tx.set(
        ref,
        {
          // The id is construct-only by contract, so the parts live as fields.
          runId,
          groupId,
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          records,
          ...(Object.keys(toldTakenOver).length > 0 ? { [EXCUSED_IN_ADVANCE]: toldTakenOver } : {}),
          ...(Object.keys(where).length > 0 ? { [ONLINE]: where } : {}),
          ...(Object.keys(stamps).length > 0 ? { [SET_BY]: stamps } : {}),
          ...(takesCover
            ? { [COVER]: { kind: "self", byUid: actor.uid, at: now, covering: coverable.map((each) => each.uid) } }
            : {}),
          ...(Object.keys(presence).length > 0 ? { [FACILITATOR_RECORD]: presence } : {}),
          markedByUid: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(hasHeld ? { held: body.held === true } : {}),
          ...(hasNotes ? { notes } : {}),
          // Only when it resolves: the field is documented as absent
          // otherwise, and a merge must not write `undefined`.
          ...(startsAt ? { sessionAt: startsAt } : {}),
        },
        { merge: true },
      );
      if (takesCover) {
        tx.set(
          db.collection(COURSE_AUDIT_COLLECTION).doc(),
          groupHistoryRow({
            kind: "register-covered",
            run: { id: runId },
            group: prepared.ctx.group,
            actor,
            detail: tookDetail(session.weekNumber, coverable.map((each) => each.firstName), ""),
            weekId: session.weekId,
            after: { kind: "self", covering: coverable.length },
          }),
        );
      }
    });
  } catch (err) {
    if (err instanceof RegisterNotYoursError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof SessionChangedError) {
      return NextResponse.json(
        {
          error:
            err.reason === "cancelled"
              ? didNotHappenLine(group.name.trim() || "This group", err.dateKey)
              : `Week ${session.weekNumber} isn't a taught session of this group's schedule.`,
        },
        { status: 409 },
      );
    }
    if (err instanceof NotHeldMovedError) {
      return NextResponse.json({ error: REGISTER_COVER_REFUSAL.didNotHappen }, { status: 409 });
    }
    if (err instanceof RegisterLockedError) {
      return NextResponse.json(
        {
          error:
            "This register has been pushed, so it's locked. An admin can still correct it.",
        },
        { status: 409 },
      );
    }
    if (err instanceof RegisterFullError) {
      return NextResponse.json(
        {
          error: `This register is full (maximum ${ATTENDANCE_LIMITS.maxRecords} people). A group this size needs splitting.`,
        },
        { status: 409 },
      );
    }
    throw err;
  }

  // THE CHECK-IN: somebody marked there while the session's check-in is open
  // gets their own row on it, with no email (`reachLateMarks`, one read when
  // none is open). The mark is kept whatever happens there.
  try {
    await reachLateMarks(db, { runId, group: prepared.ctx.group, session, marked: [...wanted.values()], markedBy: actor.uid, now: new Date() });
  } catch (err) {
    console.error("[attendance] the check-in's late rows failed", runId, groupId, session.sessionKey, err);
  }

  const result: AttendanceMarkResult = {
    ok: true,
    sessionKey: session.sessionKey,
    weekNumber: session.weekNumber,
    occurrence: session.occurrence,
    marked: wanted.size,
    held,
  };
  return NextResponse.json(result);
}

// ---------------------------------------------------------------------------
// PATCH: an admin correcting a LOCKED register
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  const prepared = await prepareWrite(groupId, req);
  if (!prepared.ok) return prepared.response;
  const { actor, db, runId, isAdmin, sessions, session, members, body } = prepared.ctx;

  // ADMIN ONLY, and checked before the body is looked at any further. The push
  // is the facilitator's last word on a session; correcting it afterwards is
  // an administrative act with a name attached to it.
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only an admin can change a register after it has been pushed." },
      { status: 403 },
    );
  }
  const cancelled = cancelledSessionRefusal(prepared.ctx);
  if (cancelled) return cancelled;

  const parsedMarks = parseMarks(body.marks);
  if (!parsedMarks.ok) {
    return NextResponse.json({ error: parsedMarks.error }, { status: 400 });
  }
  const wanted = parsedMarks.value;
  const givenOnline = parsedMarks.online;
  const hasHeld = body.held !== undefined;
  if (hasHeld && typeof body.held !== "boolean") {
    return NextResponse.json({ error: "held must be true or false." }, { status: 400 });
  }
  // The SESSION note travels this lane too. It is a note about the room, not
  // about a person, and an admin correcting a pushed register is exactly who
  // writes "the fire alarm went off at 19:20" afterwards. Participant notes
  // stay on their own route, which the push deliberately never locks.
  const hasNotes = body.notes !== undefined;
  let notes = "";
  if (hasNotes) {
    const parsed = parseNotes(body.notes);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    notes = parsed.value;
  }
  if (wanted.size === 0 && !hasHeld && !hasNotes) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const rosterError = checkMarksAgainstRoster(wanted, members, session.weekNumber);
  if (rosterError) return NextResponse.json({ error: rosterError }, { status: 400 });

  const ref = db
    .collection("courseAttendance")
    .doc(attendanceDocId(runId, groupId, session.weekNumber, session.occurrence));
  const now = new Date();
  const actorName = actor.displayName ?? "";
  const memberName = new Map(members.map((m) => [m.uid, m.displayName]));
  // Read OUTSIDE the transaction: it is a membership list, not a value the
  // correction races with, and a transaction that queries cannot then write.
  const mirrorMembers = await loadMirrorMembers(db, runId, groupId);

  let logged = 0;
  let changed = 0;
  let held = true;
  try {
    await db.runTransaction(async (tx) => {
      logged = 0;
      changed = 0;
      const snap = await tx.get(ref);
      if (!snap.exists) throw new RegisterMissingError();
      const data = snap.data() ?? {};
      // PATCH is the LOCKED lane. A draft register is the facilitator's to
      // finish, and letting an admin type into one from a different surface
      // would leave two doors onto one unfinished document.
      if (!data.pushedAt) throw new RegisterUnpushedError();

      const stored = (data.records ?? {}) as Record<string, unknown>;
      const before = new Map<string, AttendanceStatus | null>();
      for (const uid of wanted.keys()) {
        const value = stored[uid];
        before.set(
          uid,
          ATTENDANCE_STATUSES.includes(value as AttendanceStatus)
            ? (value as AttendanceStatus)
            : null,
        );
      }
      // Where each of them was before, and after this correction: online only
      // beside a mark that says they came (`onlineAfter` for the after).
      const onlineStored = (data[ONLINE] ?? {}) as Record<string, unknown>;
      const saidStored = (data[ONLINE_SAID] ?? {}) as Record<string, unknown>;
      const onlineBefore = new Map<string, boolean>();
      const onlineNow = new Map<string, boolean>();
      for (const [uid, status] of wanted) {
        const was = before.get(uid) ?? null;
        onlineBefore.set(uid, cameBy(was) && onlineStored[uid] === true);
        onlineNow.set(
          uid,
          cameBy(status) && onlineAfter(givenOnline.get(uid), cameBy(was) ? onlineStored[uid] : undefined, saidStored[uid]),
        );
      }
      const heldBefore = data.held !== false;
      const heldAfter = hasHeld ? body.held === true : heldBefore;
      held = heldAfter;
      const notesBefore = typeof data.notes === "string" ? data.notes : "";
      const notesMoved = hasNotes && notes !== notesBefore;

      // Only the marks that actually MOVE are written or logged, a mark whose
      // room or online moved among them. An audit row per unchanged cell
      // would bury the one row that matters.
      const moved = [...wanted.entries()].filter(
        ([uid, status]) =>
          (before.get(uid) ?? null) !== status || onlineBefore.get(uid) !== onlineNow.get(uid),
      );
      changed = moved.length;

      const keys = new Set(Object.keys(stored));
      for (const [uid, status] of moved) {
        if (status === null) keys.delete(uid);
        else keys.add(uid);
      }
      if (keys.size > ATTENDANCE_LIMITS.maxRecords) throw new RegisterFullError();

      // EVERY READ BEFORE EVERY WRITE. The mirror plan reads the group's other
      // registers and the enrolments, so it has to run before the write below.
      const overrides = new Map<string, RegisterOverride>([
        [
          session.sessionKey,
          {
            marks: new Map(moved),
            online: new Map(moved.map(([uid, status]) => [uid, cameBy(status) ? onlineNow.get(uid) === true : null])),
            held: heldAfter,
            // Already pushed, and staying pushed. Stated so the recompute
            // counts this session whatever the read raced with.
            pushedAt: (data.pushedAt as { toDate?: () => Date })?.toDate?.() ?? now,
          },
        ],
      ]);
      const plan = await readMirrorPlan(tx, db, {
        runId,
        groupId,
        sessions,
        // NOT `members`: the register's rows are the ACTIVE enrolments, and a
        // correction to a pushed register has to move the figures of everybody
        // whose rollup is read afterwards, withdrawn and completed included.
        members: mirrorMembers,
        overrides,
        now,
      });

      if (moved.length > 0 || heldAfter !== heldBefore || notesMoved) {
        const records: Record<string, AttendanceStatus | FieldValue> = {};
        const where: Record<string, boolean | FieldValue> = {};
        // Each corrected line says who corrected it and when; a line the
        // correction cleared loses its stamp.
        const stamps: Record<string, LineSetterStamp | FieldValue> = {};
        const setBefore = (data[SET_BY] ?? {}) as Record<string, unknown>;
        for (const [uid, status] of moved) {
          records[uid] = status === null ? FieldValue.delete() : status;
          if (cameBy(status)) where[uid] = onlineNow.get(uid) === true;
          else if (Object.hasOwn(onlineStored, uid)) where[uid] = FieldValue.delete();
          if (status !== null) stamps[uid] = { byUid: actor.uid, at: now, how: "correction" };
          else if (Object.hasOwn(setBefore, uid)) stamps[uid] = FieldValue.delete();
        }
        tx.set(
          ref,
          {
            records,
            ...(Object.keys(where).length > 0 ? { [ONLINE]: where } : {}),
            ...(Object.keys(stamps).length > 0 ? { [SET_BY]: stamps } : {}),
            ...(hasHeld ? { held: heldAfter } : {}),
            ...(notesMoved ? { notes } : {}),
            updatedAt: FieldValue.serverTimestamp(),
            // `markedByUid` is deliberately NOT moved to the admin: it records
            // who ran the session. Who corrected it afterwards is what the
            // audit rows are for.
          },
          { merge: true },
        );
      }

      for (const write of plan.writes) {
        tx.set(write.ref, { attendance: write.rollup }, { merge: true });
      }

      // ONE AUDIT ROW PER CHANGED MARK, with the before and the after in the
      // sentence. A single row saying "the register was edited" would answer
      // none of the questions the log exists for.
      for (const [uid, status] of moved) {
        const from = before.get(uid) ?? null;
        const wasOnline = onlineBefore.get(uid) === true;
        const isOnline = onlineNow.get(uid) === true;
        // A mark that only moved between the room and online says both
        // places; otherwise each mark says online where it was, and the room
        // goes without saying, as it did before the register kept it.
        const change =
          from === status
            ? `${markLabel(from, false)} ${wasOnline ? "online" : "in the room"} to ${markLabel(status, false)} ${isOnline ? "online" : "in the room"}`
            : `${markLabel(from, wasOnline)} to ${markLabel(status, isOnline)}`;
        tx.set(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
          kind: "attendance-edit",
          runId,
          groupId,
          subjectUid: uid,
          actorUid: actor.uid,
          actorName,
          targetLabel: `${session.sessionKey} register`,
          detail:
            `${memberName.get(uid) ?? uid}: ${change}, ` +
            `week ${session.weekNumber} session ${session.occurrence}.`,
          at: FieldValue.serverTimestamp(),
        });
        logged += 1;
      }
      if (heldAfter !== heldBefore) {
        tx.set(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
          kind: "attendance-edit",
          runId,
          groupId,
          subjectUid: null,
          actorUid: actor.uid,
          actorName,
          targetLabel: `${session.sessionKey} register`,
          detail: heldAfter
            ? `Week ${session.weekNumber} session ${session.occurrence} marked as held again, so it counts in everyone's attendance.`
            : `Week ${session.weekNumber} session ${session.occurrence} marked as not held, so it leaves everyone's attendance.`,
          at: FieldValue.serverTimestamp(),
        });
        logged += 1;
      }
      if (notesMoved) {
        // The note's TEXT is deliberately not copied into the audit row: it is
        // a facilitator's account of a session and can name people, and the
        // log is read by every admin. That it changed, and who changed it, is
        // the fact the log is for.
        tx.set(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
          kind: "attendance-edit",
          runId,
          groupId,
          subjectUid: null,
          actorUid: actor.uid,
          actorName,
          targetLabel: `${session.sessionKey} register`,
          detail: notes
            ? `Session note on week ${session.weekNumber} session ${session.occurrence} rewritten after the push.`
            : `Session note on week ${session.weekNumber} session ${session.occurrence} cleared after the push.`,
          at: FieldValue.serverTimestamp(),
        });
        logged += 1;
      }
    });
  } catch (err) {
    if (err instanceof RegisterMissingError) {
      return NextResponse.json(
        { error: "There's no register for that session yet." },
        { status: 404 },
      );
    }
    if (err instanceof RegisterUnpushedError) {
      return NextResponse.json(
        {
          error:
            "That register hasn't been pushed yet, so it is still the facilitator's to mark.",
        },
        { status: 409 },
      );
    }
    if (err instanceof RegisterFullError) {
      return NextResponse.json(
        {
          error: `This register is full (maximum ${ATTENDANCE_LIMITS.maxRecords} people).`,
        },
        { status: 409 },
      );
    }
    throw err;
  }

  const result: AttendanceEditResult = {
    ok: true,
    sessionKey: session.sessionKey,
    weekNumber: session.weekNumber,
    occurrence: session.occurrence,
    marked: changed,
    held,
    logged,
  };
  return NextResponse.json(result);
}
