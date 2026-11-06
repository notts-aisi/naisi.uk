/**
 * WHAT THE PAGES THAT MOVE PEOPLE SAY ABOUT SOMEBODY WHO ALREADY KNOWS THEIR
 * GROUP, in one place: the allocation board, a programme's People in groups
 * and Circles all move people through the allocate route
 * (`POST /api/courses/runs/[runId]/allocate`).
 *
 * A move sends nothing by itself. Somebody Publish has told about a group is
 * never hidden by one: they see the group they are in now at once, and while
 * it is not the group they were told about (`movedSinceTold` in
 * `src/lib/firestore/courseEnrolments.ts`) the next Publish emails them
 * "You’ve moved". Moved back, nobody needs telling. So their card says they
 * were moved since they were told and will be emailed at the next Publish,
 * and the sentence a move leaves says what it did.
 *
 * A person is named and never given a gendered pronoun. No dash of either
 * kind. Pure, with no import, so the pages and the tests read the same words.
 */

/** What a card says: moved since they were told, and emailed at the next Publish. `from` is the group they were told about. */
export function movedCardWords(from: string | null): string {
  return from ? `Moved from ${from}: emailed at the next Publish` : "Moved since told: emailed at the next Publish";
}

/** The longer words behind it, where a page has room for them. */
export const MOVED_CARD_WHY =
  "They were told about another group, and see the one they are in now. The next Publish emails them “You’ve moved”, with its details.";

/**
 * The sentence a move leaves when its person already knew their group, by
 * where it put them: `to` is the group they are in now (null for no group),
 * `told` the one they were told about (null when it has gone). Null for
 * somebody nobody has told, of whom a move says nothing.
 */
export function movedSentence(input: {
  name: string;
  /** The id of the group they were told about, or null when they have not been told. */
  toldGroupId: string | null;
  toldGroupName: string | null;
  /** Where the move put them: a group's id and name, or null for no group. */
  to: { id: string; name: string } | null;
}): string | null {
  const { name, toldGroupId, toldGroupName, to } = input;
  if (toldGroupId === null) return null;
  if (to === null) {
    return toldGroupName
      ? `${name} is in no group now, and still sees the programme. Put back in ${toldGroupName}, nobody needs telling; in any other group, the next Publish emails them about it.`
      : `${name} is in no group now, and still sees the programme. Placed in a group, the next Publish emails them about it.`;
  }
  if (to.id === toldGroupId) return `${name} is back in ${to.name}, the group they were told about, so nobody needs telling.`;
  return `${name} is in ${to.name} now and sees it straight away. The next Publish emails them that they have moved.`;
}

/**
 * After moving several people into one group at once: how many of them knew
 * another group, who see this one straight away and are emailed by the next
 * Publish. Null for none.
 */
export function movedBatchSentence(count: number, to: string): string | null {
  if (count <= 0) return null;
  return count === 1
    ? `1 of them was told about another group: they see ${to} straight away, and the next Publish emails them that they have moved.`
    : `${count} of them were told about another group: they see ${to} straight away, and the next Publish emails each of them that they have moved.`;
}
