/**
 * WHAT A PERSON'S OWN APPLICATION PAGE SAYS ONCE THEIR PLACE IS A GROUP, and
 * once they have left it.
 *
 * Once Publish has told somebody their group, giving their place back is
 * leaving the programme: they leave their group at once. So their application
 * page stops offering "I’m coming" and "I can’t make it" as if nothing had
 * happened. It points them to their programme's page, where everything for
 * each week is and where "Leave the programme" is, and says plainly what
 * giving the place back now means. Once they have left, by either door, it
 * says so and when (the left page's own sentence, `leftOnLine`).
 *
 * No board draws the application page after groups go out
 * (st-application-phone is the page before), so these are written in the
 * boards' voice and listed in the build notes for the boards' designers to
 * confirm. Every name and day is a slot filled from a record. An incubator's
 * people are told of no group: the view hands the page no group's name for
 * one, and every sentence here reads true without it.
 *
 * Pure, with no imports.
 */

/** The link to their programme's page. */
export const GO_TO_YOUR_PROGRAMME = "Go to your programme";

/**
 * Where everything is now. "You’re in Group B. Your programme’s page has your
 * sessions and each week’s reading.", or the second sentence alone with no
 * group to name.
 */
export function inGroupLine(groupName: string | null): string {
  const page = "Your programme’s page has your sessions and each week’s reading.";
  return groupName ? `You’re in ${groupName}. ${page}` : page;
}

/**
 * What giving the place back now means, for somebody who can leave from their
 * programme's page: "Changed your mind? Giving your place back now means
 * leaving Group B. You can do that from your programme’s page."
 */
export function leavingNowLine(groupName: string | null): string {
  const leaving = groupName ? `leaving ${groupName}` : "leaving the programme";
  return `Changed your mind? Giving your place back now means ${leaving}. You can do that from your programme’s page.`;
}

/**
 * For a seat the team takes somebody off (they applied to the run itself):
 * "Changed your mind? Email", the society's address as a link, then this.
 */
export const ASK_THE_TEAM_AFTER = "and we’ll sort it out with you.";

/** Once they have left: what is still theirs, on the page the link opens. */
export const STILL_YOURS = "Your notes and the reading list are still on your programme’s page.";
