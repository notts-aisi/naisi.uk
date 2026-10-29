import type { CourseAuditKind } from "@/lib/firestore/courseAudit";
import type { ProgrammeSettings } from "../model";
import type { ApplicationForm } from "../normalise";
import { runStanding, type RunRead } from "./run";

/**
 * WHAT STOPS A HAND-OVER, for every door that hands somebody over: the
 * admin's press (`./handOver.ts`) and the hand-over that follows an accepted
 * invitation (`./onAcceptance.ts`).
 *
 * Its own file because the second door runs inside a route that serves an
 * applicant, and nothing such a route imports may reach the committee's
 * reviews or decisions (`tests/applications-boundary.test.mjs`). The press
 * reads decisions; this reads only the form, the programme and the run.
 */

/** The kind of the course log's line a hand-over writes, by either door. */
export const HAND_OVER_AUDIT_KIND = "run-hand-over" satisfies CourseAuditKind;

export const DECISIONS_NOT_SENT =
  "Decisions have not been sent yet. People are handed over once everybody has been told.";
export const NO_RUN_NAMED = "Say which course run this programme places people on first.";
export const RUN_IS_A_DRAFT =
  "That run is still a draft. Move it on from draft first: its members cannot open a draft run.";
export const CHANGED_WHILE_PRESSING =
  "Something about this programme’s run changed while that was running. Check the run and press again.";

/** What each way a named run can have stopped standing is told as, at a hand-over. */
const RUN_NO_LONGER_STANDS: Record<
  Exclude<ReturnType<typeof runStanding>, { ok: true }>["why"],
  string
> = {
  "no-course": "This programme is no longer tied to a course page, so its run cannot take people.",
  gone: "The run this programme names is no longer on the site. Pick another run.",
  "other-course": "The run this programme names is not a run of the course it is tied to. Pick another run.",
  archived: "The run this programme names has been archived, so nobody can be placed on it.",
  over: "The run this programme names has finished or was cancelled, so nobody can be placed on it.",
  "open-enrolment":
    "The run this programme names takes sign-ups from a session picker, so nobody is placed on it from here.",
};

/**
 * What stops a hand-over, as a sentence, or null when one can be pressed.
 * The same answer for the panel that draws the button and for the writer,
 * which asks it again of what its transaction read.
 */
export function handOverBlocker(
  form: Pick<ApplicationForm, "decisionsSentAt">,
  programme: Pick<ProgrammeSettings, "runId" | "courseId">,
  run: RunRead | null,
): string | null {
  if (form.decisionsSentAt === null) return DECISIONS_NOT_SENT;
  if (programme.runId === null) return NO_RUN_NAMED;
  const standing = runStanding(run, programme.courseId);
  if (!standing.ok) return RUN_NO_LONGER_STANDS[standing.why];
  // A draft run has never had anybody on it, and nothing in the member area
  // is written for one: its own members cannot read a draft run's document.
  if (run?.run.status === "draft") return RUN_IS_A_DRAFT;
  return null;
}
