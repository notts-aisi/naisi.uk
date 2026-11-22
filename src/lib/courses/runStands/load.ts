import "server-only";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { HAND_OVER_AUDIT_KIND } from "@/lib/applications/handover/blocker";
import type { RunDetailsView, RunStandsView } from "@/lib/applications/handover/views";
import { runEndOf } from "@/lib/courses/finishing/runEnd";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { workClosesAt, workClosesOnDayKey } from "@/lib/courses/weekWork/closes";
import { formatRunStartShort } from "@/lib/courses/window";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { jobStateFor, readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { RUNS_COMPLETE_JOB } from "@/lib/scheduler/registerJobs";
import { STAGES_MEANING, moveFor, stageOf, standsLine } from "./words";

/**
 * WHERE THE RUN A PROGRAMME NAMES STANDS, AND ITS DETAILS, for the Course run
 * section of the programme's Settings (admins only: `loadRunPanel` asks
 * before it calls this).
 *
 * Three reads beside the run the panel has already read, all at once:
 *
 *  - the run's groups (one equality on `runId`), for the day of its last
 *    session and the day its work closes (`workClosesAt`, the moment the
 *    job that completes runs goes by);
 *  - the course log's hand-over lines for the run (two equalities, no
 *    declared index), for "Running since": the line of the press that
 *    started the run from draft, which says so in its change fields;
 *  - the scheduler's switches, for whether that job would run: the global
 *    switch and the job's own, with its own default
 *    (`RUNS_COMPLETE_JOB`), exactly as the tick resolves them.
 *
 * Writes nothing.
 */

const MAX_GROUPS = 100;

function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const obj = raw as { toDate?: () => Date };
  return typeof obj.toDate === "function" ? obj.toDate() : null;
}

export async function loadRunStands(
  db: Firestore,
  run: CourseRunDoc,
  data: DocumentData,
  now: Date,
): Promise<{ stands: RunStandsView; details: RunDetailsView }> {
  const [groupSnap, handOvers, config] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", run.id).limit(MAX_GROUPS).get(),
    db.collection(COURSE_AUDIT_COLLECTION).where("runId", "==", run.id).where("kind", "==", HAND_OVER_AUDIT_KIND).get(),
    readSchedulerConfig(db),
  ]);
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}));

  // The hand-over that started the run: the line whose change fields say it
  // moved the run from Draft to Running. A run started any other way (the
  // status route, the older editor, or before the hand-over did it) has no
  // such line, and the section says only that it is running.
  let first: Date | null = null;
  for (const doc of handOvers.docs) {
    const row = doc.data() ?? {};
    const after = row.after as { status?: unknown } | undefined;
    if (after?.status !== "running") continue;
    const at = toDate(row.at);
    if (at && (!first || at.getTime() < first.getTime())) first = at;
  }

  const closes = workClosesAt(run, groups);
  const closeDay = workClosesOnDayKey(run, groups);
  const end = runEndOf(run, groups, now);
  // As the job decides: it skips an archived run and one being destroyed.
  const completesByItself =
    !run.archived &&
    data.destroying !== true &&
    config.enabled &&
    jobStateFor(config, RUNS_COMPLETE_JOB.id, RUNS_COMPLETE_JOB.enabledByDefault).enabled;

  const stage = stageOf(run.status);
  const move = moveFor(run.status);
  const stands: RunStandsView = {
    stage,
    line: standsLine({
      status: run.status,
      firstHandedOverAt: first,
      workClosesOn: closes && closeDay ? (formatRunStartShort(closeDay) ?? null) : null,
      workClosed: closes !== null && now.getTime() >= closes.getTime(),
      // Said only once it has happened: an early completion is before it.
      lastSessionOn: end.over ? end.lastDay : null,
      completesByItself,
      dayOf: londonDayLabel,
    }),
    meaning: stage === "running" ? STAGES_MEANING : "",
    move: move === null ? null : move.kind === "start" ? "start" : move.through ? "complete-through" : "complete",
    runLabel: run.label,
  };

  const cohort = run.cohort;
  const details: RunDetailsView = {
    label: run.label,
    academicYear: run.academicYear,
    cohortTerm: cohort?.term ?? "",
    cohortYear: cohort ? String(cohort.year) : "",
    cohortNumber: cohort ? String(cohort.number) : "",
    startDate: run.startDate,
    startDateWords: formatRunStartShort(run.startDate) ?? run.startDate,
    groupsGoneOut: data.allocationPublishedAt != null,
  };
  return { stands, details };
}
