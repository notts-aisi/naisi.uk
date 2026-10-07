import type { ChipTone } from "@/components/ui/Chip";
import type { ApplicationWindowState } from "@/lib/courses/window";

/**
 * THE ONE-LINE STATE OF A COURSE'S APPLICATIONS, as a chip prints it on the
 * fellowships page and on the course's own page.
 *
 * It words a state somebody else decided: the caller hands over the window
 * state its lookup gave, and the day it opens already formatted in London's
 * time. Nothing here reads a clock or a round.
 *
 * The noun changes with how people get onto the run. An open-enrolment run
 * has no application: telling a fresher they can "apply" to something that
 * admits everybody promises a wait and a decision that are never coming.
 */
export function applicationStateWords(args: {
  state: ApplicationWindowState | null;
  /** True for a run people sign up to and are not selected for. */
  openEnrolment: boolean;
  /** "Mon 21 Sep", or null when the window has no opening day. */
  opensOn: string | null;
}): string {
  const noun = args.openEnrolment ? "Sign-ups" : "Applications";
  if (args.state === "open") return `${noun} open`;
  if (args.state === "not-yet") {
    return args.opensOn ? `${noun} open ${args.opensOn}` : `${noun} open soon`;
  }
  return `${noun} closed`;
}

/**
 * Three tones for three states. "Applications open Mon 21 Sep" is a date to
 * plan around, so it must not be painted the same grey as "Applications
 * closed" and read as a run that is over.
 */
export function applicationStateTone(state: ApplicationWindowState | null): ChipTone {
  if (state === "open") return "success";
  if (state === "not-yet") return "accent";
  return "neutral";
}
