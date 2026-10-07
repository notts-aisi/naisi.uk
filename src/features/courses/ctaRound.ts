import { cohortLabel } from "@/lib/courses/cohortLabel";
import {
  formatPastWindowDate,
  formatRunStartShort,
  formatWindowDate,
  formatWindowDeadline,
} from "@/lib/courses/window";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { CourseCTARound } from "./CourseCTA";
import type { CourseLiveRound } from "./fetchLiveRound";

/**
 * THE ROUND A COURSE'S PAGE SPEAKS ABOUT, FLATTENED FOR THE CALL TO ACTION.
 *
 * The call to action is a client island, so it is handed strings and not a
 * round: every date is rendered here, on the server, in Europe/London.
 * Formatting a Nottingham deadline in the visitor's own timezone is how
 * someone reads "closes Sat 17 Oct" and applies a day late. Only the fields
 * the island prints are named, so nothing else about a round reaches the
 * page's HTML.
 *
 * It lives in a module of its own, beside the island, so that what the page
 * hands over can be executed by a test from a stored round to the words on
 * the button. The page calls it once and passes the result to both
 * placements.
 *
 * A LIVE deadline carries its TIME ("Sun 18 Oct, 23:59"), because the minute
 * it falls on is the thing an applicant plans around. A PASSED one carries its
 * year instead ("Sun 18 Oct 2026"): the minute no longer matters, and without
 * the year a round from a previous autumn reads as one you have just missed.
 *
 * `targetRun` is the run the round will place people onto, and the two rows
 * derived from it (the cohort chip and the start date) are EMPTY when it is
 * null rather than falling back to the featured run: they would then describe
 * a different intake than the deadline beside them. The one thing that may
 * stand in for a start date is the application form's own: when the tied
 * programme begins, as its lead wrote it.
 *
 * Null for no round and for one whose state is `inactive`, which is not a
 * public thing at all.
 */
export function toCTARound(
  round: CourseLiveRound | null,
  targetRun: CourseRunDoc | null,
): CourseCTARound | null {
  if (!round || round.state === "inactive") return null;
  const past = round.state === "closed";
  return {
    id: round.id,
    state: round.state,
    opensOn: round.opensAt ? formatWindowDate(round.opensAt) : null,
    closesOn: round.closesAt
      ? past
        ? formatPastWindowDate(round.closesAt)
        : formatWindowDeadline(round.closesAt)
      : null,
    decisionsOn: round.decisionsByDate
      ? (formatRunStartShort(round.decisionsByDate) ?? null)
      : null,
    // The structured cohort, never the run's admin label.
    cohortLabel: cohortLabel(targetRun),
    startsOn:
      (targetRun ? formatRunStartShort(targetRun.startDate) : undefined)
      || round.form?.starts
      || null,
    // The application form is offered in its own words, and through the one
    // address its own code builds. The day and the minute it closes are two
    // strings because the form's sentence reads "Apply by Sun 18 Oct.
    // Applications close at 23:59." Both are null once it has closed: a
    // deadline that has passed is not something to apply by.
    form: round.form
      ? {
          applyPath: round.form.applyPath,
          applyBy:
            round.closesAt && !past ? formatWindowDate(round.closesAt) : null,
          closesAtTime:
            round.closesAt && !past
              ? formatSiteDate(round.closesAt, { hour: "2-digit", minute: "2-digit" })
              : null,
        }
      : null,
  };
}
