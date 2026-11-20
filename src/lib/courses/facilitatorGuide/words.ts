/**
 * The words of a course's facilitator guide's pages and the links to them.
 *
 * The links a facilitator follows in, on the ticket of their group page and
 * under this week's title on their Home, each say the heading of the page it
 * opens: "Facilitator guide for week 3" for this week's page, and "Facilitator
 * guide" for the guide's course page, which lists every week and the course's
 * own documents, so last week's guide is still one tap away once the week
 * has moved on. The rest are listed in the build notes for the designers to
 * confirm.
 *
 * Pure, with no imports, so a page drawn in the browser reads them here too.
 * No dash and no gendered pronoun anywhere in this file.
 */

/**
 * The guide's own name: the course page's heading, and the link to that page
 * beside this week's on a facilitator's Home and group page.
 */
export const FACILITATOR_GUIDE = "Facilitator guide";

/** This week's link on a facilitator's group page and Home, and the week page's heading. */
export function guideForWeekWords(weekNumber: number): string {
  return `Facilitator guide for week ${weekNumber}`;
}

/** Who reads every page of the guide, said under its heading. */
export const GUIDE_READERS_LINE = "Only facilitators, the programme’s lead and admins see this.";

/** The one answer for everybody the guide is not for, and for a course that is not there. */
export const GUIDE_REFUSED = "Only a course’s facilitators, its programme’s lead and admins can open its facilitator guide.";

/** The course page with nothing loaded yet. */
export const GUIDE_EMPTY = "There’s nothing in this course’s facilitator guide yet.";

/**
 * A week with neither of its documents loaded: the week page's sentence, and
 * the first half of the session card's where the week's own link would be.
 */
export function guideWeekEmptyWords(weekNumber: number): string {
  return `Week ${weekNumber}’s plan isn’t in the guide yet.`;
}

/**
 * Who loads the guide, said where a group is known: the programme's lead by
 * first name, as the group page already names them, or admins alone when no
 * lead stands.
 */
export function whoLoadsItWords(leadFirstName: string | null): string {
  const lead = leadFirstName?.trim() ?? "";
  return lead ? `${lead} or an admin loads it.` : "An admin loads it.";
}

/** The session card's sentence for a week that is not loaded while something else is. */
export function guideWeekNotLoadedWords(weekNumber: number, leadFirstName: string | null): string {
  return `${guideWeekEmptyWords(weekNumber)} ${whoLoadsItWords(leadFirstName)}`;
}

/** The session card's sentence, in place of both links, for a course with nothing loaded at all. */
export function guideNothingLoadedWords(leadFirstName: string | null): string {
  const lead = leadFirstName?.trim() ?? "";
  return lead
    ? `${GUIDE_EMPTY} ${lead} or an admin loads it, and it will show here.`
    : `${GUIDE_EMPTY} An admin loads it, and it will show here.`;
}

/**
 * Who loads the guide, said on the guide's own pages, which are addressed by
 * course and know no group: never a person's name, for a course can be named
 * by two programmes, each with a lead who may load it. "An admin loads it."
 * where no programme naming a live run of the course has a lead who stands.
 */
export const GUIDE_LOADED_BY_LEAD = "The programme’s lead or an admin loads it.";

export function guideLoadedByWords(aLeadStands: boolean): string {
  return aLeadStands ? GUIDE_LOADED_BY_LEAD : whoLoadsItWords(null);
}

/** The course page with nothing loaded yet, with who loads it. */
export function guideEmptyWords(aLeadStands: boolean): string {
  return `${GUIDE_EMPTY} ${guideLoadedByWords(aLeadStands)}`;
}

/** The card's sentence, in place of its button, for a next session whose week is not loaded. */
export function guideWeekNotLoadedHereWords(weekNumber: number, aLeadStands: boolean): string {
  return `${guideWeekEmptyWords(weekNumber)} ${guideLoadedByWords(aLeadStands)}`;
}

// ---------------------------------------------------------------------------
// The reader's own group, on the guide's pages (a facilitator only)
// ---------------------------------------------------------------------------

/** The card at the top of the course page. */
export const YOUR_NEXT_SESSION = "Your next session";

/** The card's button: "Open week 2’s plan". */
export function openWeekPlanWords(weekNumber: number): string {
  return `Open week ${weekNumber}’s plan`;
}

/** The card's line: "Group C · Wed 11 Nov, 3pm", from the group's name and the session's day and clock. */
export function nextSessionLineWords(groupName: string, when: string): string {
  return [groupName.trim(), when.trim()].filter(Boolean).join(" · ");
}

/** "Week 2: How fast", or "Week 2" with no theme. */
export function weekTitleWords(weekNumber: number, theme: string): string {
  const trimmed = theme.trim();
  return trimmed ? `${weekWords(weekNumber)}: ${trimmed}` : weekWords(weekNumber);
}

/** Under a week in the course page's list that has nothing loaded. */
export const NOT_LOADED_YET = "Not loaded yet";

/** The group's name where it has none. */
export const GROUP_FALLBACK = "Group";

/** The way back to the reader's group at the foot of the course page with nothing loaded: "Back to Group C". */
export function backToGroupWords(groupName: string): string {
  return `Back to ${groupName.trim() || GROUP_FALLBACK}`;
}

/**
 * A week's theme from the title its members read ("How fast"), for a week
 * with nothing in the guide: a leading "Week 2:" is left out, since the row
 * says the week already.
 */
export function memberWeekTheme(title: string, weekNumber: number): string {
  const trimmed = title.trim();
  const found = new RegExp(`^week\\s+${weekNumber}\\s*[:.·-]\\s*(.+)$`, "i").exec(trimmed);
  return found ? found[1].trim() : trimmed;
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

// ---------------------------------------------------------------------------
// The printables as PDFs (no board draws these: listed in the build notes
// for the boards' designers to confirm)
// ---------------------------------------------------------------------------

/** The printables page's card of downloads. */
export const PRINT_CARD_TITLE = "Download to print";
export const PRINT_CARD_LINE = "Each session’s printables as one A4 PDF, ready to send to a printer.";

/** A session's row on that card: "Session 3". */
export function sessionWords(session: number): string {
  return `Session ${session}`;
}

/** Under a session's row: how many sections of the printables its PDF carries. */
export function thingsToPrintWords(count: number): string {
  return count === 1 ? "1 thing to print · PDF" : `${count} things to print · PDF`;
}

/** Under a session's row that has nothing: no link. */
export const NOTHING_TO_PRINT = "Nothing to print";

/** The card's last row: the whole document. */
export const ALL_THE_PRINTABLES = "All the printables";
export const WHOLE_DOCUMENT_PDF = "The whole document · PDF";

/** A week's page, beside its session plan. */
export function downloadSessionPrintablesWords(session: number): string {
  return `Download session ${session}’s printables (PDF)`;
}

/** The PDF route's sentences, for somebody the guide is for. */
export const PRINTABLES_NOT_LOADED = "There are no printables in this course’s facilitator guide yet.";
export const ASK_FOR_A_SESSION = "Ask for a session by its number, or leave the session out for all the printables.";

export function noSuchSessionWords(asked: number, sessions: number): string {
  if (sessions === 0) return `This course has no sessions yet, so there’s no session ${asked}.`;
  return `This course has ${sessions} ${sessions === 1 ? "session" : "sessions"}, so there’s no session ${asked}.`;
}

export function nothingForSessionWords(session: number): string {
  return `Nothing in the printables is for session ${session}.`;
}

/** Small at the foot of each page of a PDF of more than one page: "Page 2 of 5". */
export function pageOfWords(page: number, pages: number): string {
  return `Page ${page} of ${pages}`;
}
