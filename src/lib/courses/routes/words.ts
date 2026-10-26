import { isValidDateKey } from "@/lib/courses/weekPlan";
import { dayWords } from "@/lib/courses/sessionChange/words";

/**
 * THE WORDS OF A COURSE'S ROUTES AND DEADLINES, in one place: the week page's
 * section, the facilitators' notes, the course editor's card and their tests
 * say the same thing. No board draws them: they are written in the guide's
 * own voice and listed in the build notes for the boards' designers to
 * confirm.
 *
 * Days are London days ("2026-11-01"). The "Checked on" line is written as
 * the guide writes it ("25 October 2026"); a deadline in the house style
 * ("Sun 1 Nov"), with its year when that is not this year.
 */

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** "25 October 2026" for "2026-10-25". "" for anything that is not a day. */
export function longDateWords(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  const name = MONTHS[month - 1];
  return `${day} ${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/**
 * The day some words name, or null: "25 October 2026", "25 Oct 2026", "Sun 25
 * Oct 2026", "Sunday, 25 October 2026" or "2026-10-25". A day that does not
 * exist (31 November) is no day.
 */
export function dateKeyFromWords(words: string): string | null {
  const text = words.trim().replace(/\.$/, "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return isValidDateKey(text) ? text : null;
  const match = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i.exec(text);
  if (!match) return null;
  const name = match[2].toLowerCase();
  const index = MONTHS.findIndex((month) => month === name || (name.length >= 3 && month.startsWith(name)));
  if (index < 0) return null;
  const key = `${match[3]}-${String(index + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isValidDateKey(key) ? key : null;
}

/** The list's "as of" line: "Checked on 25 October 2026." */
export function checkedOnWords(dateKey: string): string {
  return `Checked on ${longDateWords(dateKey)}.`;
}

/** "Sun 1 Nov", or "Fri 15 Jan 2027" when its year is not this one. */
function deadlineDayWords(dateKey: string, todayKey: string): string {
  const day = dayWords(dateKey);
  return dateKey.slice(0, 4) === todayKey.slice(0, 4) ? day : `${day} ${dateKey.slice(0, 4)}`;
}

/** A deadline still to come: "Apply by Sun 1 Nov". */
export function applyByWords(dateKey: string, todayKey: string): string {
  return `Apply by ${deadlineDayWords(dateKey, todayKey)}`;
}

/** A deadline gone by: "Closed on Sun 1 Nov". */
export function closedOnWords(dateKey: string, todayKey: string): string {
  return `Closed on ${deadlineDayWords(dateKey, todayKey)}`;
}

/** A route that takes people at any time. */
export const ROLLING = "Rolling";

/** The label over who a route suits. */
export const SUITS_LABEL = "Who it suits";

/** The label over a route's next round, in words. */
export const NEXT_ROUND_LABEL = "Next round";

// ---------------------------------------------------------------------------
// The course editor's card
// ---------------------------------------------------------------------------

export const ROUTES_CARD_TITLE = "Routes and deadlines";

export const ROUTES_CARD_HINT =
  "Where a week lists routes in a table whose first column is Route (Technical AI Safety’s week 6), its page shows these instead, and a route whose deadline has gone by says so.";

export const ROUTES_NONE = "No routes and deadlines yet: a week that lists routes shows the guide’s own tables.";

export const ROUTES_FIELD_LABEL = "The routes, as the guide writes them";

export const ROUTES_FIELD_HINT =
  "Paste the guide’s “Where to go next”, or edit the copy here. Start with the day you checked them (“Checked on 25 October 2026.”), then each group’s heading in bold and its table: Route (its name as a link), What it is, and if you like Who it suits, Deadline (a day such as 1 November 2026, or Rolling) and Next round.";

export const ROUTES_ONLY_ADMIN = "Only an admin can change these.";

export const ROUTES_SAVED = "Saved. Every week that lists routes shows these.";

export const ROUTES_TAKEN_OFF = "Routes taken off. A week that lists routes shows the guide’s own tables again.";

/** "13 routes in 3 groups, checked on 25 October 2026." */
export function routesFoundWords(routes: number, groups: number, checkedOn: string): string {
  const r = routes === 1 ? "1 route" : `${routes} routes`;
  const g = groups === 1 ? "1 group" : `${groups} groups`;
  return `${r} in ${g}, checked on ${longDateWords(checkedOn)}.`;
}

/** Where a route stands, in the card's list: "Apply by Sun 1 Nov", "Closed on ...", "Rolling", or "No deadline". */
export const NO_DEADLINE = "No deadline";
