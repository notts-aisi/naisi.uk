import { gaveTheirPlaceBack, type PlaceOnTheForm } from "@/lib/courses/placeGivenBack";
import { enrolmentIsPutBack, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";

/**
 * DID THIS PERSON GIVE THEIR PLACE BACK, AS TAKING THEM OFF ASKS IT: the
 * board's one answer (`gaveTheirPlaceBack`), from the facts the cards are
 * drawn from (`formPlaceFactsFor`) and whether staff put them back on the run
 * since (`enrolmentIsPutBack`).
 *
 * Asked by the remove route (their email says their place has ended "as you
 * asked", and Course run's take-off closes their row only for them) and by
 * Course run's list (`loadRunPanel`, whether it offers "Take … off the
 * run…"), so the button is offered exactly where the route will go through.
 *
 * Pure: no reads.
 */
export function gaveBackOnTheRun(
  place: PlaceOnTheForm | null | undefined,
  seat: Pick<CourseEnrolmentDoc, "putBackAt" | "status">,
): boolean {
  return gaveTheirPlaceBack(place, { putBack: enrolmentIsPutBack(seat) });
}
