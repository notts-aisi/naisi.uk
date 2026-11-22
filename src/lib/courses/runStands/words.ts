/**
 * WHERE A RUN STANDS, AS A PROGRAMME'S SETTINGS SAYS IT (the Course run
 * section, admins only): the three stages, the sentence under them, what each
 * stage means, and the question before each early move.
 *
 * THREE STAGES FOR SIX STORED VALUES. A run a programme names takes no
 * application of its own, so its two application stages say nothing about
 * it, and every course job treats Applications open, Applications closed and
 * Running alike. So all three show as Running. Cancelled shows as itself.
 *
 * TRUE WHICHEVER WAY THE JOB IS SWITCHED. A running run completes by itself
 * when its work closes only while the `courses-runs-complete` job is on, so
 * the sentence is told which way it is, and says an admin marks it
 * completed while it is off.
 *
 * Pure, with no reads and no clock but the one passed: the loader words the
 * panel with it and the panel's questions are worded by it in the browser.
 */

import type { CourseRunStatus } from "@/lib/firestore/courses";
import { COURSE_RUN_STATUS_LABEL } from "@/lib/firestore/courses";

/** The stage a stored status shows as. */
export type RunStage = "draft" | "running" | "completed" | "cancelled";

export function stageOf(status: CourseRunStatus): RunStage {
  if (status === "draft" || status === "completed" || status === "cancelled") return status;
  return "running";
}

/** The three stages drawn in a line, in order. */
export const RUN_STAGES: readonly { stage: Exclude<RunStage, "cancelled">; label: string }[] = [
  { stage: "draft", label: COURSE_RUN_STATUS_LABEL.draft },
  { stage: "running", label: COURSE_RUN_STATUS_LABEL.running },
  { stage: "completed", label: COURSE_RUN_STATUS_LABEL.completed },
];

/** A cancelled run's one stage, in today's word. */
export const CANCELLED_STAGE = COURSE_RUN_STATUS_LABEL.cancelled;

export const WHERE_IT_STANDS = "Where it stands";

// ---------------------------------------------------------------------------
// The sentence under the stages
// ---------------------------------------------------------------------------

/** Under a draft. */
export const DRAFT_LINE =
  "Draft: people holding a place see only week 1, from decision day once it is ready. It starts running by itself the first time people are handed over.";

/** "Running since Thu 29 Oct, when people were first handed over." */
export function runningSinceWords(day: string): string {
  return `Running since ${day}, when people were first handed over.`;
}

/** A running run with no record of a hand-over. */
export const RUNNING_LINE = "It is running.";

/** With the job on and the day still to come: "It completes by itself on Wed 23 Dec, when work closes." */
export function completesByItselfWords(day: string): string {
  return `It completes by itself on ${day}, when work closes.`;
}

/** With the job on and the day gone: the next tick completes it. */
export function completesShortlyWords(day: string): string {
  return `Work closed on ${day}, so it completes by itself shortly.`;
}

/** With the job off and the day still to come. */
export function adminCompletesAfterWords(day: string): string {
  return `Work closes on ${day}. An admin marks it completed after that.`;
}

/** With the job off and the day gone. */
export function adminCompletesNowWords(day: string): string {
  return `Work closed on ${day}. An admin marks it completed.`;
}

/** Under a completed run: "Completed. Its last session was on Wed 9 Dec." */
export function completedWords(lastDay: string | null): string {
  return lastDay ? `Completed. Its last session was on ${lastDay}.` : "Completed.";
}

/** Under Running and Completed: what each means. */
export const STAGES_MEANING =
  "Running: the weekly emails go, and its people see their weeks once Publish tells them their group (week 1 from decision day, once it is ready). Completed: the weekly emails stop, it leaves each facilitator’s My programmes, and nobody more can be handed over or moved. Registers, work and certificates stay.";

export type RunStandsFacts = {
  status: CourseRunStatus;
  /** When the course log first records people handed over to this run, or null. */
  firstHandedOverAt: Date | null;
  /** The day work closes, "Wed 23 Dec", or null with no session dated. */
  workClosesOn: string | null;
  /** Whether work has closed by `now`. */
  workClosed: boolean;
  /** The day of the last session, "Wed 9 Dec", or null. */
  lastSessionOn: string | null;
  /** Whether the job that completes a run when its work closes would run. */
  completesByItself: boolean;
  /** Formats an instant as the house day ("Thu 29 Oct"). */
  dayOf: (at: Date) => string;
};

/** The sentence under the stages. Empty for a cancelled run. */
export function standsLine(facts: RunStandsFacts): string {
  const stage = stageOf(facts.status);
  if (stage === "draft") return DRAFT_LINE;
  if (stage === "completed") return completedWords(facts.lastSessionOn);
  if (stage === "cancelled") return "";
  const since = facts.firstHandedOverAt ? runningSinceWords(facts.dayOf(facts.firstHandedOverAt)) : RUNNING_LINE;
  if (!facts.workClosesOn) return since;
  const day = facts.workClosesOn;
  const then = facts.completesByItself
    ? facts.workClosed
      ? completesShortlyWords(day)
      : completesByItselfWords(day)
    : facts.workClosed
      ? adminCompletesNowWords(day)
      : adminCompletesAfterWords(day);
  return `${since} ${then}`;
}

// ---------------------------------------------------------------------------
// The two early moves, and the questions they ask
// ---------------------------------------------------------------------------

/**
 * Which early move the section offers: start a draft running, or complete a
 * live run (`through` when its stored status is an application stage, so the
 * status route steps through Running). None for a completed or cancelled run.
 */
export type RunMove = { kind: "start" } | { kind: "complete"; through: boolean } | null;

export function moveFor(status: CourseRunStatus): RunMove {
  if (status === "draft") return { kind: "start" };
  if (status === "running") return { kind: "complete", through: false };
  if (status === "applications-open" || status === "applications-closed") return { kind: "complete", through: true };
  return null;
}

export const START_BUTTON = "Start it running now…";
export const COMPLETE_BUTTON = "Mark it completed now…";

const named = (label: string) => label.trim() || "this run";
const namedFirst = (label: string) => label.trim() || "This run";

export function startTitle(label: string): string {
  return `Start ${named(label)} running?`;
}

export const START_BODY =
  "The weekly emails start, and its people see their weeks once Publish tells them their group. It can’t go back to draft.";
export const KEEP_DRAFT = "Keep it as a draft";
export const START_CONFIRM = "Start it running";

export function startedWords(label: string): string {
  return `${namedFirst(label)} is running. Nobody was emailed.`;
}

export function completeTitle(label: string): string {
  return `Mark ${named(label)} completed?`;
}

export const COMPLETE_BODY =
  "The weekly emails stop and nobody more can be handed over. Registers, work and certificates stay. It can’t be moved back.";
export const KEEP_RUNNING = "Keep it running";
export const COMPLETE_CONFIRM = "Mark it completed";

export function completedNowWords(label: string): string {
  return `${namedFirst(label)} is completed. Nobody was emailed.`;
}

export const NOBODY_IS_EMAILED = "Nobody is emailed.";
