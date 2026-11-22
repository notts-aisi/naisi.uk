import { draftExitBlocker } from "@/lib/courses/draftExit";
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
/**
 * Said only where the hand-over after an accepted invitation is stopped,
 * which nobody reads on a screen: that door leaves a draft run alone, so
 * that only an admin's press ever starts a run running.
 */
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
 * Which door is asking. `press` is an admin's Hand people over; `acceptance`
 * is the hand-over that follows an accepted invitation, in a route that
 * serves the applicant.
 */
export type HandOverDoor = "press" | "acceptance";

/**
 * What stops a hand-over, as a sentence, or null when one can be pressed.
 * The same answer for the panel that draws the button and for the writer,
 * which asks it again of what its transaction read.
 *
 * A DRAFT RUN. An admin's press that hands anybody over to a draft run starts
 * it running, in the press's own transaction (`./handOver.ts`): a draft
 * run's own members cannot read its document, so it may not stay a draft
 * with people on it. Leaving draft freezes the week plan, so the press meets
 * the check every exit from draft meets (`draftExitBlocker`), and a plan
 * whose week ids have drifted stops it with that check's own sentence. The
 * hand-over after an accepted invitation never starts a run: it leaves a
 * draft run alone, and the panel names the person for the press.
 */
export function handOverBlocker(
  form: Pick<ApplicationForm, "decisionsSentAt">,
  programme: Pick<ProgrammeSettings, "runId" | "courseId">,
  run: RunRead | null,
  door: HandOverDoor = "press",
): string | null {
  if (form.decisionsSentAt === null) return DECISIONS_NOT_SENT;
  if (programme.runId === null) return NO_RUN_NAMED;
  const standing = runStanding(run, programme.courseId);
  if (!standing.ok) return RUN_NO_LONGER_STANDS[standing.why];
  if (run?.run.status === "draft") {
    if (door === "acceptance") return RUN_IS_A_DRAFT;
    return draftExitBlocker("draft", "running", run.run.weekPlan);
  }
  return null;
}
