/**
 * "GAVE THEIR PLACE BACK": ONE ANSWER, FOR THE ALLOCATION BOARD AND FOR
 * PUBLISH.
 *
 * Somebody the term's application form put on a run can give their place
 * back on the form afterwards ("I can’t make it" on their application page).
 * Until Publish has told them their group, that changes nothing on the run:
 * their seat stays where it was put until somebody Removes it. Two things
 * then have to agree about them:
 *
 *  - THE BOARD: their card says "Gave their place back" (`cardFit` in
 *    `src/features/courses/allocationFit.ts`), and the Publish area says how
 *    many of the people placed and not told yet gave theirs back;
 *  - PUBLISH: its plan (`loadPublishPlan` in `./allocationPublish.ts`) leaves
 *    them out of the people it emails, so the count on the button, "Send a
 *    test to me" and the press itself never write to them, never count them
 *    and never stamp them as told.
 *
 * Both ask this function, of the same two facts:
 *
 *  - whether the person still holds the place that put them on the run,
 *    which the server works out from the form each time the board, the test
 *    or the press is read (`formPlaceFactsFor` in
 *    `src/lib/applications/handover/board.ts`, which asks `holdsPlaceOn`).
 *    Somebody with no such fact (they applied to the run itself, or the
 *    facts were not read) has given nothing back, as a card with no facts
 *    says nothing;
 *  - whether staff have put them back on the run since they left it
 *    (`putBackAt` on their enrolment, which the allocate route writes).
 *    Leaving gives the place on the form back, and putting somebody back
 *    leaves it given back; but putting them back is a deliberate act on a
 *    card that said they had left, so from then on they are not somebody
 *    who gave their place back, and the next Publish tells them their group.
 *
 * Pure, with no import, so the card in the browser and the plan on the
 * server ask the same function. A second reading of either fact is what this
 * module exists to prevent: `tests/course-publish-place-given-back.test.mjs`
 * lists every file that reads them.
 */

/** What the server says about a person's place on the form: the field this reads. */
export type PlaceOnTheForm = { holdsPlace: boolean };

/** What this reads of their seat on the run: whether staff put them back on it after they left. */
export type SeatOnTheRun = { putBack: boolean };

/** True when their card says "Gave their place back". */
export function gaveTheirPlaceBack(place: PlaceOnTheForm | null | undefined, seat: SeatOnTheRun): boolean {
  if (place === null || place === undefined) return false;
  return place.holdsPlace === false && !seat.putBack;
}
