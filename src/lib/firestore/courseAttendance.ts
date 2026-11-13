import { sessionKey } from "./courses";

/**
 * `courseAttendance/{runId}__{groupId}__wNN` — one register per (group,
 * week). ALL access is server-routed (`read/write: if false` in rules): the
 * records map is keyed by member uid, which is roster information the
 * PII-free facilitator surface serves with names attached via the roster
 * route, never by client reads.
 *
 * One doc per register (not one per member-week) keeps marking a whole
 * session a single write, and the deterministic id makes re-marking an
 * upsert of the same doc — no duplicate registers, no query to find one.
 * Account deletion removes a member by MAP-KEY deletion (FieldPath), not doc
 * deletion, since the register is shared.
 */

/*
 * THE OCCURRENCE DIMENSION, AND WHAT IT COST TO ADD.
 *
 * A register belongs to one SESSION, not to one week: a group that meets
 * twice in a week holds two, and each needs its own marks, its own held
 * switch and its own push. `occurrence` is which of the week's sessions this
 * one is, and `src/lib/courses/sessions.ts` is what resolves them.
 *
 * IDS ARE BYTE-IDENTICAL FOR OCCURRENCE 1. `attendanceDocId` now builds its
 * suffix from `sessionKey(weekNumber, occurrence)`, and `sessionKey(n, 1)` is
 * `weekDocId(n)` exactly, so every register already written keeps its id,
 * nothing migrates, and account deletion's `documentId()` scan keeps working
 * unchanged. Occurrence 2 and up get a `-2` suffix, an id no week has ever
 * produced. That invariant is pinned by a test rather than left to care.
 *
 * WHAT IS STILL BLOCKED, and it is the other half of the same decision:
 * `courseGroups.extraSession` (the second slot itself) is not written by
 * `normalizeCourseGroup` yet, because the pre-course cadence is an owner
 * decision and the field is birth-pinned in rules. `sessionOverrides` and
 * `sessionModes` are likewise still keyed by week id with no occurrence
 * component, so a per-week room move or virtual switch reaches the week's
 * FIRST session only. Until those land every group resolves exactly one
 * session per taught week and every register is an occurrence-1 register. The
 * resolver, the ids, the register and the push are ready for the second one;
 * the data field is what is owed.
 *
 * THIS FILE IMPORTS NOTHING FROM `src/lib/courses`. It is pulled into three
 * client components (the grid, its hook, the note drawer), so a single import
 * of the session RESOLVER would drag the schedule graph (`groupResolve`, the
 * calendar, the week plan) into their bundles for one line of string maths.
 * `sessionKey` therefore lives beside `weekDocId` in `./courses`, and a test
 * pins that this module never reaches for `lib/courses/sessions.ts`.
 */

/**
 * The five states a facilitator can mark. `left-early` is the V3 addition:
 * the completion bar is "attend N sessions IN FULL", and without it somebody
 * who came for ten minutes is recorded identically to somebody who stayed.
 * Ordered attended-most to attended-least, which is the order the register
 * grid cycles through and the order the rollup counts them in.
 */
export type AttendanceStatus =
  | "present"
  | "late"
  | "left-early"
  | "absent"
  | "excused";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "late",
  "left-early",
  "absent",
  "excused",
];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  "left-early": "Left early",
  absent: "Absent",
  excused: "Excused",
};

export const ATTENDANCE_LIMITS = {
  /**
   * Cap on uids per register. A group is never anywhere near this big, and
   * `courseGroups.MAX_OPEN_MODE_CAPACITY` is pinned to this number because
   * the marking route fails the WHOLE post once a merged map passes it.
   */
  maxRecords: 40,
  notes: 1000,
  /** Per-participant note length. See `participantNotes`. */
  participantNote: 1000,
} as const;

export type CourseAttendanceDoc = {
  /** Firestore doc id: `attendanceDocId(runId, groupId, weekNumber)`. */
  id: string;
  runId: string;
  groupId: string;
  weekNumber: number;
  /**
   * Which of the week's sessions this register is for, 1-based. Defaults to
   * 1, so every register written before the field existed reads correctly.
   * See the module header for why the doc id does not change for 1.
   */
  occurrence: number;
  /** `sessionKey(weekNumber, occurrence)`: the id's own suffix, as a field. */
  sessionKey: string;
  /** Per-member status, keyed by uid. Max 40 entries. */
  records: Record<string, AttendanceStatus>;
  /**
   * Whether the session actually took place. Defaults TRUE, so every register
   * written before this field existed keeps counting.
   *
   * This is not decoration. Without it a cancelled session and an unmarked
   * one are the same empty column, so every ratio built on the registers
   * (the "4 of 6 in full" bar, the unmarked-register follow-up job) is
   * silently wrong in the one case where being wrong matters most: a week
   * nobody could have attended. `held: false` removes the week from the
   * denominator instead of pretending everyone was absent.
   */
  held: boolean;
  /**
   * When the session actually happened — resolved from the group's slot (or
   * that week's override) at marking time. Absent when never resolved.
   */
  sessionAt?: Date;
  /**
   * When the facilitator pressed PUSH ATTENDANCE, and who pressed it. Null /
   * empty while the register is still a DRAFT the facilitator is saving as
   * often as they like during the session.
   *
   * The push is the state change everything downstream hangs off: it locks
   * the register to admin-only edits, recomputes the enrolment rollups, and
   * sends the next-week material reminder. A learner sees their own mark only
   * once this is stamped.
   */
  pushedAt: Date | null;
  pushedByUid: string;
  /** Facilitator note on the session as a whole (plain text). */
  notes?: string;
  /**
   * Post-session notes ABOUT INDIVIDUAL PARTICIPANTS, keyed by uid. Private
   * to reviewers and admins, and never shown to the participant or the
   * cohort.
   *
   * PERSONAL DATA ABOUT A NAMED STUDENT, WRITTEN BY ANOTHER STUDENT. That is
   * why the whole collection stays `read: if false` and why account deletion
   * has to clear this map key by key with a `FieldPath` delete, exactly as it
   * already does for `records`. Deleting the doc would erase the group's
   * marks for that session.
   */
  participantNotes: Record<string, string>;
  /**
   * THE PEOPLE WHO TOLD US IN ADVANCE THAT THEY CAN'T MAKE THIS SESSION,
   * keyed by uid, with when they said so ("Can't make it" on their
   * programme page, the sessions they ticked under "Most weeks, not all",
   * or the sessions staff recorded from their own words under "They meant
   * some weeks"; one write for all three, `writeExcusedInAdvance` in
   * `src/lib/courses/cantMakeIt/seat.ts`). Each one's mark in `records` is
   * `excused`, set by the same write, before the session started. An admin
   * or the programme's lead who marks the person afterwards takes the line
   * over: the marking route deletes their entry with the mark it came with.
   * Anybody else may only record that the person came after all, and their
   * entry is KEPT, so putting the line back to excused restores it as it was;
   * every reader asks for the mark to be excused as well, so a kept entry
   * beside another mark says nothing. The register shows it to the group's
   * facilitators, the lead and admins, and nobody else reads it.
   *
   * Keyed by uid, so account deletion clears it key by key with a
   * `FieldPath`, as it does `records` and `participantNotes`.
   */
  excusedInAdvance: Record<string, Date>;
  /**
   * THE PEOPLE WHO SAID THEY ARE JOINING THIS SESSION ONLINE, keyed by uid,
   * with when they said so ("Joining online" on their programme page,
   * `src/lib/courses/joiningOnline/`). Their own word, given before the
   * session starts, and never a mark: `records` is untouched by it. The
   * facilitators' box asks for a meeting link from it, and the register
   * prefills `online` from it when the person is marked as having come.
   *
   * Keyed by uid, so account deletion clears it key by key with a
   * `FieldPath`, as it does `records`.
   */
  onlineSaid: Record<string, Date>;
  /**
   * WHEN THE GROUP'S FACILITATORS WERE EMAILED THAT EACH PERSON IS JOINING
   * THIS SESSION ONLINE, keyed by the uid of the person it is about. Written
   * only by the "Joining online" press (`src/lib/courses/joiningOnline/seat.ts`),
   * in the transaction that writes their word, the first time they say it
   * for this session; never taken away by taking the word back, so saying it,
   * taking it back and saying it again emails nobody a second time. Server
   * only: no route or page sends it to a browser. A register written before
   * this map existed has none, and reads as today.
   *
   * Keyed by uid, so account deletion clears it key by key with a
   * `FieldPath`, as it does `onlineSaid`.
   */
  onlineEmailed: Record<string, Date>;
  /**
   * WHERE EACH PERSON WHO CAME WAS: `true` joined online, `false` in the
   * room, keyed by uid. Only somebody marked present, late or left early
   * carries an entry; any other mark, or clearing one, deletes it. A
   * register written before this map existed has none, and everybody on it
   * reads as in the room (`joinedOnline`). The five statuses never change
   * because of it.
   *
   * Keyed by uid, so account deletion clears it key by key with a
   * `FieldPath`, as it does `records`.
   */
  online: Record<string, boolean>;
  markedByUid: string;
  updatedAt?: Date | null;
  /**
   * WHO SET EACH LINE, AND WHEN, keyed by the uid of the person the line is
   * about. Written only by routes, in the same write that moved the line's
   * mark or its in-the-room-or-online value (or, for somebody's own word in
   * advance, the word itself). A line a save did not change keeps its stamp.
   * A register written before this map existed has none, and shows nobody as
   * having set anything: that is today's reading, not a gap to fill.
   *
   * Keyed by uid, so account deletion clears the person's own entry key by
   * key with a `FieldPath`, as it does `records`. The `byUid` inside an entry
   * names who acted, and is kept as `markedByUid` and `pushedByUid` are.
   */
  setBy: Record<string, LineSetter>;
  /**
   * WHO TOOK THIS REGISTER IN A FACILITATOR'S PLACE, or null when nobody did
   * (every register written before the field, and every register a
   * facilitator of the group took). A register may exist only to hold it,
   * before any line is set: that register is NOT taken (`registerIsTaken`).
   */
  cover: RegisterCover | null;
  /**
   * WHETHER EACH OF THE GROUP'S FACILITATORS WAS AT THE SESSION, keyed by the
   * facilitator's uid. Written only by routes. Sent only to admins and the
   * people leading the programme (the programme's lead and the run's track
   * leads), never to a facilitator, a person covering or a member. A register
   * written before the map existed has none and shows none.
   *
   * Keyed by uid, so account deletion clears the facilitator's own entry key
   * by key, as it does `records`.
   */
  facilitatorRecord: Record<string, FacilitatorPresence>;
  /**
   * WHICH LINES WERE CORRECTED AFTER THE REGISTER WAS FINISHED, keyed by the
   * uid of the person the line is about: when, and by whom. Written only by
   * the correction routes (a line, a whole column, an approved request), in
   * the same write that changed the line. What the line said before, who set
   * it and why it changed live in the group's history (`courseAudit`), never
   * here: this map is only what lets the person's own list say "Corrected on
   * Tue 10 Nov" without reading the history. A register written before the
   * map existed has none, and no line on it reads as corrected.
   *
   * Keyed by uid, so account deletion clears the person's own entry key by
   * key, as it does `records`. The `byUid` inside names who acted, and is
   * kept as `pushedByUid` is.
   */
  corrected: Record<string, LineCorrection>;
  /**
   * AN EXCUSAL STOOD ON THIS LINE, keyed by the uid of the person the line
   * is about: the stamp of the excused line (who set it, when, how) that was
   * displaced when somebody who is not an admin or the programme's lead
   * changed it to present, late or left early, or `true` when that line had
   * no stamp (and on a register written while the map held only `true`).
   * Later taps by them can then only move the line between those and back to
   * excused (`src/lib/courses/excused/marking.ts`), and putting it back, or
   * a session that did not happen, restores the stamp. Read only beside a
   * mark that says the person came. Cleared when the line goes back to
   * excused, and by any write or correction of the line by an admin or the
   * lead. Never sent to anybody. A register written before the map existed
   * has none, and reads as today.
   *
   * Keyed by uid, so account deletion clears it key by key, as it does
   * `records`. The `byUid` inside a stamp names who acted, and is kept as
   * `setBy`'s is.
   */
  excusalKept: Record<string, ExcusalKept>;
};

/** What the register keeps of an excusal that stood: the stamp it displaced, or `true` with none. */
export type ExcusalKept = LineSetter | true;

/** One corrected line's stamp: when, and who corrected it. */
export type LineCorrection = { at: Date; byUid: string };

/**
 * HOW A LINE CAME TO SAY WHAT IT SAYS.
 *
 *  - `facilitator`: one of the group's facilitators set it.
 *  - `cover`: somebody who is not one of the group's facilitators set it: an
 *    admin, the programme's lead, a track lead, or somebody given the session.
 *  - `self`: the person's own word before the session ("Can't make it",
 *    "Joining online", the sessions ticked under "Most weeks, not all").
 *  - `approval`, `correction`: reserved for the requests and corrections that
 *    come after this, and `correction` for an admin's change to a finished
 *    register.
 */
export type LineSetterHow = "facilitator" | "cover" | "self" | "approval" | "correction";

export const LINE_SETTER_HOWS: readonly LineSetterHow[] = ["facilitator", "cover", "self", "approval", "correction"];

/** One line's stamp: who, when, and how. */
export type LineSetter = { byUid: string; at: Date; how: LineSetterHow };

/**
 * WHO TOOK A REGISTER IN SOMEBODY'S PLACE.
 *
 *  - `self`: an admin or somebody leading the programme took it themselves
 *    ("I'm covering it", or the first line they saved).
 *  - `given`: an admin or a lead gave this one session to `byUid`, until
 *    `until`. While that holds, and for this session only, they take its
 *    register, open its check-in and write its report.
 *
 * `covering` is the group's facilitators with standing when it was taken,
 * the people whose place was taken; it may be empty (a group with no
 * facilitator).
 */
export type RegisterCover = {
  kind: "self" | "given";
  byUid: string;
  at: Date;
  covering: string[];
  grantedByUid?: string;
  grantedAt?: Date;
  until?: Date;
  reason?: string;
};

/** Whether one facilitator was there. */
export type FacilitatorPresenceState = "there" | "late" | "not-there";

export const FACILITATOR_PRESENCE_STATES: readonly FacilitatorPresenceState[] = ["there", "late", "not-there"];

/**
 * How an entry of the facilitator record was made: a cover taken in their
 * place, their first save after it, the register being finished, or changed
 * by an admin or a lead.
 */
export type FacilitatorPresenceHow = "cover" | "arrived" | "finish" | "changed";

export const FACILITATOR_PRESENCE_HOWS: readonly FacilitatorPresenceHow[] = ["cover", "arrived", "finish", "changed"];

export type FacilitatorPresence = {
  state: FacilitatorPresenceState;
  /** When they arrived, for `late`. */
  arrivedAt?: Date;
  byUid: string;
  at: Date;
  how: FacilitatorPresenceHow;
};

/** The register's map of who set each line. One name for the writes, readers and account deletion. */
export const SET_BY = "setBy";

/** The register's cover. */
export const COVER = "cover";

/** The register's record of whether each facilitator was there. */
export const FACILITATOR_RECORD = "facilitatorRecord";

/** The register's map of which lines were corrected after it was finished. */
export const CORRECTED = "corrected";

/**
 * The register's map of who told us in advance they can't make the session.
 * One name for the field, for the write, the readers and account deletion.
 */
export const EXCUSED_IN_ADVANCE = "excusedInAdvance";

/**
 * The register's map of the lines on which an excusal stood when somebody
 * who does not mark excused recorded that the person came. One name for the
 * field, for the write, the readers and account deletion.
 */
export const EXCUSAL_KEPT = "excusalKept";

/**
 * The register's map of who said they are joining the session online. One
 * name for the field, for the write, the readers and account deletion.
 */
export const ONLINE_SAID = "onlineSaid";

/**
 * The register's map of when the group's facilitators were emailed that
 * somebody is joining the session online. One name for the field, for the
 * write, the reader and account deletion.
 */
export const ONLINE_EMAILED = "onlineEmailed";

/**
 * The register's map of where each person who came was, online or in the
 * room. One name for the field, for the writes, the readers and account
 * deletion.
 */
export const ONLINE = "online";

/** The marks that say somebody came: present, late and left early. */
export const CAME_STATUSES: readonly AttendanceStatus[] = ["present", "late", "left-early"];

/** Whether a mark says somebody came (present, late or left early). */
export function cameBy(status: AttendanceStatus | null | undefined): boolean {
  return status === "present" || status === "late" || status === "left-early";
}

/**
 * WHETHER ONE PERSON JOINED ONE SESSION ONLINE, as the register records it:
 * marked as having come, and recorded online. Everything else is in the
 * room, including every register written before the map existed. The one
 * reading every figure asks, so an entry left beside a mark that is not a
 * coming one can never count.
 */
export function joinedOnline(
  register: Pick<CourseAttendanceDoc, "records" | "online">,
  uid: string,
): boolean {
  return cameBy(register.records[uid]) && register.online[uid] === true;
}

/**
 * HAS THIS SESSION'S REGISTER BEEN TAKEN? Asked of the register as STORED
 * (`undefined` when the session has none yet), by everything that has to
 * know whether a session met before it moves it: changing one week's session,
 * a new regular time from a week onwards, and the script that pins weeks
 * that met.
 *
 * Taken means the document exists AND somebody took it: it is finished
 * (`pushedAt`), a facilitator or an admin has marked it (`markedByUid`, the
 * last person to save a mark), or it says the session did not happen
 * (`held === false`). A register that exists only because somebody said in
 * advance they can't make it, or are joining online, is NOT taken: those
 * writes touch only their own line and never the register's own fields.
 * Nor is a register that holds only a cover ("I'm covering it", or a session
 * given to somebody) with no line set: covering it says who will take it,
 * not that anybody has.
 */
export function registerIsTaken(data: Readonly<Record<string, unknown>> | null | undefined): boolean {
  if (!data) return false;
  if (data.pushedAt !== undefined && data.pushedAt !== null) return true;
  if (typeof data.markedByUid === "string" && data.markedByUid !== "") return true;
  return data.held === false;
}

/**
 * Deterministic doc id: one register per (run, group, SESSION), structurally
 * (see module comment). The suffix is `sessionKey`, which sorts in week order
 * in the console and is BYTE-IDENTICAL to the old `weekDocId` suffix for
 * occurrence 1. CONSTRUCT-ONLY: the parts are stored as fields; never parse
 * the id (`slugId`-made ids already contain `__`).
 */
export function attendanceDocId(
  runId: string,
  groupId: string,
  weekNumber: number,
  occurrence: number = 1,
): string {
  return `${runId}__${groupId}__${sessionKey(weekNumber, occurrence)}`;
}

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asRecords(v: unknown): Record<string, AttendanceStatus> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, AttendanceStatus> = {};
  let count = 0;
  for (const [uid, status] of Object.entries(v as Record<string, unknown>)) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    if (!ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) continue;
    out[uid] = status as AttendanceStatus;
    count += 1;
  }
  return out;
}

/**
 * Participant notes, capped both in number of keys and in length. Same
 * bounded, deterministic shape as `asRecords` above it, and for the same
 * reason: a hand-edited register must degrade to a smaller register, never to
 * an unbounded payload on a staff surface.
 */
function asParticipantNotes(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  let count = 0;
  for (const uid of Object.keys(v as Record<string, unknown>).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const note = (v as Record<string, unknown>)[uid];
    if (!uid || typeof note !== "string" || !note) continue;
    out[uid] = note.slice(0, ATTENDANCE_LIMITS.participantNote);
    count += 1;
  }
  return out;
}

/**
 * A map of uid to when they said something (who told us in advance they
 * can't make it, who said they are joining online), capped in number of keys
 * as `asRecords` is: a stamp that is not a time is no entry.
 */
function asStamps(v: unknown): Record<string, Date> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, Date> = {};
  let count = 0;
  for (const uid of Object.keys(v as Record<string, unknown>).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const at = tsToDate((v as Record<string, unknown>)[uid]);
    if (!uid || !at) continue;
    out[uid] = at;
    count += 1;
  }
  return out;
}

/**
 * Where each person who came was, capped in number of keys as `asRecords`
 * is: a value that is not `true` or `false` is no entry, so a garbled one
 * reads as in the room.
 */
function asOnline(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, boolean> = {};
  let count = 0;
  for (const uid of Object.keys(v as Record<string, unknown>).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const value = (v as Record<string, unknown>)[uid];
    if (!uid || typeof value !== "boolean") continue;
    out[uid] = value;
    count += 1;
  }
  return out;
}

/** The lines an excusal stood on: only a `true` counts, so anything else stored reads as none. */
function asKept(v: unknown): Record<string, ExcusalKept> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, ExcusalKept> = {};
  let count = 0;
  for (const uid of Object.keys(v as Record<string, unknown>).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const value = (v as Record<string, unknown>)[uid];
    if (!uid) continue;
    if (value === true) {
      out[uid] = true;
    } else {
      // A stamp read as `setBy` reads one: one it would not keep is no entry.
      const stamp = asSetBy({ [uid]: value })[uid];
      if (!stamp) continue;
      out[uid] = stamp;
    }
    count += 1;
  }
  return out;
}

/** A uid as a map key or a field holds it: a non-empty string that names one document. */
function isUid(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 && !v.includes("/");
}

/**
 * Who set each line, capped in number of keys as `asRecords` is. An entry
 * with no actor, no time or a `how` this build does not know is no entry,
 * so a hand-edited one shows nobody rather than somebody wrong.
 */
function asSetBy(v: unknown): Record<string, LineSetter> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, LineSetter> = {};
  let count = 0;
  for (const uid of Object.keys(v as Raw).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const entry = (v as Raw)[uid] as Raw | null;
    if (!uid || !entry || typeof entry !== "object") continue;
    const at = tsToDate(entry.at);
    const how = entry.how;
    if (!isUid(entry.byUid) || !at || !LINE_SETTER_HOWS.includes(how as LineSetterHow)) continue;
    out[uid] = { byUid: entry.byUid, at, how: how as LineSetterHow };
    count += 1;
  }
  return out;
}

/** Most facilitators a cover names: a group's own cap. */
const MAX_COVERING = 5;

/**
 * The cover, or null. Null too for one missing what makes it a cover (its
 * kind, who took it, when), so a hand-edited register reads as one nobody
 * covered rather than one covered by nobody.
 */
function asCover(v: unknown): RegisterCover | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const raw = v as Raw;
  const kind = raw.kind;
  const at = tsToDate(raw.at);
  if ((kind !== "self" && kind !== "given") || !isUid(raw.byUid) || !at) return null;
  const covering = Array.isArray(raw.covering)
    ? [...new Set(raw.covering.filter(isUid))].slice(0, MAX_COVERING)
    : [];
  const cover: RegisterCover = { kind, byUid: raw.byUid, at, covering };
  if (isUid(raw.grantedByUid)) cover.grantedByUid = raw.grantedByUid;
  const grantedAt = tsToDate(raw.grantedAt);
  if (grantedAt) cover.grantedAt = grantedAt;
  const until = tsToDate(raw.until);
  if (until) cover.until = until;
  if (typeof raw.reason === "string" && raw.reason.trim()) cover.reason = raw.reason.trim().slice(0, 200);
  return cover;
}

/** The facilitator record, capped as the facilitators a group may have; a garbled entry is no entry. */
function asFacilitatorRecord(v: unknown): Record<string, FacilitatorPresence> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, FacilitatorPresence> = {};
  let count = 0;
  for (const uid of Object.keys(v as Raw).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const entry = (v as Raw)[uid] as Raw | null;
    if (!isUid(uid) || !entry || typeof entry !== "object") continue;
    const at = tsToDate(entry.at);
    const state = entry.state;
    const how = entry.how;
    if (
      !FACILITATOR_PRESENCE_STATES.includes(state as FacilitatorPresenceState) ||
      !FACILITATOR_PRESENCE_HOWS.includes(how as FacilitatorPresenceHow) ||
      !isUid(entry.byUid) ||
      !at
    ) {
      continue;
    }
    const presence: FacilitatorPresence = {
      state: state as FacilitatorPresenceState,
      byUid: entry.byUid,
      at,
      how: how as FacilitatorPresenceHow,
    };
    const arrivedAt = tsToDate(entry.arrivedAt);
    if (arrivedAt && presence.state === "late") presence.arrivedAt = arrivedAt;
    out[uid] = presence;
    count += 1;
  }
  return out;
}

/**
 * Which lines were corrected, capped in number of keys as `asRecords` is. An
 * entry with no time or no actor is no entry, so a hand-edited one reads as
 * a line nobody corrected rather than one corrected by nobody.
 */
function asCorrected(v: unknown): Record<string, LineCorrection> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, LineCorrection> = {};
  let count = 0;
  for (const uid of Object.keys(v as Raw).sort()) {
    if (count >= ATTENDANCE_LIMITS.maxRecords) break;
    const entry = (v as Raw)[uid] as Raw | null;
    if (!isUid(uid) || !entry || typeof entry !== "object") continue;
    const at = tsToDate(entry.at);
    if (!at || !isUid(entry.byUid)) continue;
    out[uid] = { at, byUid: entry.byUid };
    count += 1;
  }
  return out;
}

export function normalizeCourseAttendance(id: string, data: Raw): CourseAttendanceDoc {
  const weekNumber =
    typeof data.weekNumber === "number" && Number.isFinite(data.weekNumber)
      ? Math.floor(data.weekNumber)
      : 0;
  // Absent means the FIRST session of the week, which is what every register
  // written before the field existed was. Anything below 1 is corrupt input
  // and clamps to 1 rather than minting a register id nothing can address.
  const occurrence =
    typeof data.occurrence === "number" && Number.isFinite(data.occurrence)
      ? Math.max(1, Math.floor(data.occurrence))
      : 1;
  const doc: CourseAttendanceDoc = {
    id,
    runId: str(data.runId),
    groupId: str(data.groupId),
    weekNumber,
    occurrence,
    // DERIVED, never read off the document: the key is a function of the two
    // fields above, and a stored value that disagreed with them would name a
    // different session from the one this register is.
    sessionKey: sessionKey(weekNumber, occurrence),
    records: asRecords(data.records),
    // Absent means HELD: every register written before this field existed
    // recorded a session that happened, and defaulting the other way would
    // retroactively cancel the whole of last term.
    held: data.held !== false,
    pushedAt: tsToDate(data.pushedAt),
    pushedByUid: str(data.pushedByUid),
    participantNotes: asParticipantNotes(data.participantNotes),
    excusedInAdvance: asStamps(data[EXCUSED_IN_ADVANCE]),
    // Read as the word in advance above is: a stamp that is not a time is
    // no entry.
    onlineSaid: asStamps(data[ONLINE_SAID]),
    // Absent on every register written before the facilitators were emailed
    // about it, and absent reads as today: nobody's word has emailed anybody.
    onlineEmailed: asStamps(data[ONLINE_EMAILED]),
    // Absent means everybody who came was in the room, which is what every
    // register written before the map existed recorded.
    online: asOnline(data[ONLINE]),
    markedByUid: str(data.markedByUid),
    updatedAt: tsToDate(data.updatedAt),
    // The three below are absent on every register written before them, and
    // absent reads as today: nobody shown as having set a line, nobody
    // covering, no record of the facilitators.
    setBy: asSetBy(data[SET_BY]),
    cover: asCover(data[COVER]),
    facilitatorRecord: asFacilitatorRecord(data[FACILITATOR_RECORD]),
    // Absent on every register written before corrections were stamped, and
    // absent reads as today: no line on it reads as corrected.
    corrected: asCorrected(data[CORRECTED]),
    // Absent on every register written before it, and absent reads as today:
    // no line carries an excusal that stood.
    excusalKept: asKept(data[EXCUSAL_KEPT]),
  };
  const sessionAt = tsToDate(data.sessionAt);
  if (sessionAt) doc.sessionAt = sessionAt;
  if (typeof data.notes === "string" && data.notes) {
    doc.notes = data.notes.slice(0, ATTENDANCE_LIMITS.notes);
  }
  return doc;
}
