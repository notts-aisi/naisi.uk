/**
 * THE WORDS OF A PROGRAMME'S PEOPLE IN GROUPS, in one place.
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
/**
 * The same way to Publish's own page, for the programme's lead: an admin
 * presses it, and the page shows the lead what a press sends. The
 * Overview's checklist says the same (`PUBLISH_LINK_LEAD`).
 */
export const PUBLISH_GROUPS_LEAD = "What Publish sends…";

/** The way to Publish's own page beside the Groups tab's views, as each reader is shown it: one rule for every view that draws it. */
export function publishLinkWords(viewer: "admin" | "lead"): string {
  return viewer === "admin" ? PUBLISH_GROUPS : PUBLISH_GROUPS_LEAD;
}

export const TO_PLACE = "To place";

/** The toolbar's choice of how the board is shown, kept in the address. */
export const SHOW_AS = "Show as";
export const COLUMNS = "Columns";
export const RINGS = "Rings";

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
 * Over the board once the groups are published: "2 moved since they were
 * told: Ana and Raj. Publish to email them their new group." First names, in
 * the board's order. The link is "Publish to email them". Somebody moved back
 * to the group they were told about is not in it.
 */
export function movedSinceWords(firstNames: readonly string[], admin = true): { lead: string; link: string } {
  const names =
    firstNames.length <= 1
      ? (firstNames[0] ?? "")
      : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
  const them = firstNames.length === 1 ? "them" : "each of them";
  return {
    lead: `${firstNames.length} moved since they were told: ${names}. They see their new group now.`,
    // Only an admin publishes: the programme's lead is told who does.
    link: admin ? `Publish to email ${them} about it` : `An admin publishes to email ${them} about it`,
  };
}

/**
 * Over the board once the groups are published: "3 placed since you
 * published: Ana, Raj and Tom. Publish to tell them." First names, in the
 * board's order. The link is "Publish to tell them".
 */
export function placedSinceWords(firstNames: readonly string[], admin = true): { lead: string; link: string } {
  const names =
    firstNames.length <= 1
      ? (firstNames[0] ?? "")
      : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
  // Only an admin publishes: the programme's lead did not, and is told who does.
  return admin
    ? { lead: `${firstNames.length} placed since you published: ${names}.`, link: "Publish to tell them" }
    : { lead: `${firstNames.length} placed since the groups were published: ${names}.`, link: "An admin publishes to tell them" };
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

/**
 * Why the allocate route did not move somebody, from its reason's code, in a
 * sentence: "Pat Doe wasn’t moved: Group A is full." A move made mid-term
 * that its own save refused carries the server's sentence (`words`): "Pat
 * Doe wasn’t moved. Group F has already met for week 3, ..."
 */
export function notMovedWords(name: string, where: string, reason: string, words?: string): string {
  if (words) return `${name} wasn’t moved. ${words}`;
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
              : reason === "failed"
                ? "the move couldn’t be saved. Reload the board to see where they are."
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
/** The same, for the programme's lead, who places people and whom an admin publishes for. */
export const BEFORE_PUBLISH_LEAD =
  "People see their group only when an admin publishes. Until then, moving people emails nobody.";

/**
 * The note once it has been. Somebody told their group is never hidden by a
 * move: they see the new one at once, and the next Publish tells them.
 */
export const AFTER_PUBLISH =
  "People see their group only when you publish. Somebody told their group sees a move at once, and your next publish emails them that they have moved. Anybody you place who hasn’t been told sees nothing until you publish again.";
/** The same, for the programme's lead. */
export const AFTER_PUBLISH_LEAD =
  "People see their group only when an admin publishes. Somebody told their group sees a move at once, and the next publish emails them that they have moved. Anybody you place who hasn’t been told sees nothing until an admin publishes again.";

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

/**
 * When the run has no groups, for an admin and the lead alike: groups are
 * added on the Times view, and the older run editor is not where this tab
 * sends anybody.
 */
export const NO_GROUPS = "This run has no groups yet. Add them on the Times view.";

export const GO_TO_TIMES = "Go to Times";
export const LOADING = "Loading the groups…";
export const RETRY = "Try again";

/** The board could not be read: no connection, or the server failed. */
export const LOAD_FAILED = "The groups couldn’t be loaded. Check your connection.";

/**
 * Why the board could not be read, from the allocation route's status: the
 * route's own refusal in a sentence for somebody signed out, refused or
 * asking about a run that is gone, and for everything else (no connection,
 * a server error) `LOAD_FAILED`. Never the route's raw word ("Forbidden").
 */
export function loadFailedWords(status: number | undefined): string {
  if (status === 401) return "You’re signed out. Sign in again to see the groups.";
  if (status === 403) return "Only this programme’s lead or an admin can see its groups.";
  if (status === 404) return "The course run is no longer on the site.";
  return LOAD_FAILED;
}

// ---------------------------------------------------------------------------
// The person's panel
// ---------------------------------------------------------------------------

/** "Open Daniel’s page". */
export function openPageWords(firstName: string): string {
  return `Open ${firstName}’s page`;
}

/** Under the chart, for a week they marked. */
export const CHART_KEY =
  "Shaded: the times they marked on their application. A bar is a group’s session: green where they can make all of it, red where they can’t. Press a bar to move them there.";
export const MOVE_HERE = "Move here";
export const MOVE_HERE_CANT = "Move here (can’t make it)";

/** A bar's name for a screen reader: "Move Daniel Park to Group A, Mon 6pm". */
export function barLabel(name: string, title: string): string {
  return `Move ${name} to ${title.split(":")[0]}`;
}

export const PLACING = "Placing";
export const NOT_IN_A_GROUP_PICK = "Not in a group. Pick a group on the chart, or another column, to move them.";

/** Under the name of somebody who facilitates a group and holds no place on the run. */
export const FACILITATING_NO_PLACE = "Facilitating, with no place on the run";
export const INVITED = "Invited";

/** On Rings, somebody invited and not answered yet, among the people to place: "Chloe Martin · invited". */
export function invitedTrayWords(name: string): string {
  return `${name} · invited`;
}

/** "Chloe hasn’t accepted the invitation yet, so they can’t be placed." */
export function notAcceptedWords(firstName: string): string {
  return `${firstName} hasn’t accepted the invitation yet, so they can’t be placed.`;
}

/** "Their reason: “It clashes with a lab I can’t move.”" */
export function theirReasonWords(reason: string): string {
  return `Their reason: “${reason}”`;
}

/** The panel's own close button. */
export const CLOSE_PANEL = "Close";
/** While the panel's read of when people are free is on its way. */
export const PANEL_LOADING = "Loading when they’re free…";
/** The panel's read of when people are free did not come back: no connection, or the server failed. */
export const PANEL_FAILED = "When they’re free couldn’t be loaded. Check your connection.";

/**
 * Why the panel's read did not come back, from its status, as the board says
 * it: signed out, or no longer this programme's lead (the read answers a role
 * that has gone as a 403, or as a 404 like a programme that is not there);
 * anything else, `PANEL_FAILED`.
 */
export function panelFailedWords(status: number | undefined): string {
  if (status === 401) return loadFailedWords(401);
  if (status === 403 || status === 404) return loadFailedWords(403);
  return PANEL_FAILED;
}

/** Under a week only admins may see: the programme's lead may not read this person's application. */
export const ADMINS_ONLY_FOOT = "Only admins see this.";

// ---------------------------------------------------------------------------
// Select several, before the groups go out
// ---------------------------------------------------------------------------

/** The toolbar's way into choosing several people, shown only before the groups go out. */
export const SELECT_SEVERAL = "Select several";
export const MOVE_TO = "Move to…";
export const CLEAR = "Clear";
export const DONE = "Done";
/** The bar before anybody is chosen. */
export const NONE_SELECTED = "Nobody selected yet.";

/** "Daniel, Raj and Tom". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The bar: "3 selected: Daniel, Raj and Tom". First names, in the board's order. */
export function selectedWords(firstNames: readonly string[]): string {
  return firstNames.length === 0 ? NONE_SELECTED : `${firstNames.length} selected: ${namesList(firstNames)}`;
}

/** A card's box, for a screen reader: "Select Daniel Park". */
export function selectLabel(name: string): string {
  return `Select ${name}`;
}

/** Over the groups in "Move to…": "Move Daniel, Raj and Tom to". */
export function moveChosenTitle(firstNames: readonly string[]): string {
  return `Move ${namesList(firstNames)} to`;
}

/** Under a group in "Move to…": "Room for 2". */
export function roomForWords(room: number): string {
  return `Room for ${room}`;
}

/**
 * After a move of several: "Daniel, Raj and Tom are in Group B. Nobody was
 * emailed." Back to To place, they are no longer in a group.
 */
export function movedTogetherWords(firstNames: readonly string[], groupName: string | null): string {
  const are = firstNames.length === 1 ? "is" : "are";
  const where = groupName === null ? `${are} no longer in a group` : `${are} in ${groupName}`;
  return `${namesList(firstNames)} ${where}. Nobody was emailed.`;
}

/**
 * Why a move of several moved nobody, in one sentence naming who stopped it:
 * a group without room for them all ("Group A has room for 2 of the 3. Pick
 * fewer, or another group."), or the first person who could not be moved,
 * by full name, and why. `groupName` is the group they were to go to.
 */
export function stoppedTogetherWords(
  stop: { reason: string; room?: number; wanting?: number },
  name: string,
  groupName: string,
): string {
  switch (stop.reason) {
    case "group-full":
      return stop.room && stop.room > 0
        ? `${groupName} has room for ${stop.room} of the ${stop.wanting ?? stop.room + 1}. Pick fewer, or another group.`
        : `${groupName} is full. Pick another group.`;
    case "group-archived":
      return `${groupName} has been archived, so nobody was moved.`;
    case "group-not-found":
      return `${groupName} is no longer on the run, so nobody was moved.`;
    case "facilitates-another-group":
      return `${name} facilitates another group and sits in it, so nobody was moved.`;
    case "not-accepted":
      return `${name} no longer holds a place on the run, so nobody was moved.`;
    case "published":
      return "The groups have gone out since this page loaded, so nobody was moved.";
    default:
      return `${name} can’t be moved this way, so nobody was moved.`;
  }
}
