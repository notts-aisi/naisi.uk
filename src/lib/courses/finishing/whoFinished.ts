import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import {
  dayLabel,
  listGroups,
  weeksOf,
  type ListedGroup,
  type RunRecords,
} from "@/lib/courses/programmeAttendance";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { attendanceDocId } from "@/lib/firestore/courseAttendance";
import { normalizeExerciseResponse } from "@/lib/firestore/courseExercises";
import { normalizeGroupWeek } from "@/lib/firestore/courseGroups";
import { normalizeCourseWeek, type CourseWeekDoc } from "@/lib/firestore/courses";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { readFinishing, recordOf, runEndOf, type Finishing, type RunEnd } from "./record";
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
 * WHO FINISHED, AS THE PROGRAMME'S LEAD AND ADMINS ARE SHOWN IT (board
 * en-finish): a section of the programme's Overview once the run's last
 * session is over, and before then one line saying when it can be done.
 *
 * Everybody taking part, as the Attendance tab lists them for this viewer
 * (`listGroups`: a lead sees the people Publish has told, an admin everybody
 * placed), fewest sessions first, each with their group, how many sessions
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

export type WhoFinishedRow = {
  uid: string;
  name: string;
  groupName: string;
  /** "2 of 6": sessions they came to, of those their group held while they were in it. */
  came: string;
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

  // Each group's set: "weekId::exerciseId".
  const setByGroup = new Map<string, Set<string>>();
  records.groups.forEach((group, index) => {
    const forks = new Map<string, CourseWeekDoc>();
    for (const doc of forkSnaps[index]?.docs ?? []) forks.set(doc.id, normalizeGroupWeek(doc.id, doc.data() ?? {}));
    const set = new Set<string>();
    const taught = new Set(resolveSessions(records.run, group).map((session) => session.weekId));
    for (const weekId of taught) {
      const week = forks.get(weekId) ?? canonical.get(weekId);
      if (!week || !week.published) continue;
      // The week's written answers through the one reader: a block week's
      // Written answer blocks, or a week written before blocks' exercises.
      for (const answer of weekWrittenAnswers(week)) set.add(`${weekId}::${answer.id}`);
    }
    setByGroup.set(group.id, set);
  });

  const groupOf = new Map<string, string>();
  for (const enrolment of records.enrolments) {
    if (enrolment.groupId) groupOf.set(enrolment.uid, enrolment.groupId);
  }
  const answered = new Map<string, Set<string>>();
  for (const doc of responseSnap.docs) {
    const response = normalizeExerciseResponse(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (response.runId !== runId || !response.submittedAt) continue;
    const groupId = groupOf.get(response.uid);
    const key = `${response.weekId}::${response.exerciseId}`;
    if (!groupId || !setByGroup.get(groupId)?.has(key)) continue;
    const mine = answered.get(response.uid) ?? new Set<string>();
    mine.add(key);
    answered.set(response.uid, mine);
  }

  const out = new Map<string, ExerciseTally>();
  for (const [uid, groupId] of groupOf) {
    const of = setByGroup.get(groupId)?.size ?? 0;
    out.set(uid, { done: answered.get(uid)?.size ?? 0, of });
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
  viewer: { isAdmin: boolean; uid: string },
  now: Date,
  deciders: Map<string, Record<string, unknown>> = new Map(),
): WhoFinishedModel {
  const end: RunEnd = runEndOf(records.run, records.groups, now);
  if (!end.over) {
    return { state: "not-yet", line: notYetLine(end.lastDay), needsRule: finishing.rule === null };
  }

  const listed = listGroups(records, { isAdmin: viewer.isAdmin }, now, weeksOf(records));
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
  viewer: { isAdmin: boolean; uid: string },
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
