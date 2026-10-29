/**
 * THE WORDS OF A GROUP'S CAMPUS: its three names, the control that sets it,
 * and how a page or an email says where a group meets when it has a campus
 * and no room yet.
 *
 * The three campuses are Zach's, in his words (29 Oct 2026, "the only
 * options"): University Park, Jubilee and Online. No board draws the control:
 * its words are written in the boards' voice and listed in the build notes
 * for the boards' designers to confirm.
 *
 * Pure, with no imports but the campus type, so the group editor and the
 * Sessions view in the browser, the server pages, the calendar and the tests
 * all read the same words.
 */

import type { GroupCampus } from "./campus";

/** Each campus as a page names it. */
export const CAMPUS_LABEL: Record<GroupCampus, string> = {
  "university-park": "University Park",
  jubilee: "Jubilee",
  online: "Online",
};

/** The control's label, in the run editor's group card and on the Sessions view. */
export const CAMPUS = "Campus";

/** The control's first choice: a group whose campus nobody has chosen (every group made before campuses). */
export const CAMPUS_NOT_CHOSEN = "Not chosen yet";

/** Under the control in the run editor's group card. */
export const CAMPUS_HINT = "Shown beside the group’s time, and in place of the room until it has one.";

/** The accessible name of the control on the Sessions view: "Campus for Group B". */
export function campusControlLabel(groupName: string): string {
  return `Campus for ${groupName || "this group"}`;
}

/** What the Sessions view says once a campus is saved: "Group B meets at Jubilee." */
export function campusSavedWords(groupName: string, campus: GroupCampus | null): string {
  const name = groupName || "The group";
  if (campus === null) return `${name} has no campus chosen now.`;
  if (campus === "online") return `${name} meets online.`;
  return `${name} meets at ${CAMPUS_LABEL[campus]}.`;
}

/** Saving, on the Sessions view's control. */
export const CAMPUS_SAVING = "Saving…";

/**
 * WHERE A GROUP MEETS, FOR AN EMAIL'S SENTENCE (the "Your group" email's
 * campus line, which the coordinator wires): "on University Park campus",
 * "on Jubilee campus", "online". Written to follow "Your group meets".
 */
export function campusWhereWords(campus: GroupCampus): string {
  return campus === "online" ? "online" : `on ${CAMPUS_LABEL[campus]} campus`;
}

/** "Your group meets on Jubilee campus.": the email's whole line, for a group with a campus. */
export function campusSentence(campus: GroupCampus): string {
  return `Your group meets ${campusWhereWords(campus)}.`;
}

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

/**
 * The campus route's refusals. Where the times route refuses the same thing,
 * the sentence is its own (`REFUSAL` in `./groupTimes/words.ts`), so the two
 * controls of the Groups tab say one thing one way.
 */
export const CAMPUS_REFUSAL = {
  body: "Expected a JSON object body.",
  notACampus: "Choose University Park, Jubilee or Online, or no campus.",
  notYours: "Only the programme’s lead and admins can change a group’s campus.",
  noProgramme: "That programme is not on this form.",
  noRun: "This programme doesn’t name a course run yet, so it has no groups.",
  runGone: "The course run this programme names is no longer on the site.",
  noGroup: "That group isn’t one of this programme’s groups.",
  archived: "That group has been archived, so its campus can’t change.",
} as const;
