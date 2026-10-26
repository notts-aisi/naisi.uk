import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { OverviewPayload } from "@/app/api/courses/runs/[runId]/overview/route";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import type { CourseWeekDoc } from "@/lib/firestore/courses";
import { readTabRun } from "./load";

/**
 * "PREVIEW AS A FELLOW" (board pr-weeks): one week of a programme's run,
 * drawn by the member's own week page (`BlockWeek`) as somebody taking part
 * reads it, for the programme's lead and admins on the Weeks tab.
 *
 * WHO IS DRAWN. Nobody real: the page is handed a reader who takes part and
 * cannot write (a place that has finished, in no group), so every tick, box
 * and Send is drawn as a fellow sees it and none can be pressed, and no
 * person's ticks, answers or notes are read. With no group there is no
 * session, no due day and no group notes; the page says so where it would.
 *
 * WHICH WEEK. The run's own week, or a group's own copy of it when one is
 * asked for (`resolveWeekDoc`, the one reader of a group's copy). Only a week
 * written as blocks is previewed here: a week written before blocks is drawn
 * by the member's older page, which reads its person's data in the browser.
 *
 * Everything handed to the page is plain data: no dates, no functions.
 */

export type PreviewWeek = CourseWeekDoc & { blocks: WeekBlock[] };

export type WeekPreview = {
  runId: string;
  weekNumber: number;
  week: PreviewWeek;
  payload: OverviewPayload;
};

export async function loadWeekPreview(
  db: Firestore,
  runId: string,
  weekNumber: number,
  weekId: string,
  groupId: string | null,
): Promise<WeekPreview | null> {
  const run = await readTabRun(db, runId);
  if (!run) return null;
  const [resolved, programme] = await Promise.all([
    resolveWeekDoc(db, run.id, groupId, weekId),
    runProgrammeOf(db, run.id).catch(() => null),
  ]);
  const stored = resolved.week;
  if (!stored || !isBlockWeek(stored)) return null;
  // The week's own fields, with no date and nothing of a group's copy's own.
  const week: PreviewWeek = {
    id: stored.id,
    weekNumber,
    title: stored.title,
    summary: stored.summary,
    guideBlocks: stored.guideBlocks,
    materials: stored.materials,
    exercises: stored.exercises,
    checklist: stored.checklist,
    questions: stored.questions,
    estimatedMinutes: stored.estimatedMinutes,
    published: stored.published,
    ready: stored.ready,
    blocks: stored.blocks,
    pitching: stored.pitching,
    ownerUid: null,
    updatedAt: null,
    updatedByUid: null,
  };
  const totalWeeks = run.weekPlan.filter((entry) => entry.kind === "week").length;
  const payload: OverviewPayload = {
    run: {
      id: run.id,
      courseId: run.courseId,
      courseTitle: run.courseTitle,
      label: run.label,
      academicYear: run.academicYear,
      status: run.status,
      startDate: run.startDate,
      weekPlan: run.weekPlan,
      totalWeeks,
    },
    calendarSource: "run",
    currentWeek: null,
    weeks: [
      {
        id: week.id,
        weekNumber,
        title: week.title,
        published: week.published,
        estimatedMinutes: week.estimatedMinutes,
        forked: resolved.source === "group",
        countableIds: [],
        thisWeek: null,
        // A preview is nobody's: no pack picked or given, no talk marked ready.
        picks: null,
      },
    ],
    weekSchedule: [],
    // In no group, there is nobody to ask to swap a pack or a case.
    askToSwap: [],
    programme: programme ? { name: programme.shortName, kind: programme.kind, leadFirstName: programme.leadFirstName } : null,
    shownCrest: null,
    forkedWeekIds: resolved.source === "group" ? [week.id] : [],
    // A place that has finished, in no group: it takes part, and writes nothing.
    enrolment: { status: "completed", role: "learner", groupId: null, joinedWeekNumber: 1 },
    group: null,
    groups: [],
    ownAttendance: null,
    finished: false,
    access: { isAdmin: false, isEnrolled: true, isFacilitator: false, isReviewer: false, isTrackLead: false },
    beforeGroups: null,
    // A preview is of a week, never of the end of a programme.
    whatsNext: null,
  };
  return { runId: run.id, weekNumber, week, payload };
}
