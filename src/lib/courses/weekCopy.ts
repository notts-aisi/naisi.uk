import { ownGroupForWeek, type CourseEnrolmentDoc, type GroupFromWeek } from "@/lib/firestore/courseEnrolments";

/**
 * WHOSE COPY OF A WEEK ONE PERSON WORKS IN, AND IS READ ON: the group their
 * place belonged to in that week (`ownGroupForWeek`), never the group they
 * are in now for a week they spent elsewhere. Somebody moved from Group C to
 * Group F from week 3 works in, and is read on, Group C's copy of weeks 1 and
 * 2 and Group F's from week 3, so an answer keeps the question as they saw
 * it, and nothing written vanishes. A new facilitator who gives feedback on
 * an old week gives it on that old copy.
 *
 * THE ONE HELPER. Every save route, the member's own week page (through the
 * overview's `forkedWeekGroups`), exercise submit, my-exercises, the reading
 * views and the feedback gate ask it, so they agree on every week.
 *
 * A WEEK SPENT IN ANOTHER GROUP is that group's copy WHETHER OR NOT THE GROUP
 * STILL MEETS: archiving the group somebody was moved out of keeps their
 * answers under the questions they answered. That group's own copy of the
 * week when it has one, and the run's own week when it has none, as for any
 * group (`resolveWeekDoc`). A group's document is never deleted while a
 * place names it (the rules refuse every delete, and destroying a run deletes
 * every place before its groups), so there is always a copy to read.
 *
 * A WEEK IN THE GROUP THEY ARE IN NOW is `now`: the caller's own answer for
 * the group they are in now, exactly as it read it before anybody could be
 * moved from a week (their placement's group while it meets, say, or the one
 * group they facilitate). With no record of groups by week that is every
 * week, so every caller reads exactly what it read before.
 *
 * Pure.
 */
export function copyGroupIdFor(
  place: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek">,
  weekNumber: number,
  now: string | null,
): string | null {
  const that = ownGroupForWeek(place, weekNumber);
  if (!that || that === place.groupId) return now;
  return that;
}

/**
 * One person's copies, as a reader that lists people keeps them beside the
 * group it reads them on (`readsGroupId`): the place's record of groups by
 * week, every group in it kept whether or not it still meets
 * (`copyGroupIdFor` says why). Null with no record, so nothing is carried for
 * anybody nobody has moved. The second argument is no longer read, and is
 * kept so that existing callers stay as they are.
 */
export function copiesOf(
  place: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek">,
  _liveGroups?: readonly { id: string }[],
): GroupFromWeek[] | null {
  const record = place.groupsByWeek;
  if (!record || record.length < 2 || !place.groupId) return null;
  return record.map((entry) => ({ groupId: entry.groupId, fromWeek: entry.fromWeek }));
}

/**
 * The group whose copy of ONE week a reader reads one person on: their
 * copies' group for that week (`copiesOf`), else `readsGroupId`, as always.
 */
export function readsGroupIdFor(
  person: { readsGroupId: string | null; readsCopies?: readonly GroupFromWeek[] | null },
  weekNumber: number,
): string | null {
  if (!person.readsCopies || !person.readsGroupId) return person.readsGroupId;
  return ownGroupForWeek({ groupId: person.readsGroupId, groupsByWeek: [...person.readsCopies] }, weekNumber) ?? person.readsGroupId;
}
