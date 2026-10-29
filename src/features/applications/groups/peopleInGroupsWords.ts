/**
 * THE WORDS OF A PROGRAMME'S PEOPLE IN GROUPS (board st-groups), in one place.
 *
 * The board's own words are kept exactly, apostrophes included ("To place",
 * "7 of 8", "Full", "No room yet", "Hasn’t said when they’re free", "Fits A,
 * B, D", "Not free Thu 6pm", "Coming", "Invited Tue 27 Oct · fits C", "Gave
 * their place back (2)", "4 still to place", "Publish groups…", the line over
 * the board and the note under it). Every name, count, day, time and room in
 * them is a slot filled from a record. Words the board does not draw (a
 * group with no time or no facilitator, somebody holding a place who is not
 * on the run's list yet, the note once Publish has been pressed, taking
 * somebody off the run) are written in the same voice and listed in the
 * build notes for the boards' designers to confirm.
 *
 * No gendered pronoun, and no dash of either kind. Pure, so the board in the
 * browser and the tests read the same sentences.
 */

/** "30 holding a place · 26 in a group · 4 to place · 2 invited", and somebody not on the run yet when there is. */
export function boardLine(counts: {
  holding: number;
  inAGroup: number;
  toPlace: number;
  notOnTheRun: number;
  invited: number;
}): string {
  const parts = [
    `${counts.holding} holding a place`,
    `${counts.inAGroup} in a group`,
    `${counts.toPlace} to place`,
    `${counts.invited} invited`,
  ];
  if (counts.notOnTheRun > 0) parts.push(`${counts.notOnTheRun} not on the run yet`);
  return parts.join(" · ");
}

/** The line before decisions have gone out, when nobody holds a place yet. */
export const NOBODY_YET = "Nobody holds a place until decisions go out.";

/** "4 still to place", beside "Publish groups…". */
export function stillToPlace(count: number): string {
  return `${count} still to place`;
}

export const PUBLISH_GROUPS = "Publish groups…";

export const TO_PLACE = "To place";

/** "7 of 8", or "7" for a group with no limit. */
export function seatsWords(count: number, capacity: number | null): string {
  return capacity === null ? String(count) : `${count} of ${capacity}`;
}

export const FULL = "Full";
export const NO_ROOM_YET = "No room yet";
export const NO_TIME_YET = "No time yet";
export const NO_FACILITATOR_YET = "No facilitator yet";

/** "Rahul and Sofia". */
export function facilitatorsWords(firstNames: readonly string[]): string {
  if (firstNames.length <= 1) return firstNames[0] ?? NO_FACILITATOR_YET;
  return `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
}

// ---------------------------------------------------------------------------
// A card's marks
// ---------------------------------------------------------------------------

export const HASNT_SAID = "Hasn’t said when they’re free";
export const NOT_ON_FILE = "When they’re free is no longer on file";
export const COMING = "Coming";
export const GAVE_PLACE_BACK = "Gave their place back";

/** "Fits A, B, D". */
export function fitsWords(tags: readonly string[]): string {
  return `Fits ${tags.join(", ")}`;
}

/** "Fits none of the 4 times", as the People tab says it. */
export function fitsNoneWords(times: number): string {
  return `Fits none of the ${times === 1 ? "1 time" : `${times} times`}`;
}

/** "Not free Thu 6pm": sitting in a group whose session they cannot make. */
export function notFreeWords(when: string): string {
  return `Not free ${when}`;
}

/** "Invited Tue 27 Oct · fits C". The day is when they were invited. */
export function invitedWords(on: string | null, fits: readonly string[]): string {
  const invited = on ? `Invited ${on}` : "Invited";
  return fits.length > 0 ? `${invited} · fits ${fits.join(", ")}` : invited;
}

/**
 * Once the groups are published, on the card of somebody placed in a group
 * whom Publish has not told yet: they see nothing of it until the next press.
 */
export const NOT_TOLD_YET = "Not told yet";

/**
 * Over the board once the groups are published: "3 placed since you
 * published: Ana, Raj and Tom. Publish to tell them." First names, in the
 * board's order. The link is "Publish to tell them".
 */
export function placedSinceWords(firstNames: readonly string[]): { lead: string; link: string } {
  const names =
    firstNames.length <= 1
      ? (firstNames[0] ?? "")
      : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
  return { lead: `${firstNames.length} placed since you published: ${names}.`, link: "Publish to tell them" };
}

/** What became of somebody's group email, when it did not go. */
export const EMAIL_HELD = "Email held";
export const EMAIL_STOPPED = "Not emailed: do-not-email list";

// ---------------------------------------------------------------------------
// The move menu
// ---------------------------------------------------------------------------

/** The "..." button's name, the board's. */
export function moveLabel(name: string): string {
  return `Move ${name} to another group`;
}

/** Its tooltip, the board's. */
export const MOVE_TITLE = "Move to…";

/** A group in the menu: "Group A · 7 of 8". */
export function moveOptionWords(name: string, count: number, capacity: number | null): string {
  return `${name} · ${seatsWords(count, capacity)}`;
}

/** The menu's last choice, for a seat still on the run. */
export const TAKE_OFF = "Take off the run…";

/** The confirmation of taking somebody off the run. */
export function takeOffConfirm(name: string, where: string, programmeName: string): string {
  return (
    `Take ${name} off the run?\n\n` +
    `Their seat in ${where} is freed and their place on ${programmeName} is given back. Nobody is emailed.`
  );
}

/**
 * Why the allocate route did not move somebody, from its reason's code, in a
 * sentence: "Pat Doe wasn’t moved: Group A is full."
 */
export function notMovedWords(name: string, where: string, reason: string): string {
  const why =
    reason === "group-full"
      ? `${where} is full.`
      : reason === "group-archived"
        ? `${where} has been archived.`
        : reason === "group-not-found"
          ? `${where} is no longer on the run.`
          : reason === "facilitates-another-group"
            ? "they facilitate another group, and somebody holding a place sits in the group they facilitate."
            : reason === "not-accepted"
              ? "their row on the run’s own list doesn’t say Accepted."
              : "the move was refused. Try again.";
  return `${name} wasn’t moved: ${why}`;
}

/** The drag handle's name. */
export function dragLabel(name: string): string {
  return `Drag ${name} to another group`;
}

// ---------------------------------------------------------------------------
// Under the board
// ---------------------------------------------------------------------------

/** "Gave their place back (2)". */
export function gaveBackTitle(count: number): string {
  return `Gave their place back (${count})`;
}

/** The note under the board before Publish has been pressed, the board's. */
export const BEFORE_PUBLISH = "People see their group only when you publish. Until then, moving people emails nobody.";

/** The note once it has been. */
export const AFTER_PUBLISH =
  "People see their group only when you publish. Somebody you move now sees nothing of the new one until you publish again, which tells them.";

/** Somebody holding a place who has not been handed over to the run, in the To place column. */
export function notOnTheRunWords(count: number, admin: boolean): string {
  const who = count === 1 ? "1 person holding a place isn’t" : `${count} people holding a place aren’t`;
  return `${who} on the run’s list yet, so they can’t be placed. ${
    admin ? "Hand them over on the Settings tab." : "An admin hands them over on the Settings tab."
  }`;
}

/** Said in an empty column. */
export const EMPTY_GROUP = "Nobody here yet. Use a card’s menu to move somebody in.";
export const EVERYONE_PLACED = "Everyone holding a place is in a group.";

/** When the run has no groups. */
export function noGroupsWords(admin: boolean): string {
  return admin
    ? "This run has no groups yet. Add them on the Times view, or in the run editor."
    : "This run has no groups yet. Add them on the Times view.";
}

export const GO_TO_TIMES = "Go to Times";
export const LOADING = "Loading the groups…";
export const RETRY = "Try again";
