import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { fellowsOf, runPeopleToScrub, RUNNING_LABEL } from "@/lib/courses/coursework/door";
import { loadAnswers } from "@/lib/courses/coursework/gather";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { buildRunAttendance, readRunRecords } from "@/lib/courses/programmeAttendance";
import { weekReportsForReview } from "@/lib/courses/sessionReports/readers";
import { partsOf } from "@/lib/courses/weekBlocks/model";
import { weekAsksForWriting } from "@/lib/courses/weekWork/model";
import { loadPeopleWeekFacts, loadRunWeekStates } from "@/lib/courses/weekWork/readers";
import { REVIEW_FOLLOW_UP_TASK_SOURCE } from "@/lib/firestore/courseTasks";
import { SOMETHING_ELSE } from "@/lib/firestore/courseSessionReports";
import { cameAfter } from "@/lib/legal/courseworkUse";
import { reviewUseFrom } from "@/lib/legal/reviewUse";
import { ELSE_ID, poolWeekCheckIns } from "@/lib/surveys/checkIns/reviewPool";
import type { WeekReviewDoor } from "./door";
import type { PersonWeek, ReportPicks } from "./facts";
import {
  SOMETHING_ELSE_ID,
  type ReviewCheckIn,
  type ReviewPerson,
  type ReviewReport,
  type ReviewSources,
  type ReviewWork,
  type ReviewWeekPart,
} from "./input";

/**
 * EVERYTHING A WEEK'S REVIEW IS MADE FROM, read on the Admin SDK after the
 * review's door has admitted an admin (`./door.ts`). Two halves, kept apart:
 *
 *  - WHAT MAY BE SENT (`ReviewSources`, built into messages by `input.ts`):
 *    the week's written answers and reflections through the coursework's one
 *    reader (`loadAnswers`, which reads a written answer only once its
 *    readers may, and marks each row counted under version 13); the week's
 *    check-ins through survey code's own pool (`poolWeekCheckIns`), which
 *    hands back answers by group and never by person, each held to its
 *    sender's version 15 moment there; and this week's facilitators'
 *    reports (`weekReportsForReview`), each held to its writer's moment
 *    here. Every account's version 15 moment (`reviewUseFrom`) and every
 *    name to take out (`runPeopleToScrub`, the people running the programme
 *    among them).
 *  - WHAT IS NEVER SENT (`ReviewFactsIn`, for `facts.ts`): the register (the
 *    Attendance tab's own count of absences in a row), where each person's
 *    week stands, this week's reports' picks, and the follow-ups already
 *    asked for. The page reads them to say what the site already knows.
 *
 * Every query is one equality on one field, or two equalities (the tasks),
 * so none needs a declared index.
 */

export type ReviewFactsIn = {
  absentInARow: Map<string, number>;
  weeks: Map<string, PersonWeek>;
  reports: ReportPicks[];
  /** Follow-ups already asked for this week, by the person they are about, with when. */
  askedFor: Map<string, Date | null>;
};

export type GatheredReview = {
  sources: ReviewSources;
  facts: ReviewFactsIn;
  /** Each facilitator's first name, for "Ask Rahul to have a word with Grace". */
  firstNameOf: Map<string, string>;
};

type Raw = Record<string, unknown>;

/** Accounts per addressed read, well inside `getAll`'s limits. */
const ACCOUNT_BATCH = 300;

async function readAccounts(db: Firestore, uids: readonly string[]): Promise<Map<string, Raw>> {
  const out = new Map<string, Raw>();
  const unique = [...new Set(uids)].filter((uid) => uid && !uid.includes("/"));
  for (let at = 0; at < unique.length; at += ACCOUNT_BATCH) {
    const snaps = await db.getAll(...unique.slice(at, at + ACCOUNT_BATCH).map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) if (snap.exists) out.set(snap.id, (snap.data() ?? {}) as Raw);
  }
  return out;
}

/** Whether every send of something came strictly after a moment. */
const allAfter = (sends: ReadonlyArray<Date | null>, from: Date | null) => sends.length > 0 && sends.every((at) => cameAfter(at, from));

export async function gatherWeekReview(db: Firestore, opened: WeekReviewDoor, now: Date): Promise<GatheredReview> {
  const { door, run, weekNumber, weekId } = opened;
  const fellows = fellowsOf(door);
  const week = door.weeks.find((each) => each.weekId === weekId) ?? null;
  const liveGroups = opened.groups.map((each) => each.group);
  const facilitatorUids = [...new Set(liveGroups.flatMap((group) => group.facilitatorUids))];

  const [accounts, answers, people, reports, records, states, askedSnap] = await Promise.all([
    readAccounts(db, [...fellows, ...facilitatorUids]),
    week ? loadAnswers(db, run.id, [week], fellows) : Promise.resolve([]),
    runPeopleToScrub(db, door),
    weekReportsForReview(db, run.id, weekNumber),
    readRunRecords(db, run.id),
    loadRunWeekStates(db, { run, liveGroups, now }),
    db.collection("tasks").where("source", "==", REVIEW_FOLLOW_UP_TASK_SOURCE).where("sourceRef.cohortId", "==", run.id).get(),
  ]);

  // Every account's version 15 moment: what each person's lines count from.
  const momentOf = new Map<string, Date | null>([...accounts].map(([uid, data]) => [uid, reviewUseFrom(data)]));

  // The check-ins, pooled in survey code: never by person.
  const checkIns = await poolWeekCheckIns(db, {
    runId: run.id,
    roundId: opened.roundId,
    programmeId: opened.programmeId,
    weekNumber,
    decide: (uid, sends) => (!fellows.has(uid) ? "never" : allAfter(sends, momentOf.get(uid) ?? null) ? "use" : "not-yet"),
  });

  const groupIds = liveGroups.map((group) => group.id);
  const live = new Set(groupIds);

  // The reports on this week's sessions of the live groups. One goes to
  // Claude only when its writer's moment came before it was last sent.
  const weekReports = reports.filter((report) => live.has(report.groupId));
  const going: ReviewReport[] = [];
  let reportsLeftOut = 0;
  for (const report of weekReports) {
    const at = report.updatedAt ?? report.sentAt;
    if (!report.writerUid || !cameAfter(at, momentOf.get(report.writerUid) ?? null)) {
      reportsLeftOut += 1;
      continue;
    }
    going.push({
      groupId: report.groupId,
      occurrence: report.occurrence,
      at,
      how: report.answers.how,
      wentWell: report.answers.wentWell,
      didnt: report.answers.didnt,
      unclear: report.answers.unclear.map((id) => (id === SOMETHING_ELSE ? SOMETHING_ELSE_ID : id)),
      forLead: report.answers.forLead,
      engaged: report.answers.engaged,
      notRead: report.answers.notRead,
      needsHand: report.answers.needsHand,
    });
  }

  // The week's parts: the run's copy first, then any a group's copy named.
  const parts: ReviewWeekPart[] = [];
  const addPart = (id: string, title: string) => {
    if (id && title.trim() && !parts.some((part) => part.id === id)) parts.push({ id, title: title.trim() });
  };
  for (const part of partsOf(opened.blocks)) addPart(part.id, part.title);
  for (const part of checkIns.parts) addPart(part.id, part.title);
  for (const report of weekReports) for (const part of report.parts) addPart(part.id, part.title);

  const work: ReviewWork[] = answers
    .filter((answer) => answer.kind === "written" || answer.kind === "reflection")
    .map((answer) => ({
      rowId: answer.rowId,
      uid: answer.uid,
      kind: answer.kind as ReviewWork["kind"],
      questionKey: answer.questionKey,
      text: answer.text,
      counted: answer.counted,
      firstWrittenAt: answer.firstWrittenAt ?? null,
    }));

  const scrub: ReviewPerson[] = people.map((person) => ({
    uid: person.uid,
    name: person.name,
    role: person.label === "a fellow" ? "fellow" : person.label === RUNNING_LABEL ? "staff" : "facilitator",
  }));

  const pooled: ReviewCheckIn[] = checkIns.pooled
    .filter((checkIn) => live.has(checkIn.groupId))
    .map((checkIn) => ({ ...checkIn, unclear: checkIn.unclear.map((id) => (id === ELSE_ID ? SOMETHING_ELSE_ID : id)) }));

  const sources: ReviewSources = {
    programme: door.programmeName,
    weekNumber,
    weekTitle: opened.weekTitle,
    questions: (week?.questions ?? [])
      .filter((question) => question.kind === "written" || question.kind === "reflection")
      .map((question) => ({ key: question.key, kind: question.kind as ReviewWork["kind"], text: question.text })),
    parts,
    groupIds,
    fellows,
    groupOf: new Map([...door.people.groupOf].filter(([uid, groupId]) => fellows.has(uid) && live.has(groupId))),
    momentOf,
    work,
    checkIns: pooled,
    checkInsLeftOut: checkIns.notYet,
    reports: going,
    reportsLeftOut,
    people: scrub,
  };

  // ---- What the site already knows, never sent -----------------------------
  const absentInARow = new Map<string, number>();
  if (records) {
    for (const group of buildRunAttendance(records, { isAdmin: true }, now).groups) {
      for (const person of group.people) if (person.absentInARow > 0 && fellows.has(person.uid)) absentInARow.set(person.uid, person.absentInARow);
    }
  }
  const writes = weekAsksForWriting(opened.blocks);
  const started = await loadPeopleWeekFacts(db, { runId: run.id, weekNumber, blocks: opened.blocks, uids: [...fellows] });
  const metGroups = new Set(opened.groups.filter((each) => each.met).map((each) => each.group.id));
  const weeks = new Map<string, PersonWeek>();
  for (const uid of fellows) {
    const groupId = door.people.groupOf.get(uid);
    weeks.set(uid, {
      started: started.get(uid)?.touched === true,
      state: states.stateOf(uid, weekNumber).kind,
      writes,
      groupMet: groupId !== undefined && metGroups.has(groupId),
    });
  }
  const askedFor = new Map<string, Date | null>();
  for (const doc of askedSnap.docs) {
    const data = (doc.data() ?? {}) as Raw;
    const ref = (data.sourceRef ?? {}) as Raw;
    if (ref.weekNumber !== weekNumber || typeof ref.aboutUid !== "string") continue;
    const created = data.createdAt as { toDate?: () => Date } | Date | null | undefined;
    askedFor.set(ref.aboutUid, created instanceof Date ? created : typeof created?.toDate === "function" ? created.toDate() : null);
  }

  const firstNameOf = new Map<string, string>();
  for (const uid of facilitatorUids) {
    const data = accounts.get(uid);
    if (data) firstNameOf.set(uid, firstNameOfUser(data));
  }

  return {
    sources,
    facts: {
      absentInARow,
      weeks,
      reports: weekReports.map((report) => ({ needsHand: report.answers.needsHand, notRead: report.answers.notRead })),
      askedFor,
    },
    firstNameOf,
  };
}
