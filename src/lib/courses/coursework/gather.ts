import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDocs, type ResolvedWeekEntry } from "@/lib/courses/groupResolve";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekFillInBoxes, weekReflectionPrompts, weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { readWrittenAnswer } from "@/lib/courses/writtenAnswers/model";
import { isFillInResponse, isOwnBoxResponse, isReflectionResponse } from "@/lib/firestore/courseExercises";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { courseworkCountsFrom, rowCountsFrom } from "@/lib/legal/courseworkUse";
import { workIsReadable } from "@/lib/courses/weekWork/model";
import { readRunForLock } from "@/lib/courses/weekWork/own";
import { loadRunWeekStates } from "@/lib/courses/weekWork/readers";
import type { CourseworkAnswer, CourseworkQuestion, CourseworkWeek } from "./input";

/**
 * THE ONE READER OF COURSEWORK FOR CLAUDE AND PANGRAM (privacy v13), on the
 * Admin SDK, after each route's own gate.
 *
 * What it reads, and nothing else: a run's live groups (who facilitates
 * them), its enrolments (which group each person reads the week of), its
 * weeks and each group's own copies of them (the questions), the rows of
 * `courseExerciseResponses` (reflections, written answers and fill-in boxes,
 * never an older exercise answer), and each writer's account for the moment
 * their coursework counts from (`courseworkCountsFrom`). Never a private
 * note, a tick, a survey answer, availability or an application.
 *
 * Every row is marked `counted` or not by `rowCountsFrom`, here and only
 * here: what leaves for Claude or Pangram is built from counted rows alone
 * (`model.ts`), and the rest is only counted ("N not included yet").
 *
 * A WRITTEN ANSWER is read only once its readers may read it (privacy v15,
 * `workIsReadable`): its week submitted or locked, or the answer sent before
 * weeks were submitted. Where each week stands is read once for the run
 * (`loadRunWeekStates`). Reflections and fill-in boxes are read as typed, as
 * v15 says, from each writer's coursework-use moment.
 *
 * Every query is one equality on one field (`runId`, or `uid` for one
 * person), filtered in memory, so nothing needs a declared index.
 */

type Raw = Record<string, unknown>;

/** The run's live groups and who reads which copy of the weeks. */
export type RunPeople = {
  /** Live group id to its facilitators. */
  facilitatorsOf: Map<string, string[]>;
  /** Everybody facilitating a live group of the run. */
  facilitators: Set<string>;
  /** A person's group on the run (their enrolment's), when it is live. */
  groupOf: Map<string, string>;
};

export async function loadRunPeople(db: Firestore, runId: string): Promise<RunPeople> {
  const [groupSnap, enrolmentSnap] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", runId).get(),
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
  ]);
  const facilitatorsOf = new Map<string, string[]>();
  for (const doc of groupSnap.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (group.archived || group.runId !== runId) continue;
    facilitatorsOf.set(group.id, group.facilitatorUids);
  }
  const facilitators = new Set([...facilitatorsOf.values()].flat());
  const groupOf = new Map<string, string>();
  for (const doc of enrolmentSnap.docs) {
    const data = (doc.data() ?? {}) as Raw;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const groupId = typeof data.groupId === "string" ? data.groupId : "";
    if (uid && groupId && facilitatorsOf.has(groupId)) groupOf.set(uid, groupId);
  }
  // A facilitator who holds no place reads the week of the one group they facilitate.
  for (const [groupId, uids] of facilitatorsOf) {
    for (const uid of uids) if (!groupOf.has(uid)) groupOf.set(uid, groupId);
  }
  return { facilitatorsOf, facilitators, groupOf };
}

/** The questions of one week as one copy of it asks them. */
function questionsOf(entry: ResolvedWeekEntry): CourseworkQuestion[] {
  const week = entry.week;
  if (!isBlockWeek(week)) return [];
  const at = { weekId: week.id, weekNumber: week.weekNumber, weekTitle: week.title };
  return [
    ...weekReflectionPrompts(week).map((prompt) => ({
      ...at,
      key: `reflection:${prompt.id}`,
      kind: "reflection" as const,
      rowId: prompt.id,
      text: prompt.text,
      boxes: [],
    })),
    ...weekWrittenAnswers(week).map((answer) => ({
      ...at,
      key: `written:${answer.id}`,
      kind: "written" as const,
      rowId: answer.id,
      text: answer.prompt,
      boxes: answer.boxes,
    })),
    ...weekFillInBoxes(week).map((box) => ({
      ...at,
      key: `fillIn:${box.id}`,
      kind: "fillIn" as const,
      rowId: box.id,
      text: [box.heading, box.label].filter((part) => part.trim()).join(": "),
      boxes: [],
    })),
  ];
}

/**
 * The block weeks of a run, each with its questions from every copy of it:
 * the run's own and each live group's. A question is keyed by its kind and
 * id, so the same prompt in two copies is one question; its words are the
 * run's copy's where it has one.
 */
export async function loadRunWeeks(db: Firestore, runId: string, groupIds: readonly string[]): Promise<CourseworkWeek[]> {
  const copies = await Promise.all([null, ...groupIds].map((groupId) => resolveWeekDocs(db, runId, groupId)));
  const weeks = new Map<string, CourseworkWeek>();
  copies.forEach((entries, index) => {
    for (const entry of entries) {
      const questions = questionsOf(entry);
      if (questions.length === 0) continue;
      const week = weeks.get(entry.week.id) ?? {
        weekId: entry.week.id,
        weekNumber: entry.week.weekNumber,
        title: entry.week.title,
        questions: [],
      };
      for (const question of questions) {
        const existing = week.questions.findIndex((candidate) => candidate.key === question.key);
        // The run's own copy (index 0) speaks for a question when it asks it.
        if (existing === -1) week.questions.push(question);
        else if (index === 0 && entry.source === "run") week.questions[existing] = question;
      }
      weeks.set(entry.week.id, week);
    }
  });
  return [...weeks.values()].sort((a, b) => a.weekNumber - b.weekNumber);
}

/** One row's words: a written answer in boxes is its boxes, each under its label. */
function answerWords(question: CourseworkQuestion, data: Raw): string {
  if (question.kind === "written") {
    const record = readWrittenAnswer(data);
    if (record.boxes) {
      return question.boxes
        .map((box) => ({ label: box.label, text: (record.boxes?.[box.id] ?? "").trim() }))
        .filter((box) => box.text)
        .map((box) => `${box.label}: ${box.text}`)
        .join("\n\n");
    }
    return record.text.trim();
  }
  return typeof data.text === "string" ? data.text.trim() : "";
}

/**
 * Whether a stored row is the kind its question asks for. A written answer
 * must also be one its readers may read (`readable`): a draft is its writer's
 * until they submit the week, or it locks.
 */
function rowFits(question: CourseworkQuestion, data: Raw, readable: (data: Raw) => boolean): boolean {
  if (question.kind === "reflection") return isReflectionResponse(data);
  if (question.kind === "fillIn") return isFillInResponse(data);
  // Every kind of box its writer fills in is left out by the one question.
  return !isOwnBoxResponse(data) && typeof data.words === "number" && readable(data);
}

/**
 * Every answer to the run's questions, by `writers` (null: everybody whose
 * row is there), each marked whether it counts. One read of the rows (one
 * equality on `runId`, or on `uid` when there is one writer), one `getAll` of
 * the writers' accounts.
 */
export async function loadAnswers(
  db: Firestore,
  runId: string,
  weeks: readonly CourseworkWeek[],
  writers: ReadonlySet<string> | null,
): Promise<CourseworkAnswer[]> {
  const only = writers && writers.size === 1 ? [...writers][0] : null;
  const [snap, run, groupSnap] = await Promise.all([
    only
      ? db.collection("courseExerciseResponses").where("uid", "==", only).get()
      : db.collection("courseExerciseResponses").where("runId", "==", runId).get(),
    readRunForLock(db, runId),
    // The run's groups, for whose sessions lock each writer's week: one equality on the run.
    db.collection("courseGroups").where("runId", "==", runId).get(),
  ]);
  const liveGroups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === runId);
  // Where each writer's week stands, for whether their written answer may be read.
  const states = run ? await loadRunWeekStates(db, { run, liveGroups, now: new Date() }) : null;
  const readable = (data: Raw) => {
    const uid = typeof data.uid === "string" ? data.uid : "";
    const weekNumber = typeof data.weekNumber === "number" ? data.weekNumber : 0;
    const record = readWrittenAnswer(data);
    if (!states) return record.firstSentAt !== null;
    return workIsReadable(states.stateOf(uid, weekNumber), record);
  };
  const byRow = new Map<string, CourseworkQuestion>();
  for (const week of weeks) for (const question of week.questions) byRow.set(`${week.weekId} ${question.rowId}`, question);

  const rows: Array<{ id: string; uid: string; question: CourseworkQuestion; data: Raw }> = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Raw;
    if (data.runId !== runId) continue;
    const uid = typeof data.uid === "string" ? data.uid : "";
    if (!uid || (writers && !writers.has(uid))) continue;
    const question = byRow.get(`${String(data.weekId ?? "")} ${String(data.exerciseId ?? "")}`);
    if (!question || !rowFits(question, data, readable)) continue;
    rows.push({ id: doc.id, uid, question, data });
  }

  const uids = [...new Set(rows.map((row) => row.uid))];
  const accounts = uids.length > 0 ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  const fromOf = new Map<string, Date | null>();
  for (const account of accounts) fromOf.set(account.id, account.exists ? courseworkCountsFrom((account.data() ?? {}) as Raw) : null);

  return rows
    .map((row): CourseworkAnswer | null => {
      const text = answerWords(row.question, row.data);
      if (!text) return null;
      const written = row.question.kind === "written" ? readWrittenAnswer(row.data) : null;
      return {
        rowId: row.id,
        uid: row.uid,
        questionKey: row.question.key,
        weekId: row.question.weekId,
        kind: row.question.kind,
        text,
        counted: rowCountsFrom(row.data, fromOf.get(row.uid) ?? null),
        agreed: (fromOf.get(row.uid) ?? null) !== null,
        levels: written?.feedback ? written.feedback.levels.map((level) => ({ row: level.row, level: level.level })) : [],
      };
    })
    .filter((answer): answer is CourseworkAnswer => answer !== null);
}

/**
 * The names each account goes by (its display name and its preferred name),
 * for swapping a name somebody typed into their words for a label before
 * anything leaves (`scrubNames`). Read here, used there, never sent.
 */
export async function loadAccountNames(db: Firestore, uids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return out;
  const snaps = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Raw;
    const profile = (data.profile && typeof data.profile === "object" ? data.profile : {}) as Raw;
    const names = [data.displayName, profile.preferredName]
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim());
    out.set(snap.id, [...new Set(names)]);
  }
  return out;
}
