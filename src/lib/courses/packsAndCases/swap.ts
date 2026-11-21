import { drawCaseOf, type DrawTalk } from "./model";
import { ownCaseGivenByWords, swapAcrossPicksWords, swapNotedWords } from "./words";

/**
 * "SWAP TWO PEOPLE" ON THE DRAW swaps what a facilitator gives two people
 * (the packs given out and the cases), never a pack somebody picked. So a
 * swap is refused, in one sentence, when it would hand somebody a case their
 * own list does not offer:
 *  - a case that follows a pick, between two people who have not picked the
 *    same pack ("Chloe and Kofi haven’t picked the same pathway, so their
 *    cases can’t be swapped.");
 *  - a case that follows a facilitator's own pick this page does not show
 *    ("Only Farah, the programme’s lead or an admin can give Farah a case.");
 *  - a case with a content note, to somebody whose row is not ticked "Asked
 *    for this one".
 *
 * Pure, so the page's swap and its tests ask the same rule; the route's own
 * check refuses the same saves whichever way they arrive.
 */
export type SwapRows = {
  talks: readonly DrawTalk[];
  /** The Choose ones each person picks that the cases follow. */
  pickedIds: ReadonlySet<string>;
  titleOf: (chooseOneId: string) => string;
  nameOf: (uid: string) => string;
  /** The case each person holds on the page now, by talk. */
  caseOf: (uid: string, talkId: string) => string | null;
  pickOf: (uid: string, chooseOneId: string) => string | null;
  askedOf: (uid: string, talkId: string) => boolean;
  /** A row whose own pick this page does not show. */
  hidden: (uid: string) => boolean;
};

export function swapRefusedWords(a: string, b: string, rows: SwapRows): string | null {
  const nameA = rows.nameOf(a);
  const nameB = rows.nameOf(b);
  for (const talk of rows.talks) {
    const caseA = rows.caseOf(a, talk.id);
    const caseB = rows.caseOf(b, talk.id);
    if (talk.keyedBy !== null && rows.pickedIds.has(talk.keyedBy)) {
      if (rows.hidden(a)) return ownCaseGivenByWords(nameA);
      if (rows.hidden(b)) return ownCaseGivenByWords(nameB);
      const pickA = rows.pickOf(a, talk.keyedBy);
      const pickB = rows.pickOf(b, talk.keyedBy);
      if ((caseA || caseB) && (!pickA || pickA !== pickB)) return swapAcrossPicksWords(nameA, nameB, rows.titleOf(talk.keyedBy));
    }
    if (drawCaseOf(talk, caseA)?.drawable === false && !rows.askedOf(b, talk.id)) return swapNotedWords(nameA, nameB);
    if (drawCaseOf(talk, caseB)?.drawable === false && !rows.askedOf(a, talk.id)) return swapNotedWords(nameB, nameA);
  }
  return null;
}
