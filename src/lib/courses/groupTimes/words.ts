/**
 * THE WORDS OF CHOOSING GROUP TIMES (board st-times), in one place: the
 * controls beside the times picture, the dialogs they open, and the two
 * routes' refusals. No imports, so the dialogs in the browser and the routes
 * on the server say the same thing in the same words.
 *
 * The board draws "Use for a group", "Change" and "Add a group" and their
 * accessible names ("Use Tue 7pm for a group", "Change Group A’s time"),
 * copied exactly with their apostrophes. Everything else (the dialogs, what
 * a change of a told group says, every refusal) is not drawn: it is written
 * in the same voice and listed in the build notes for the boards' designers
 * to confirm.
 *
 * Every name, day and time is a slot filled from a record. No gendered
 * pronoun, and no dash of either kind.
 */

// ---------------------------------------------------------------------------
// The controls the board draws
// ---------------------------------------------------------------------------

export const USE_FOR_A_GROUP = "Use for a group";
export const CHANGE = "Change";
export const ADD_A_GROUP = "Add a group";

/** "Use Tue 7pm for a group": the button's accessible name, the board's. */
export function useForAGroupLabel(when: string): string {
  return `Use ${when} for a group`;
}

/** "Change Group A’s time": the button's accessible name, the board's. */
export function changeLabel(groupName: string): string {
  return `Change ${groupName}’s time`;
}

// ---------------------------------------------------------------------------
// The dialogs
// ---------------------------------------------------------------------------

/** The title of the dialog "Use for a group" opens, which is the button's own name. */
export const useTitle = useForAGroupLabel;
/** The title of the dialog "Change" opens, which is the button's own name. */
export const changeTitle = changeLabel;
export const ADD_TITLE = ADD_A_GROUP;

export const WHICH_GROUP = "Which group";
export const A_NEW_GROUP = "A new group";

/** One existing group as "Use for a group" offers it: "Group C, now Wed 1pm". */
export function groupChoiceWords(groupName: string, now: string | null): string {
  return now ? `${groupName}, now ${now}` : `${groupName}, no time yet`;
}

export const DAY = "Day";
export const STARTS = "Starts at";
export const STARTS_HINT = "Like 6pm or 6:30pm.";
export const NAME = "Name";
export const LENGTH = "Sessions last";
export const PLACES = "Places";
export const PLACES_HINT = "Leave it empty for no limit.";
export const CANCEL = "Cancel";
/** The one button of a dialog with nothing to confirm. */
export const CLOSE = "Close";

/** The confirm of "Use for a group": "Use Tue 7pm". */
export function useConfirm(when: string): string {
  return `Use ${when}`;
}
export const CHANGE_CONFIRM = "Change the time";
export const ADD_CONFIRM = "Add the group";
export const SAVING = "Saving…";

/** What a change does and does not do, under the fields. Nobody is emailed by any of it. */
export const EMAILS_NOBODY =
  "This changes the group’s weekly time and emails nobody. Publish tells people their group’s time.";

/** The same, for a new group. */
export const ADDS_EMAILS_NOBODY =
  "This adds the group and emails nobody. Publish tells people their group and when it meets.";

/** Under a day and time the picture counts: "18 of 27 can make it". */
export function canMakeHint(count: number, said: number): string {
  return `${count} of ${said} can make it`;
}

/** Said when there is a told group "Use for a group" leaves off its list. */
export const TOLD_LEFT_OUT =
  "Groups Publish has told their time aren’t listed. To move one week’s session, use Change a session.";

// ---------------------------------------------------------------------------
// A group whose time Publish has told
// ---------------------------------------------------------------------------

/**
 * Why a group's time cannot change from here once Publish has told somebody
 * it: the people placed in it, or its facilitators. Said by the route, and
 * by the dialog before anything is pressed.
 */
export function toldWords(groupName: string): string {
  return `Publish has told people when ${groupName} meets, so its time can’t change here. To move one week’s session, use Change a session.`;
}

/** The way there: the Sessions view of the Groups tab. */
export const CHANGE_A_SESSION = "Change a session";

// ---------------------------------------------------------------------------
// What a press came to
// ---------------------------------------------------------------------------

/** "Group A now meets on Tuesdays at 7pm." `meets` is "Tuesdays at 7pm". */
export function changedWords(groupName: string, meets: string): string {
  return `${groupName} now meets on ${meets}.`;
}

/** "Group E is added. It meets on Tuesdays at 7pm." `meets` is "Tuesdays at 7pm". */
export function addedWords(groupName: string, meets: string): string {
  return `${groupName} is added. It meets on ${meets}.`;
}

// ---------------------------------------------------------------------------
// The routes' refusals, each a sentence a person can act on
// ---------------------------------------------------------------------------

export const REFUSAL = {
  body: "Expected a JSON object body.",
  weekday: "Pick the day the group meets.",
  start: "Say when the group starts, like 6pm or 6:30pm.",
  from: "Say which time the group had when this was opened.",
  name: "Give the group a name.",
  nameLong: "A group’s name can be at most 80 characters.",
  length: "Pick how long its sessions last from the lengths offered.",
  places: "Places must be a whole number, or left empty for no limit.",
  notYoursChange: "Only the programme’s lead and admins can change a group’s time.",
  notYoursAdd: "Only the programme’s lead and admins can add a group.",
  noProgramme: "That programme is not on this form.",
  noRun: "This programme doesn’t name a course run yet, so it has no groups.",
  runGone: "The course run this programme names is no longer on the site.",
  noGroup: "That group isn’t one of this programme’s groups.",
  archived: "That group has been archived, so its time can’t change.",
  stale: "That group’s time has changed since this was opened. Close it and open it again.",
  tooMany: "This run has as many groups as it can hold.",
} as const;

/** "Group C is already one of this run’s groups. Give the new one another name." */
export function nameTakenWords(name: string): string {
  return `${name} is already one of this run’s groups. Give the new one another name.`;
}
