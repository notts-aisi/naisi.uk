/**
 * The words of a course's facilitator guide's pages and the links to them.
 *
 * Two are the boards': "Facilitator guide for week 3", on the ticket of a
 * facilitator's group page (wk-fac-group), and "Facilitator guide", under
 * this week's title on a facilitator's Home (wk-fac-home-phone). The rest no
 * board draws yet; they are listed in the build notes for the boards'
 * designers to confirm.
 *
 * Pure, with no imports, so a page drawn in the browser reads them here too.
 * No dash and no gendered pronoun anywhere in this file.
 */

/** The guide's own name, the course page's heading. */
export const FACILITATOR_GUIDE = "Facilitator guide";

/** The ticket's link on a facilitator's group page, and the week page's heading (wk-fac-group). */
export function guideForWeekWords(weekNumber: number): string {
  return `Facilitator guide for week ${weekNumber}`;
}

/** Who reads every page of the guide, said under its heading. */
export const GUIDE_READERS_LINE = "Only facilitators, the programme’s lead and admins see this.";

/** The one answer for everybody the guide is not for, and for a course that is not there. */
export const GUIDE_REFUSED = "Only a course’s facilitators, its programme’s lead and admins can open its facilitator guide.";

/** The course page with nothing loaded yet. */
export const GUIDE_EMPTY = "There’s nothing in this course’s facilitator guide yet.";

/** A week page with neither of its documents loaded. */
export function guideWeekEmptyWords(weekNumber: number): string {
  return `There’s no facilitator guide for week ${weekNumber} yet.`;
}

/** One of the course's own documents, not loaded yet. */
export function documentEmptyWords(label: string): string {
  return `“${label}” isn’t in this facilitator guide yet.`;
}

/** A page of the guide that does not exist, for somebody it is for. */
export const GUIDE_NO_SUCH_PAGE = "There’s no such page in this facilitator guide.";

/** The course page's two lists. */
export const EACH_WEEK = "Each week";
export const FOR_THE_WHOLE_COURSE = "For the whole course";

/** A week page's list of its two documents. */
export const ON_THIS_PAGE = "On this page";

/** The way back to the course page from one of its pages, at the top. */
export const BACK_TO_GUIDE = "Facilitator guide";

/** The way back to the course page at the foot of one of its pages. */
export const BACK_TO_THE_GUIDE = "Back to the facilitator guide";

/** "Week 3". */
export function weekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/**
 * A week's theme, from its documents' own titles: "What could go wrong" out
 * of "Session 3: What could go wrong" or "Week 3 notes: What could go wrong".
 * "" when a title carries no theme after its number.
 */
export function themeOf(title: string | null): string {
  if (!title) return "";
  const found = /^(?:session\s+\d+|week\s+\d+\s+notes)\s*[:.·-]\s*(.+)$/i.exec(title.trim());
  return found ? found[1].trim() : "";
}
