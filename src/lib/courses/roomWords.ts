/**
 * A GROUP'S ROOM, set on the Groups tab beside its campus: the words of the
 * field, what saving it says, and what the route refuses. The room is where
 * the group meets every week (`courseGroups.session.location`), the same
 * field as the run editor's group card's "Location". "Change a session"
 * changes one week's room, never this.
 */

export const ROOM = "Room";
export const ROOM_PLACEHOLDER = "e.g. Portland A21";
export const ROOM_HINT =
  "Where the group meets every week. Nobody is emailed: people see it on their programme page and in their calendar. Change a session changes one week.";
export const ROOM_SAVE = "Save room";
export const ROOM_SAVING = "Saving…";

/** The field's accessible name. */
export function roomControlLabel(groupName: string): string {
  return `${groupName}: room every week`;
}

/** What saving says. */
export function roomSavedWords(groupName: string, room: string): string {
  return room ? `${groupName} meets in ${room} every week.` : `${groupName} has no room now.`;
}

/**
 * The room route's refusals. Where the campus route refuses the same thing,
 * the sentence is its own (`CAMPUS_REFUSAL`), so the two controls beside each
 * other say one thing one way.
 */
export const ROOM_REFUSAL = {
  body: "Expected a JSON object body.",
  notText: "Type the room, or leave it empty for none.",
  tooLong: "Keep the room to 200 characters or fewer.",
  notYours: "Only the programme’s lead and admins can change a group’s room here.",
  noProgramme: "That programme is not on this form.",
  noRun: "This programme doesn’t name a course run yet, so it has no groups.",
  runGone: "The course run this programme names is no longer on the site.",
  noGroup: "That group isn’t one of this programme’s groups.",
  archived: "That group has been archived, so its room can’t change.",
} as const;
