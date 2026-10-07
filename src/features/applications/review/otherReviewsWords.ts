import { listInWords } from "@/lib/applications/review/people";
import type { ReviewPayload } from "@/lib/applications/review/types";

/**
 * The line the review screen shows under "Other reviews" while somebody
 * else's review is being held back from a lead or a reviewer.
 *
 * It says why, and what to do about it. A first review is decided for the
 * whole application, so there are three cases. The last sentence below is
 * the design's own, for somebody who still has answers to score on the
 * programme the application is open under: the scores they are giving are on
 * the screen in front of them. The other two are on no design board: one for
 * somebody who has scored everything here and still has another of their
 * programmes to score, and one for somebody with nothing to score at all,
 * whose review is their own overall comment.
 *
 * `wide` is the laptop's sentence and `narrow` the phone's, which is shorter.
 * Pure, so the tests execute it.
 */
export function hiddenReviewsLine(
  until: ReviewPayload["review"]["others"]["until"],
): { wide: string; narrow: string } {
  const admin = "An admin can turn them on.";
  if (until?.needs === "overall-comment") {
    return {
      wide: `Hidden until you save an overall comment of your own. ${admin}`,
      narrow: "Hidden until you save an overall comment.",
    };
  }
  if (until?.needs === "scores" && !until.here && until.elsewhere.length > 0) {
    const programmes = listInWords(until.elsewhere);
    return {
      wide: `Hidden until you have scored their answers for ${programmes} too. ${admin}`,
      narrow: `Hidden until you score ${programmes} too.`,
    };
  }
  return { wide: `Hidden on a first review. ${admin}`, narrow: `Hidden. ${admin}` };
}
