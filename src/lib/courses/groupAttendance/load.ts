import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  facilitatorsOf,
  listGroups,
  readRunRecords,
  type GridCellState,
  type GridPerson,
} from "@/lib/courses/programmeAttendance";
import { gateGroupRegister, readsFacilitatorRecord } from "@/lib/courses/registerAccess";
import { resolveSessions } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import {
  type AttendanceStatus,
  type CourseAttendanceDoc,
  type FacilitatorPresenceState,
} from "@/lib/firestore/courseAttendance";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";

/**
 * A GROUP'S ATTENDANCE ACROSS EVERY WEEK, for the Attendance tab of the
 * group's page: the people by the weeks, each cell as facts a page can put
 * into words, the two counts per person, each column's facts, and, only for
 * the people the facilitator record is sent to, whether each facilitator was
 * there.
 *
 * ONE ARITHMETIC. Everything is read and worked out by the programme's
 * Attendance tab's own functions (`readRunRecords`, `listGroups`), so this
 * tab, that grid, its CSV and the Overview agree about every cell and count.
 * This adds only what a group's page says that the grid does not: which
 * lines were corrected, who finished each register and when, who took it in
 * whose place, and the facilitators apart.
 *
 * WHO, through the register's own gate (`gateGroupRegister`): the group's
 * facilitators, the people leading the programme and admins. Somebody given
 * one session, and anybody else, is answered `none`. An archived group is
 * no group here: the programme's attendance reads only the groups that
 * still meet, so it is `none` for everybody.
 *  - A FACILITATOR WHO HOLDS A PLACE in their own group is not among the
 *    people, for every reader. For admins and the people leading the
 *    programme they are listed apart, with the facilitators, their own
 *    place's cells beside them.
 *  - WHETHER EACH FACILITATOR WAS THERE goes only to admins and the
 *    programme's lead who do not facilitate the group
 *    (`readsFacilitatorRecord`, the register's one rule, as the privacy
 *    policy says: "The programme's lead and admins see this"). A run's track
 *    lead by that alone is sent the facilitators apart without it; a
 *    facilitator is sent neither.
 *
 * NAMES ONLY, by the names rule for the reader: never an address, never a
 * note.
 */

/** One cell: a person's line on one week's register, as facts. */
export type AttendanceCell = {
  weekNumber: number;
  /**
   * The grid's own state: `mark` (see `mark`), `not-yet` (no mark: still to
   * come, or nobody marked them), `today`, `not-held` (it didn't happen),
   * `before` (before they joined), `after` (after they left), `none` (no
   * session that week).
   */
  state: GridCellState;
  mark: AttendanceStatus | null;
  /** Beside a mark that says they came: joined online. False in the room, or with no such mark. */
  online: boolean;
  /** The mark is on a register saved and not finished. */
  saved: boolean;
  /** The line was corrected after the register was finished. */
  corrected: boolean;
  /** The line is still the person's own word in advance that they could not make it. */
  saidInAdvance: boolean;
};

/** One week's column: its session and its register. */
export type AttendanceColumn = {
  weekNumber: number;
  sessionKey: string;
  /** The session's date, "" with none. */
  dateKey: string;
  /** False: it didn't happen (called off, or its register says so). */
  held: boolean;
  /** Its start has passed. */
  started: boolean;
  /** Its end has passed. */
  ended: boolean;
  /** Somebody took its register (marked it, finished it, or said it didn't happen). */
  taken: boolean;
  /** Who finished its register, and when; null while it is not finished. */
  finished: { name: string; at: string } | null;
  /** Who took it in a facilitator's place, and whose. */
  cover: { kind: "self" | "given"; name: string; covering: string[] } | null;
  /** How many of its lines were corrected after it was finished. */
  corrected: number;
};

/** A person's row: their cells, and how many sessions they came to in the room and online. */
export type AttendancePersonRow = {
  uid: string;
  name: string;
  /** "Left Fri 13 Nov", "Left", or null for somebody taking part. */
  left: string | null;
  cells: AttendanceCell[];
  room: number;
  online: number;
};

/** One facilitator, listed apart: whether they were there (for the people sent it), and their own place's row when they hold one. */
export type AttendanceFacilitatorRow = {
  uid: string;
  name: string;
  /** By week, for admins and the programme's lead only; absent for anybody else. */
  presence?: { weekNumber: number; state: FacilitatorPresenceState | null; arrivedAt: string | null }[];
  /** Their own place in the group, when they hold one. */
  place: Omit<AttendancePersonRow, "uid" | "name"> | null;
};

export type GroupAttendanceView = {
  groupId: string;
  groupName: string;
  viewer: "admin" | "lead" | "facilitator";
  columns: AttendanceColumn[];
  people: AttendancePersonRow[];
  /** The group's facilitators apart, for admins and the people leading the programme; null for a facilitator. */
  facilitators: AttendanceFacilitatorRow[] | null;
  /** True when somebody placed in the group is left out because Publish has not told them. Never for an admin. */
  notYetTold: boolean;
};

export type LoadedAttendance = { status: "ok"; view: GroupAttendanceView } | { status: "none" };

/** A row's cells as facts, beside the registers they came from. */
function cellsOf(row: GridPerson, registers: ReadonlyMap<number, CourseAttendanceDoc | null>): AttendanceCell[] {
  return row.cells.map((cell) => {
    const register = registers.get(cell.weekNumber) ?? null;
    return {
      weekNumber: cell.weekNumber,
      state: cell.state,
      mark: cell.mark,
      online: cell.online === true,
      saved: cell.saved,
      corrected: cell.state === "mark" && Boolean(register?.corrected[row.uid]),
      saidInAdvance: cell.mark === "excused" && Boolean(register?.excusedInAdvance[row.uid]),
    };
  });
}

export async function loadGroupAttendance(
  db: Firestore,
  actor: SessionUser,
  groupId: string,
  now: Date,
): Promise<LoadedAttendance> {
  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return { status: "none" };
  if (!gated.isAdmin && !gated.facilitates && !gated.leads) return { status: "none" };
  const records = await readRunRecords(db, gated.runId);
  if (!records) return { status: "none" };
  const group = records.groups.find((each) => each.id === groupId);
  if (!group) return { status: "none" };

  const viewer = { isAdmin: gated.isAdmin, role: actor.role };
  const staff = gated.isAdmin || gated.leads;
  const record = readsFacilitatorRecord(gated);
  // The group's own taught weeks, in its plan's order.
  const weeks = [...new Set(resolveSessions(records.run, group).map((session) => session.weekNumber))].sort((a, b) => a - b);
  const listed = listGroups(records, viewer, now, weeks).find((entry) => entry.group.id === groupId);
  if (!listed) return { status: "none" };

  const registerByWeek = new Map<number, CourseAttendanceDoc | null>();
  for (const [weekNumber, facts] of listed.sessions) registerByWeek.set(weekNumber, facts.register);

  // Everybody a column names who is not one of the run's people: who finished it, who covered it.
  const extra = new Set<string>();
  for (const facts of listed.sessions.values()) {
    const register = facts.register;
    if (!register) continue;
    if (register.pushedByUid) extra.add(register.pushedByUid);
    if (register.cover) {
      extra.add(register.cover.byUid);
      for (const uid of register.cover.covering) extra.add(uid);
    }
  }
  const wanted = [...extra].filter((uid) => uid && !uid.includes("/") && !records.accounts.has(uid));
  const more = wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : [];
  const accounts = new Map(records.accounts);
  for (const snap of more) if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  const nameOf = (uid: string) => nameForViewer(viewer, accountNamesOf(accounts.get(uid) ?? {}), "NAISI member");

  const columns: AttendanceColumn[] = weeks.map((weekNumber) => {
    const facts = listed.sessions.get(weekNumber);
    const register = facts?.register ?? null;
    return {
      weekNumber,
      sessionKey: facts?.session.sessionKey ?? "",
      dateKey: facts?.session.dateKey ?? "",
      held: facts?.held ?? true,
      started: facts?.started ?? false,
      ended: facts?.ended ?? false,
      // Taken as `registerIsTaken` says it: finished, marked, or saying it did
      // not happen (not held, and not because the session was called off).
      taken: Boolean(register?.pushedAt) || Boolean(register?.markedByUid) || Boolean(register && facts && !facts.held && !facts.session.cancelled),
      finished: register?.pushedAt ? { name: register.pushedByUid ? nameOf(register.pushedByUid) : "", at: register.pushedAt.toISOString() } : null,
      cover: register?.cover
        ? { kind: register.cover.kind, name: nameOf(register.cover.byUid), covering: register.cover.covering.map(nameOf) }
        : null,
      corrected: register ? Object.keys(register.corrected).length : 0,
    };
  });

  const facilitatorUids = new Set(group.facilitatorUids);
  const rowOf = (row: GridPerson): AttendancePersonRow => ({
    uid: row.uid,
    name: row.name,
    left: row.left,
    cells: cellsOf(row, registerByWeek),
    room: Math.max(0, row.came - row.online),
    online: row.online,
  });
  const people = listed.people.filter(({ row }) => !facilitatorUids.has(row.uid)).map(({ row }) => rowOf(row));

  let facilitators: AttendanceFacilitatorRow[] | null = null;
  if (staff) {
    const places = new Map(listed.people.filter(({ row }) => facilitatorUids.has(row.uid)).map(({ row }) => [row.uid, rowOf(row)]));
    facilitators = facilitatorsOf(records, group, viewer).map((facilitator) => {
      const place = places.get(facilitator.uid) ?? null;
      const out: AttendanceFacilitatorRow = {
        uid: facilitator.uid,
        name: facilitator.name,
        place: place ? { left: place.left, cells: place.cells, room: place.room, online: place.online } : null,
      };
      if (record) {
        out.presence = weeks.map((weekNumber) => {
          const entry = registerByWeek.get(weekNumber)?.facilitatorRecord[facilitator.uid] ?? null;
          return {
            weekNumber,
            state: entry?.state ?? null,
            arrivedAt: entry?.arrivedAt ? entry.arrivedAt.toISOString() : null,
          };
        });
      }
      return out;
    });
  }

  return {
    status: "ok",
    view: {
      groupId,
      groupName: group.name,
      viewer: gated.isAdmin ? "admin" : gated.facilitates ? "facilitator" : "lead",
      columns,
      people,
      facilitators,
      notYetTold: listed.notYetTold,
    },
  };
}
