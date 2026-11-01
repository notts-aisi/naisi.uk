import { clockWords, dayWords, namesWords } from "@/lib/courses/sessionChange/words";

/**
 * EVERY WORD A TEAM'S PAGE AND ITS HAND-IN SAY (boards in-team,
 * in-team-phone and en-handin-phone), in one file, so the pages, the routes
 * and the tests say one thing.
 *
 * The boards' words are kept exactly, apostrophes and all. Every square
 * bracket on a board is a slot filled from a record here: a name from an
 * account, a day and a time from the group's own calendar, a room from its
 * session, a due day and a showcase week from the run's hand-in setting.
 * Where a board draws nothing (an empty state, a refusal, a state after the
 * deadline, the lead's reading), the words are written here in the boards'
 * voice and listed in the build notes for the boards' designers to confirm.
 *
 * One change to a drawn line, on purpose: in-team's "Zach and your team see
 * this." names admins too, because the privacy policy says the page names
 * everybody who reads what is written there ("the team, the programme's lead
 * and admins"). And the team's weekly entry the boards call a "check-in" is
 * an UPDATE here ("This week’s update", "Save update"), as the privacy
 * policy calls it: "the check-in" is the survey at the end of a session
 * (`src/lib/surveys/checkIns/`). The stored kind stays `check-in`.
 *
 * Pure, with no server import, so a page's client code can read them.
 * Dates are London civil dates ("2027-02-18"); nothing here re-zones an
 * instant except `handedInWords`, which formats one in London.
 */

// ---------------------------------------------------------------------------
// The page's headings and labels (the boards' own)
// ---------------------------------------------------------------------------

export const THE_PROJECT = "The project";
export const PAPER = "Paper";
export const YOUR_TWIST = "Your twist";
/** The lead's and an admin's reading of a team's page names it as the team's, not the reader's. */
export const THE_TWIST = "Twist";
export const THIS_WEEKS_UPDATE = "This week’s update";
export const WHAT_WE_DID = "What we did";
export const WHATS_IN_THE_WAY = "What’s in the way";
export const SAVE_UPDATE = "Save update";
export const TEAM_LINKS = "Team links";
export const ADD_A_LINK = "Add a link";
export const HAND_IN = "Hand-in";
export const THE_WEEKS = "The weeks";
export const THIS_TERM = "This term";
export const LINK_TO_YOUR_WORK = "Link to your repo or write-up";
export const LINK_PLACEHOLDER = "https://…";
export const LINK_HINT = "A repo, a doc, or a page. Make sure the team can open it.";
export const SUMMARY = "Summary";
export const WHO_DID_WHAT = "Who did what";
export const OPTIONAL = "(optional)";
export const HAND_IN_FOR_THE_TEAM = "Hand in for the team";

// ---------------------------------------------------------------------------
// Words the boards do not draw, in their voice (for the boards' designers)
// ---------------------------------------------------------------------------

export const UPDATE_SAVED = "Update saved.";
export const SAVING = "Saving…";
export const NO_LINKS_YET = "No links yet.";
export const LINK_LABEL = "Label";
export const LINK_LABEL_PLACEHOLDER = "Repo";
export const LINK_ADDRESS = "Link";
export const ADD_LINK = "Add link";
export const CANCEL = "Cancel";
export const REMOVE = "Remove";
export const LINK_ADDED = "Link added.";
export const LINK_REMOVED = "Link removed.";
export const HANDED_IN_NOW = "Handed in. Your team sees it now.";
export const UPDATES = "Updates";
export const NO_UPDATES = "No updates yet.";
export const NOT_HANDED_IN = "Not handed in yet.";
export const OFFLINE = "That didn’t reach the site. Check your connection, then try again.";
export const NOT_SAVED = "That didn’t save. Reload the page, then try again.";

/** "Remove Repo", what a screen reader hears for a link's Remove. */
export function removeLinkName(label: string): string {
  return `${REMOVE} ${label}`;
}

// ---------------------------------------------------------------------------
// Who reads what is written here (privacy policy v7, "Your team's page")
// ---------------------------------------------------------------------------

/**
 * Beside what somebody writes on their team's page: "Zach, your team and
 * admins see this." (in-team draws "Zach and your team see this."; the
 * policy promises the page names admins too). With no programme lead who
 * stands, "Your team and admins see this."
 */
export function teamWhoLine(leadFirstName: string | null): string {
  return leadFirstName ? `${leadFirstName}, your team and admins see this.` : "Your team and admins see this.";
}

// ---------------------------------------------------------------------------
// The head
// ---------------------------------------------------------------------------

type ProgrammeName = { kind: "fellowship" | "incubator"; shortName: string } | null;

function programmeWords(programme: ProgrammeName, courseTitle: string): string {
  if (!programme) return courseTitle.trim();
  return `${programme.kind === "incubator" ? "Incubator" : "Fellowship"}: ${programme.shortName}`;
}

/** "Incubator: Alignment Research · Team", over the team's name. */
export function teamEyebrowWords(programme: ProgrammeName, courseTitle: string): string {
  const where = programmeWords(programme, courseTitle);
  return where ? `${where} · Team` : "Team";
}

/** "Wen, George and Lily · Thursdays 6pm · Room C20": the people, then what of the group's slot is known. */
export function teamHeadLineWords(firstNames: readonly string[], slot: string, room: string): string {
  return [namesWords(firstNames), slot, room].map((part) => part.trim()).filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// The hand-in, as the team's page says it
// ---------------------------------------------------------------------------

/**
 * "One hand-in for the team. Due Thu 18 Feb, week 10: a link and a 200-word
 * summary." The week is the taught week the due day falls in, by the team's
 * group's calendar, and is left out when it falls in none. With no due day
 * set, the sentence says what the hand-in asks for and no day.
 */
export function handInAsksWords(dueOn: string | null, dueWeek: number | null, summaryWords: number): string {
  const asks = `a link and a ${summaryWords}-word summary.`;
  const day = dueOn ? dayWords(dueOn) : "";
  if (!day) return `One hand-in for the team: ${asks}`;
  return `One hand-in for the team. Due ${day}${dueWeek ? `, week ${dueWeek}` : ""}: ${asks}`;
}

/** "Showcase: Thu 18 Feb · 6pm · Room C20", from the showcase week's session. Null when there is no day to say. */
export function showcaseLineWords(dateKey: string, startTimeLocal: string, room: string): string | null {
  const day = dayWords(dateKey);
  if (!day) return null;
  return [`Showcase: ${day}`, clockWords(startTimeLocal), room.trim()].filter(Boolean).join(" · ");
}

/** "Handed in by Wen on Thu 18 Feb.", on the team's page once the team has handed in. */
export function handedInDayWords(firstName: string | null, dateKey: string): string {
  const day = dayWords(dateKey);
  const by = firstName ? ` by ${firstName}` : "";
  return day ? `Handed in${by} on ${day}.` : `Handed in${by}.`;
}

/** The link under the team page's Hand-in card: to hand in, to change it, or to read it once it is closed. */
export function handInActionWords(handedIn: boolean, open: boolean): string {
  if (!open) return "See the hand-in";
  return handedIn ? "Change the hand-in" : "Hand in";
}

// ---------------------------------------------------------------------------
// The hand-in page (en-handin-phone)
// ---------------------------------------------------------------------------

/** "Incubator: Alignment Research · Week 10": the week the due day falls in, when it falls in one. */
export function handInEyebrowWords(programme: ProgrammeName, courseTitle: string, weekNumber: number | null): string {
  const where = programmeWords(programme, courseTitle);
  const week = weekNumber ? `Week ${weekNumber}` : "";
  return [where, week].filter(Boolean).join(" · ") || HAND_IN;
}

/** "Hand in for Probe transfer". */
export function handInTitleWords(teamName: string): string {
  return `Hand in for ${teamName}`;
}

/**
 * "One hand-in for the team. Wen, George and Lily all see it, and so do Zach
 * and admins." The board's first two sentences, then who else reads it, as
 * the policy promises the page says. Somebody alone in a team: "Only you
 * and ... see it", worded here.
 */
export function handInLedeWords(teamFirstNames: readonly string[], leadFirstName: string | null): string {
  const others = leadFirstName ? `${leadFirstName} and admins` : "admins";
  if (teamFirstNames.length <= 1) return `One hand-in for the team. You see it, and so do ${others}.`;
  return `One hand-in for the team. ${namesWords(teamFirstNames)} all see it, and so do ${others}.`;
}

/** "I’ve shared this with George and Lily": the person's teammates. Null for somebody alone in a team. */
export function sharedWithWords(otherFirstNames: readonly string[]): string | null {
  return otherFirstNames.length > 0 ? `I’ve shared this with ${namesWords(otherFirstNames)}` : null;
}

/** The refusal when the tick is missing. */
export function tickFirstWords(otherFirstNames: readonly string[]): string {
  return otherFirstNames.length > 0
    ? `Tick that you’ve shared it with ${namesWords(otherFirstNames)} first.`
    : "Tick that you’ve shared it with your team first.";
}

/** "21 / 200 words", under the summary. */
export function summaryCountWords(words: number, limit: number): string {
  return `${words} / ${limit} words`;
}

/** "You can change it until 23:59 tonight." on the due day; "... until 23:59 on Thu 18 Feb." before it. */
export function changeUntilWords(dueOn: string, todayKey: string): string {
  return dueOn === todayKey
    ? "You can change it until 23:59 tonight."
    : `You can change it until 23:59 on ${dayWords(dueOn)}.`;
}

/** After the due day's 23:59: "Hand-ins closed at 23:59 on Thu 18 Feb." */
export function handInClosedWords(dueOn: string): string {
  return `Hand-ins closed at 23:59 on ${dayWords(dueOn)}.`;
}

/** A run that has ended, been cancelled or archived takes no more hand-ins. */
export const HAND_IN_CLOSED_RUN = "This programme has ended, so the hand-in can’t change now.";

/** "Handed in by Wen at 9:04pm today." / "... on Thu 18 Feb at 9:04pm." Formats the instant in London. */
export function handedInWords(firstName: string | null, at: Date | null, todayKey: string, dateKey: string, clock: string): string {
  const by = firstName ? ` by ${firstName}` : "";
  if (!at || !dateKey) return `Handed in${by}.`;
  return dateKey === todayKey ? `Handed in${by} at ${clock} today.` : `Handed in${by} on ${dayWords(dateKey)} at ${clock}.`;
}

/** "Showcase tonight · 6pm · Room C20" on the showcase's day; "Showcase · 6pm · Room C20" before it. */
export function showcaseTicketWords(isToday: boolean, startTimeLocal: string, room: string): string {
  return [isToday ? "Showcase tonight" : "Showcase", clockWords(startTimeLocal), room.trim()].filter(Boolean).join(" · ");
}

/** "Alignment Research · week 10", under the showcase's line. */
export function showcaseWhereWords(programmeName: string, weekNumber: number): string {
  return [programmeName.trim(), `week ${weekNumber}`].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// The programme page's card, and the lead's reading
// ---------------------------------------------------------------------------

export const YOUR_TEAM = "Your team";
export const YOUR_TEAMS_PAGE = "Your team’s page";

/** "Probe transfer, with George and Lily." on the programme page's card; "Probe transfer." alone. */
export function teamCardWords(teamName: string, otherFirstNames: readonly string[]): string {
  return otherFirstNames.length > 0 ? `${teamName}, with ${namesWords(otherFirstNames)}.` : `${teamName}.`;
}

export const HAND_INS = "Hand-ins";
export const HAND_INS_DUE = "Hand-ins are due on";
export const SHOWCASE_IS_IN = "The showcase is in";
export const NOT_SET = "Not set";
export const SAVE_HAND_IN_DATES = "Save hand-in dates";
export const HAND_IN_DATES_SAVED = "Hand-in dates saved.";
export const HAND_IN_DATES_HINT =
  "Each team can hand in and change it until 23:59 on that day. The showcase is that week’s session, in its room.";
export const READ_THE_TEAMS_PAGE = "Read the team’s page";
export const BACK_TO_TEAMS = "Teams";

/** "Week 10, Thu 18 Feb", an option in the showcase's list. */
export function showcaseOptionWords(weekNumber: number, dateKey: string): string {
  const day = dayWords(dateKey);
  return day ? `Week ${weekNumber}, ${day}` : `Week ${weekNumber}`;
}

/** "Saved Thu 26 Nov by Wen", under a week's update on the lead's reading. */
export function savedWords(firstName: string | null, dateKey: string): string {
  const day = dayWords(dateKey);
  const by = firstName ? ` by ${firstName}` : "";
  return day ? `Saved ${day}${by}` : `Saved${by}`;
}

/** "Week 5", over one week's update on the lead's reading. */
export function weekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

// ---------------------------------------------------------------------------
// Refusals, as the routes send them
// ---------------------------------------------------------------------------

export const NOT_IN_A_TEAM = "Only the people in this team can write on its page.";
export const UPDATE_NOT_THIS_WEEK = "That week’s update has closed. Reload the page for this week’s.";
export const RUN_NOT_RUNNING = "This programme isn’t running now, so its team pages can’t change.";
export const TOO_MANY_LINKS = "Your team has as many links as a page holds. Remove one first.";
export const NO_SUCH_LINK = "That link isn’t on your team’s page any more. Reload the page.";
export const LEADS_AND_ADMINS_SET_DATES = "Only the programme’s lead and admins can set the hand-in dates.";
export const SHOWCASE_NOT_A_WEEK = "That week isn’t one of this programme’s weeks.";
