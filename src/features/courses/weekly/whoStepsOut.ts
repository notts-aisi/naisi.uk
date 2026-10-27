/**
 * WHO STEPS OUT WHILE A GROUP ANSWERS THE SURVEY AT THE END (wk-lastweek-phone:
 * "Rahul and Sofia leave you 5 minutes for it and step out of the room").
 *
 * The facilitators who step out are the group's facilitators who hold no place
 * in it. A facilitator who holds a place in the group is one of its people:
 * they answer the same survey, so they stay. Who is which is the group's
 * roster route's answer and nothing else (`useGroupRoster`): somebody it lists
 * among the group's members as well as its facilitators holds a place there.
 * So the line and the group's own card ("Your group") always agree, and a
 * placement nobody has told is never read here, because the route lists it to
 * nobody but an admin.
 *
 * The reader is never named, in either list. Null while the group's names are
 * not known (not loaded, or could not be): a page then says nothing of who
 * steps out rather than guess.
 *
 * A default taken for Zach on 27 October 2026, listed in the build notes, with
 * the words for a group whose facilitators all hold a place in it listed for
 * the boards' designers to confirm (`endCardLastWeekWords`).
 *
 * Pure: no reads, no clock.
 */

type Person = { uid: string; displayName: string };

export type StepOut = {
  /** The group's facilitators who hold no place in it: they step out. */
  stepOut: Person[];
  /** Its facilitators who hold a place in it, the reader left out: they answer it too. */
  takePart: Person[];
};

export function whoStepsOut(
  roster: { group: unknown; facilitators: readonly Person[]; members: readonly Person[] },
  readerUid: string | null,
): StepOut | null {
  if (roster.group === null || roster.group === undefined) return null;
  const members = new Set(roster.members.map((person) => person.uid));
  const out: StepOut = { stepOut: [], takePart: [] };
  for (const person of roster.facilitators) {
    if (person.uid === readerUid) continue;
    (members.has(person.uid) ? out.takePart : out.stepOut).push(person);
  }
  return out;
}
