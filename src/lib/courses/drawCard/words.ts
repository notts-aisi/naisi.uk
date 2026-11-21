import { londonDayLabel } from "../londonLabels";
import { daysBetween, isValidDateKey } from "../weekPlan";
import type { WeekDraw } from "../packsAndCases/model";
import { drawHoldingWords, drawTitleWords, joinNames, weeksWords, NOT_GIVEN_YET } from "../packsAndCases/words";

/**
 * THE WORDS OF THE PATHWAYS AND CASES CARD on a group's page, and of the
 * three places that point to it while slips are being handed out: the
 * register's row, Home's card and the card on that week's page of the
 * facilitator guide. Facilitators read these (and the programme's lead and
 * admins, who open the same pages); no learner does.
 *
 * The names of what is given out are the week's own ("Pathways and cases",
 * "Plans"), from `drawTitleWords`, so week 3 and week 5 each read in their own
 * words. Pure.
 */

/** The card's title when it is about no one week: what the page it leads to is called. */
export const DRAW_CARD_TITLE = "Pathways and cases";

function lower(words: string): string {
  return words ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

/** "Wednesday" for a "YYYY-MM-DD" date key. */
function weekdayOfKey(dateKey: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(`${dateKey}T00:00:00Z`).getUTCDay()] ?? "";
}

/** Within six days of today: named by its weekday. */
function isNear(dateKey: string, todayKey: string): boolean {
  return isValidDateKey(dateKey) && isValidDateKey(todayKey) && Math.abs(daysBetween(todayKey, dateKey)) <= 6;
}

/** "Wednesday’s session", or "the session on Wed 2 Dec" for one more than six days away. */
function sessionNamed(handOut: { dateKey: string; startsAt: Date }, todayKey: string): string {
  return isNear(handOut.dateKey, todayKey) ? `${weekdayOfKey(handOut.dateKey)}’s session` : `the session on ${londonDayLabel(handOut.startsAt)}`;
}

/** Under the title: "Week 3", or "Week 3 · 6 of 8 given" while some and not all have theirs. */
export function cardWeekWords(weekNumber: number, have: number, total: number): string {
  return have > 0 && have < total ? `Week ${weekNumber} · ${have} of ${total} given` : `Week ${weekNumber}`;
}

/** Before the session that hands them out: "You hand these out at the end of Wednesday’s session, then copy them in here." */
export function handOutAtWords(handOut: { dateKey: string; startsAt: Date }, todayKey: string): string {
  return `You hand these out at the end of ${sessionNamed(handOut, todayKey)}, then copy them in here.`;
}

/** A week none of whose sessions can be dated. Not drawn on the boards. */
export function handOutUndatedWords(weekNumber: number): string {
  return `You hand these out at the session before week ${weekNumber}, then copy them in here.`;
}

/** The button before the hand-out session: "Copy in week 3’s slips". */
export function copyInWeekWords(weekNumber: number): string {
  return `Copy in week ${weekNumber}’s slips`;
}

/** The button from the start of the hand-out session. */
export const COPY_IN_THE_SLIPS = "Copy in the slips";

/** The pinned card's title, before anybody has theirs: "Give out week 3’s pathways and cases before people leave." */
export function giveOutWords(weekNumber: number, draw: WeekDraw): string {
  return `Give out week ${weekNumber}’s ${lower(drawTitleWords(draw))} before people leave.`;
}

export const GIVE_OUT_LINE = "Then copy the slips in, so each person sees theirs.";

/** "Daniel and Chloe", with anybody counted without a name: "Daniel, Chloe and 1 more", or "1 person". */
function namedAndCounted(names: readonly string[], unnamed: number): { words: string; one: boolean } {
  if (names.length === 0) return { words: unnamed === 1 ? "1 person" : `${unnamed} people`, one: unnamed === 1 };
  const parts = unnamed > 0 ? [...names, `${unnamed} more`] : [...names];
  return { words: joinNames(parts), one: parts.length === 1 && unnamed === 0 };
}

/** "Not given yet: Daniel and Chloe". Somebody this reader is not shown is counted: "Not given yet: Daniel and 1 more". */
export function notGivenWords(names: readonly string[], unnamed: number): string {
  return `${NOT_GIVEN_YET}: ${namedAndCounted(names, unnamed).words}`;
}

/** "Daniel and Chloe are waiting for theirs.", "Daniel is waiting for theirs." */
export function waitingWords(names: readonly string[], unnamed: number): string {
  const { words, one } = namedAndCounted(names, unnamed);
  return `${words} ${one ? "is" : "are"} waiting for theirs.`;
}

/** "Everybody has a pathway and a case." */
export function everybodyHasWords(draw: WeekDraw): string {
  return `Everybody has ${drawHoldingWords(draw)}.`;
}

/** A row to another week's: "Week 2’s cases". */
export function weekThingsWords(weekNumber: number, draw: WeekDraw): string {
  return `Week ${weekNumber}’s ${lower(drawTitleWords(draw))}`;
}

export const OTHER_WEEKS = "Other weeks";
export const WHAT_WAS_GIVEN_OUT = "What was given out";

/** "Weeks 2, 4 and 5", "Weeks 2 to 5", "Week 3". */
export function weeksListWords(weeks: readonly number[]): string {
  return weeksWords(weeks);
}

/** After the last session: "Group C’s sessions have finished." */
export function finishedWords(groupName: string): string {
  return `${groupName}’s sessions have finished.`;
}

/** The last week has started and nothing after it gives anything out. Not drawn on the boards. */
export const NOTHING_STILL_TO_COME = "No week still to come gives anything out.";

/** Who changes a week: "ask Maya or an admin to change the week.", or with no lead "an admin can change the week." */
function changeTheWeekWords(intro: string, leadFirstName: string | null): string {
  return leadFirstName ? `${intro}, ask ${leadFirstName} or an admin to change the week.` : `${intro}, an admin can change the week.`;
}

/**
 * A course that gives nothing out because its Choose ones are picked by
 * each person: "Week 3’s pathways are picked by each person, so there’s
 * nothing for you to give out. If you meant to hand them out, ask Maya or an
 * admin to change the week." A title that is more than one word ("One career
 * review that fits you") is not named.
 */
export function pickedWords(weekNumber: number, chooseOneTitle: string, leadFirstName: string | null): string {
  const word = chooseOneTitle.trim();
  const first = /^[A-Za-z]+$/.test(word)
    ? `Week ${weekNumber}’s ${lower(word)}s are picked by each person, so there’s nothing for you to give out.`
    : `In week ${weekNumber} each person picks their own, so there’s nothing for you to give out.`;
  return `${first} ${changeTheWeekWords("If you meant to hand them out", leadFirstName)}`;
}

/**
 * A course whose cases are not set to be given out: nobody can pick a case
 * on the site, so nobody can have one. Not drawn on the boards.
 */
export function casesNotSetWords(weekNumber: number, leadFirstName: string | null): string {
  return `Week ${weekNumber}’s cases aren’t set to be given out, so nobody can be given one. ${changeTheWeekWords("To give them out", leadFirstName)}`;
}

/** A course whose Cases blocks have no cases in them, and no Choose one. Not drawn on the boards. */
export const NOTHING_TO_GIVE_OUT = "Nothing on this course is given out, so there’s nothing for you to give out.";

// ---------------------------------------------------------------------------
// The three places that point to the card at the session that hands them out
// ---------------------------------------------------------------------------

/** The register's row: "Week 3’s pathways and cases", "Hand out the slips, then copy them in." */
export function registerRowTitleWords(weekNumber: number, draw: WeekDraw): string {
  return weekThingsWords(weekNumber, draw);
}

export const REGISTER_ROW_LINE = "Hand out the slips, then copy them in.";

/** Home's card, on the evening of the session: "After Wednesday’s session". */
export function homeSlipsTitleWords(handOutDateKey: string): string {
  return `After ${weekdayOfKey(handOutDateKey)}’s session`;
}

/** Home's line: "Copy in the pathways and cases you hand out for week 3." */
export function homeSlipsLineWords(weekNumber: number, title: string): string {
  return `Copy in the ${lower(title)} you hand out for week ${weekNumber}.`;
}

/** The guide's card: "After session 2". */
export function guideSlipsEyebrowWords(sessionNumber: number): string {
  return `After session ${sessionNumber}`;
}

/** "pathway and case": what each slip names, for the guide's line. */
function slipThingsWords(draw: WeekDraw): string {
  const things = [...new Set(draw.packs.map((chooseOne) => lower(chooseOne.title.trim()) || "pack"))];
  if (draw.cases.length > 0) things.push("case");
  return joinNames(things);
}

/** The guide's line: "Copy in the pathway and case slips you handed out for week 3." */
export function guideSlipsLineWords(weekNumber: number, draw: WeekDraw): string {
  return `Copy in the ${slipThingsWords(draw)} slips you handed out for week ${weekNumber}.`;
}
