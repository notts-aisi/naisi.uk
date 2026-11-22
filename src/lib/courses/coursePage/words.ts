/**
 * THE WORDS OF THE COURSES LIST AND OF A COURSE'S OWN PAGE (`/admin/courses`
 * and `/admin/courses/[courseId]`), in the newer pages.
 *
 * A course outlives its terms: what it teaches, its public page, its crest,
 * rubric and guide. A run of it is made, changed and closed on the Settings
 * of the programme that names it (Course run), so neither page opens a run's
 * editor. A run's stage is said in the words Course run uses
 * (`src/lib/courses/runStands/words.ts`): Draft, Running, Completed,
 * Cancelled.
 *
 * The cards below the Runs card keep their own words, in their own files.
 *
 * Pure: the two client pages draw these and a test reads them.
 */

import type { CourseRunStatus } from "@/lib/firestore/courses";
import { CANCELLED_STAGE, RUN_STAGES, stageOf } from "@/lib/courses/runStands/words";

const COUNT_FORMAT = new Intl.NumberFormat("en-GB");
const count = (n: number) => COUNT_FORMAT.format(n);

// ---------------------------------------------------------------------------
// A run's stage, as Course run says it
// ---------------------------------------------------------------------------

/** "Running" for a run in any of the three live statuses, "Draft", "Completed", "Cancelled". */
export function runStageLabel(status: CourseRunStatus): string {
  const stage = stageOf(status);
  if (stage === "cancelled") return CANCELLED_STAGE;
  return RUN_STAGES.find((each) => each.stage === stage)?.label ?? CANCELLED_STAGE;
}

/** A run's own name: its label, or its id when it has none. */
export function runNameWords(run: { id: string; label: string }): string {
  return run.label.trim() || run.id;
}

// ---------------------------------------------------------------------------
// The Courses list
// ---------------------------------------------------------------------------

export const COURSES_INTRO =
  "A course outlives its terms: what it teaches, its public page, crest, rubric and guide. Each term runs it on a programme.";

export const COURSE_COLUMNS = {
  title: "Course",
  track: "Track",
  status: "Status",
  level: "Level",
  hours: "Weekly hours",
  runs: "Runs",
} as const;

/** A course's weekly hours in the list: "Up to 5". */
export function upToHoursWords(hours: number): string {
  return `Up to ${count(hours)}`;
}

/** One run in a course's row: "Autumn 2026, running". */
export function listRunWords(run: { id: string; label: string; status: CourseRunStatus }): string {
  return `${runNameWords(run)}, ${runStageLabel(run.status).toLowerCase()}`;
}

/** Between the runs of one row. */
export const LIST_RUNS_JOIN = " · ";

/** The fold at the foot of the list: "Archived courses (2)". */
export function archivedCoursesWords(n: number): string {
  return `Archived courses (${count(n)})`;
}

// ---------------------------------------------------------------------------
// A course's own page
// ---------------------------------------------------------------------------

/** Under the course's name: "up to 5 hours a week". */
export function hoursAWeekWords(hours: number): string {
  return `up to ${count(hours)} ${hours === 1 ? "hour" : "hours"} a week`;
}

/** The strip of sections down the side, in the cards' own order on the page, and each card's anchor. */
export type CourseSection =
  | "details"
  | "public-page"
  | "crest"
  | "rubric"
  | "routes"
  | "predictions"
  | "guide"
  | "runs"
  | "publishing"
  | "careful";

export const COURSE_SECTIONS: readonly { id: CourseSection; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "public-page", label: "Public page" },
  { id: "runs", label: "Runs" },
  { id: "crest", label: "Crest" },
  { id: "rubric", label: "Rubric" },
  { id: "routes", label: "Routes and deadlines" },
  { id: "predictions", label: "Sealed predictions" },
  { id: "guide", label: "Facilitator guide" },
  { id: "publishing", label: "Publishing" },
  { id: "careful", label: "Careful" },
];

export const SECTIONS_LABEL = "Sections of the course";

export const PUBLIC_PAGE_TITLE = "Public page";
export const EDIT_PUBLIC_PAGE = "Edit the public page";
export const PUBLIC_PAGE_NOTE =
  "The pitch, the essentials, week by week, how the term goes, questions people ask and artwork.";

export const RUNS_TITLE = "Runs";
export const OPEN_THE_PROGRAMME = "Open the programme";
export const WHERE_A_RUN_IS_MADE = "A run is made, changed and closed on its programme’s Settings, under Course run.";

/**
 * The programme that names one run, as the server hands it to the course's
 * page (`readRunProgrammes`): its name and term, and its Overview only for a
 * reader the Overview opens for (null for anybody else).
 */
export type RunProgramme = { name: string; href: string | null };

/** By run id. A run no programme names is absent. */
export type RunProgrammes = Record<string, RunProgramme>;

/** The programme that names a run, as a course's page names it: "AGI Strategy, Autumn 2026". */
export function programmeNameWords(name: string, termLabel: string): string {
  return [name.trim(), termLabel.trim()].filter(Boolean).join(", ");
}

/** Under a run a programme names: "Running · named on AGI Strategy, Autumn 2026". */
export function namedOnWords(status: CourseRunStatus, programmeName: string): string {
  return `${runStageLabel(status)} · named on ${programmeName}`;
}

/** Under a run no programme names: "Running · no programme names it". */
export function namedByNoneWords(status: CourseRunStatus): string {
  return `${runStageLabel(status)} · no programme names it`;
}

/** The way to the older page of a run no programme names. */
export const OPEN_THE_RUN = "Open the run";

/** The fold under the live runs: "Archived runs (1)". */
export function archivedRunsWords(n: number): string {
  return `Archived runs (${count(n)})`;
}
