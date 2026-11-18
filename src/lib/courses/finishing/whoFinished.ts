import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import {
  dayLabel,
  listGroups,
  weeksOf,
  type ListedGroup,
  type RunRecords,
} from "@/lib/courses/programmeAttendance";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { groupsOfWeeks, hasGroupsByWeek } from "@/lib/courses/groupsByWeek";
import { copyGroupIdFor } from "@/lib/courses/weekCopy";
import { attendanceDocId } from "@/lib/firestore/courseAttendance";
import { isOwnBoxResponse, normalizeExerciseResponse } from "@/lib/firestore/courseExercises";
import { normalizeGroupWeek } from "@/lib/firestore/courseGroups";
import { normalizeCourseWeek, type CourseWeekDoc } from "@/lib/firestore/courses";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { readFinishing, recordOf, runEndOf, type Finishing, type RunEnd } from "./record";
import { roomAndOnlineWords } from "@/lib/courses/joiningOnline/words";
import {
  NO_RULE_SENTENCE,
  cancelledNote,
  changedByLine,
  countsLine,
  leftLine,
  missedLine,
  notYetLine,
  ofLine,
  ruleSentence,
} from "./words";

/**
 * WHO FINISHED, AS THE PROGRAMME'S LEAD AND ADMINS ARE SHOWN IT:
 * a section of the programme's Overview once the run's last
 * session is over, and before then one line saying when it can be done.
 *
 * Everybody taking part, as the Attendance tab lists them for this viewer
 * (`listGroups`: a lead sees the people Publish has told, an admin everybody
 * placed, each by the name the names rule shows this viewer), fewest
 * sessions first, each with their group, how many sessions
 * they came to of the ones their group held, how many of the exercises set to
 * their group they answered, the weeks they were excused or missed, and
 * whether their record says they finished. Somebody who left is listed apart,
 * as having left, with no switch: never as not finished.
 *
 * Worded here on the server. The page draws it and sends the switches'
 * changes to the route.
 */

/** Rows drawn before "+N more". */
export const SHOWN_FIRST = 10;

/**
 * Who the section is drawn for: whether they are an admin (who is a row),
 * who they are ("Changed by you"), and their role, which decides the name
 * each person is shown by (`nameForViewer`). Left out, every name is the
 * name people go by.
 */
export type WhoFinishedViewer = { isAdmin: boolean; uid: string; role?: string | null };

export type WhoFinishedRow = {
  uid: string;
  name: string;
  groupName: string;
  /** "2 of 6": sessions they came to, of those their group held while they were in it. */
  came: string;
  /**
   * "1 in the room, 1 online": where the sessions they came to were, for
   * somebody who came to any of them online. Absent for everybody else, who
   * came to every one in the room.
   */
  cameWhere?: string;
  /** "2 of 6": exercises answered, of those set to their group; null when their group was set none. */
  exercises: string | null;
  /** "Excused in week 2. Missed weeks 4, 5 and 6.", or null. */
  line: string | null;
  finished: boolean;
  /** "Changed by you", "Changed by Zach", "Changed", or null where the suggestion stands. */
  changed: string | null;
};

export type WhoFinishedLeft = {
  uid: string;
  name: string;
  groupName: string;
  /** "Left Fri 13 Nov", or "Left". */
  left: string;
};

export type WhoFinishedModel =
  | {
      state: "not-yet";
      /** "You can say who finished once the last session is over, on Wed 9 Dec." */
      line: string;
      /** True while the run has no rule: the page offers the way to set one. */
      needsRule: boolean;
    }
  | {
      state: "open";
      /** The board's sentence with the rule in it, or the words for a run with no rule. */
      sentence: string;
      /** "28 finished · 3 not". */
      counts: string;
      finished: number;
      not: number;
      /** Fewest sessions first. */
      rows: WhoFinishedRow[];
      /** How many rows are drawn before "+N more". */
      shown: number;
      left: WhoFinishedLeft[];
      /** "Group B met 5 times. Its session on Tue 24 Nov was cancelled, …" */
      notes: string[];
    };

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

/** One person's exercises: answered, of those set to their group. */
export type ExerciseTally = { done: number; of: number };

/**
 * The exercises each live group was set: every exercise on the weeks its own
 * calendar teaches, read as its people read them (the group's own copy of a
 * week where it has one, the run's otherwise), and only weeks that are
 * published, since nobody can answer a week they cannot open. Then each
 * person's answers that were sent, from the responses the run already
 * records. Two reads for the run, and one for each group's own weeks.
 *
 * Somebody whose place records a move is counted week by week against the
 * copy they read that week (`copyGroupIdFor`: a week spent in another group
 * is that group's copy, whether or not it still meets), over the weeks the
 * group they are in now teaches; one more read for each group a record names
 * that no longer meets. Everybody else is counted against their group's set,
 * as always.
 */
export async function readExerciseTallies(
  db: Firestore,
  records: RunRecords,
): Promise<Map<string, ExerciseTally>> {
  const runId = records.run.id;
  const [canonicalSnap, responseSnap, ...forkSnaps] = await Promise.all([
    db.collection("courseRuns").doc(runId).collection("weeks").get(),
    db.collection("courseExerciseResponses").where("runId", "==", runId).get(),
    ...records.groups.map((group) => db.collection("courseGroups").doc(group.id).collection("weeks").get()),
  ]);
  const canonical = new Map<string, CourseWeekDoc>();
  for (const doc of canonicalSnap.docs) canonical.set(doc.id, normalizeCourseWeek(doc.id, doc.data() ?? {}));
  const forksOf = (docs: readonly QueryDocumentSnapshot[]) =>
    new Map<string, CourseWeekDoc>(docs.map((doc) => [doc.id, normalizeGroupWeek(doc.id, doc.data() ?? {})]));
  const forksByGroup = new Map<string, Map<string, CourseWeekDoc>>();
  records.groups.forEach((group, index) => forksByGroup.set(group.id, forksOf(forkSnaps[index]?.docs ?? [])));
  // A group a moved person's record names that no longer meets keeps its own copies too.
  const moved = records.enrolments.filter((enrolment) => enrolment.groupId && hasGroupsByWeek(enrolment));
  const named = [...new Set(moved.flatMap((enrolment) => groupsOfWeeks(enrolment)))].filter(
    (id) => !forksByGroup.has(id) && id !== "" && !id.includes("/"),
  );
  const namedSnaps = await Promise.all(named.map((id) => db.collection("courseGroups").doc(id).collection("weeks").get()));
  named.forEach((id, index) => forksByGroup.set(id, forksOf(namedSnaps[index]?.docs ?? [])));

  /** The answers a week asks, "weekId::exerciseId", from one group's copy (its own, else the run's), when published. */
  const keysOf = (groupId: string | null, weekId: string): string[] => {
    const week = (groupId ? forksByGroup.get(groupId)?.get(weekId) : undefined) ?? canonical.get(weekId);
    if (!week || !week.published) return [];
    // The week's written answers through the one reader: a block week's
    // Written answer blocks, or a week written before blocks' exercises.
    return weekWrittenAnswers(week).map((answer) => `${weekId}::${answer.id}`);
  };

  // Each group's set: "weekId::exerciseId".
  const setByGroup = new Map<string, Set<string>>();
  const sessionsByGroup = new Map<string, ReturnType<typeof resolveSessions>>();
  for (const group of records.groups) {
    const sessions = resolveSessions(records.run, group);
    sessionsByGroup.set(group.id, sessions);
    const taught = new Set(sessions.map((session) => session.weekId));
    setByGroup.set(group.id, new Set([...taught].flatMap((weekId) => keysOf(group.id, weekId))));
  }

  // Each person's set: their group's, or, for somebody whose place records a
  // move, each week the group now teaches from the copy they read that week.
  const setOf = new Map<string, Set<string>>();
  for (const enrolment of records.enrolments) {
    if (!enrolment.groupId) continue;
    const groupId = enrolment.groupId;
    const sessions = sessionsByGroup.get(groupId);
    if (!sessions || !hasGroupsByWeek(enrolment)) {
      setOf.set(enrolment.uid, setByGroup.get(groupId) ?? new Set());
      continue;
    }
    const weeks = new Map<string, number>();
    for (const session of sessions) if (!weeks.has(session.weekId)) weeks.set(session.weekId, session.weekNumber);
    setOf.set(
      enrolment.uid,
      new Set([...weeks].flatMap(([weekId, weekNumber]) => keysOf(copyGroupIdFor(enrolment, weekNumber, groupId), weekId))),
    );
  }

  const answered = new Map<string, Set<string>>();
  for (const doc of responseSnap.docs) {
    const response = normalizeExerciseResponse(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    // A reflection or a fill-in box is never sent and is not a written answer (courseExercises.ts).
    if (response.runId !== runId || !response.submittedAt || isOwnBoxResponse(response)) continue;
    const key = `${response.weekId}::${response.exerciseId}`;
    if (!setOf.get(response.uid)?.has(key)) continue;
    const mine = answered.get(response.uid) ?? new Set<string>();
    mine.add(key);
    answered.set(response.uid, mine);
  }

  const out = new Map<string, ExerciseTally>();
  for (const [uid, set] of setOf) {
    out.set(uid, { done: answered.get(uid)?.size ?? 0, of: set.size });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

/** The weeks a row was marked excused and absent, oldest first, from the grid's own cells. */
function excusedAndMissed(row: ListedGroup["people"][number]["row"]): { excused: number[]; missed: number[] } {
  const excused: number[] = [];
  const missed: number[] = [];
  for (const cell of row.cells) {
    if (cell.state !== "mark" || !cell.mark) continue;
    if (cell.mark === "excused") excused.push(cell.weekNumber);
    if (cell.mark === "absent") missed.push(cell.weekNumber);
  }
  return { excused, missed };
}

/**
 * Under the list: for each group a session of which did not happen (cancelled
 * through "Change a session", or a register that says it was not held), how
 * many times it met and the days it did not. Only sessions that have started.
 */
function cancelledNotes(records: RunRecords, now: Date): string[] {
  const notes: string[] = [];
  for (const group of records.groups) {
    let met = 0;
    const off: string[] = [];
    for (const session of resolveSessions(records.run, group)) {
      const { startsAt } = sessionInstants(session);
      if (!startsAt || startsAt.getTime() > now.getTime()) continue;
      const register = records.registers.get(
        attendanceDocId(records.run.id, group.id, session.weekNumber, session.occurrence),
      );
      if (session.cancelled || register?.held === false) off.push(dayLabel(session.dateKey));
      else met += 1;
    }
    if (off.length > 0) notes.push(cancelledNote(group.name, met, off));
  }
  return notes;
}

/** Whoever pressed a switch, by the name they go by, while their account stands. */
function deciderName(records: RunRecords, byUid: string | null, extra: Map<string, Record<string, unknown>>): string | null {
  if (!byUid) return null;
  const data = records.accounts.get(byUid) ?? extra.get(byUid);
  return data ? firstNameOfUser(data) || null : null;
}

/**
 * THE SECTION, for one viewer at one instant. Pure but for the accounts of
 * whoever pressed a switch who is not on the run (an admin, say), which the
 * caller reads and hands in as `deciders`.
 */
export function buildWhoFinished(
  records: RunRecords,
  finishing: Finishing,
  exercises: Map<string, ExerciseTally>,
  viewer: WhoFinishedViewer,
  now: Date,
  deciders: Map<string, Record<string, unknown>> = new Map(),
): WhoFinishedModel {
  const end: RunEnd = runEndOf(records.run, records.groups, now);
  if (!end.over) {
    return { state: "not-yet", line: notYetLine(end.lastDay), needsRule: finishing.rule === null };
  }

  const listed = listGroups(records, { isAdmin: viewer.isAdmin, role: viewer.role }, now, weeksOf(records));
  const rows: (WhoFinishedRow & { count: number })[] = [];
  const left: WhoFinishedLeft[] = [];
  for (const entry of listed) {
    for (const { row } of entry.people) {
      if (row.left !== null) {
        left.push({ uid: row.uid, name: row.name, groupName: entry.group.name, left: row.leftDateKey ? leftLine(dayLabel(row.leftDateKey)) : leftLine(null) });
        continue;
      }
      const record = recordOf(row, finishing, end);
      const tally = exercises.get(row.uid) ?? null;
      const { excused, missed } = excusedAndMissed(row);
      rows.push({
        uid: row.uid,
        name: row.name,
        groupName: entry.group.name,
        came: ofLine(row.came, row.of),
        ...(row.online > 0 ? { cameWhere: roomAndOnlineWords(row.came - row.online, row.online) } : {}),
        exercises: tally && tally.of > 0 ? ofLine(tally.done, tally.of) : null,
        line: missedLine(excused, missed),
        finished: record?.finished === true,
        changed: record?.decision
          ? changedByLine(record.decision.byUid, viewer.uid, deciderName(records, record.decision.byUid, deciders))
          : null,
        count: row.came,
      });
    }
  }
  rows.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));
  left.sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));

  const finished = rows.filter((row) => row.finished).length;
  const not = rows.length - finished;
  return {
    state: "open",
    sentence: finishing.rule ? ruleSentence(finishing.rule.atLeast, end.sessions) : NO_RULE_SENTENCE,
    counts: countsLine(finished, not),
    finished,
    not,
    rows: rows.map(({ count: _count, ...row }) => row),
    shown: Math.min(rows.length, SHOWN_FIRST),
    left,
    notes: cancelledNotes(records, now),
  };
}

/**
 * Read what the section needs beyond the run's records (the rule and the
 * decisions, the exercises, and the accounts of anybody who pressed a switch
 * and is not on the run), then build it. Before the end only the rule is
 * read: the line says whether one is set.
 */
export async function loadWhoFinished(
  db: Firestore,
  records: RunRecords,
  viewer: WhoFinishedViewer,
  now: Date,
): Promise<WhoFinishedModel> {
  const finishing = await readFinishing(db, records.run.id);
  if (!runEndOf(records.run, records.groups, now).over) {
    return buildWhoFinished(records, finishing, new Map(), viewer, now);
  }
  const exercises = await readExerciseTallies(db, records);
  const missing = [...new Set([...finishing.decisions.values()].map((decision) => decision.byUid))].filter(
    (uid): uid is string => typeof uid === "string" && uid !== "" && !uid.includes("/") && !records.accounts.has(uid),
  );
  const deciders = new Map<string, Record<string, unknown>>();
  if (missing.length > 0) {
    const snaps = await db.getAll(...missing.map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) {
      if (snap.exists) deciders.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    }
  }
  return buildWhoFinished(records, finishing, exercises, viewer, now, deciders);
}
