import { siteDayKey } from "@/lib/datetime/siteTime";
import { POLICIES, type PolicyVersion } from "./policies";

/**
 * THE LINE THAT SAYS THE PRIVACY POLICY CHANGED, on Home and at the top of
 * /privacy, for 14 days from the current version's date.
 *
 * From version 17 a change to how we use somebody's information is told on the
 * site, not by email and not by asking anybody to accept it again
 * (`needsPolicyAcceptance` in `./acceptance.ts`). This is how the site tells
 * it: the current version's own `updateLine` (`./policies.ts`), with a link to
 * the top of the policy, where it says what changed.
 *
 * WORKED OUT FROM THE DATE ALONE. Nothing is stored about who saw it, in the
 * database or a cookie, and nobody can dismiss it: it shows to everybody from
 * the version's `lastUpdated` day, London time, for `UPDATE_LINE_DAYS` days,
 * and then to nobody. A version with no `updateLine`, or a date that cannot
 * be read, shows no line at all.
 *
 * TWO VERSIONS AT ONCE. While the version before the current one is still
 * inside its own days, the line says what both changed: that version's line
 * with the current version's `updateLineAdds` in place of its full stop
 * (version 18 within version 17's days). After them, the current version's
 * own line, until its days end too. A current version with no
 * `updateLineAdds` says only its own line.
 *
 * Pure: the clock is the caller's, so a page reads it once and a test can
 * hand it any day.
 */

/** How many days the line shows for, the version's own date the first of them. */
export const UPDATE_LINE_DAYS = 14;

/** Where the link goes: the top of the current policy, which says what changed. */
export const UPDATE_LINE_HREF = "/privacy#whats-changed";

/** The link's words. */
export const UPDATE_LINE_LINK = "Read what's changed";

export type PolicyUpdateLine = {
  /** The version the line is about. */
  version: number;
  /** What it says, before the link. */
  words: string;
  link: string;
  href: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A policy's date as `policies.ts` writes it ("12 November 2026") as the civil
 * day "2026-11-12", or null when it is not a real day in that form.
 */
export function civilDayOf(lastUpdated: string): string | null {
  const match = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(lastUpdated.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.indexOf(match[2]);
  const year = Number(match[3]);
  if (month === -1) return null;
  // A civil date, so UTC arithmetic: no zone, no daylight saving.
  const at = new Date(Date.UTC(year, month, day));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month || at.getUTCDate() !== day) return null;
  return at.toISOString().slice(0, 10);
}

/** The civil day `days` after `day` ("YYYY-MM-DD"). */
function daysAfter(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** A version's line when `today` is inside its days, or null: none, a date that cannot be read, or outside them. */
function lineOn(version: PolicyVersion | undefined, today: string): string | null {
  const words = version?.updateLine?.trim();
  if (!version || !words) return null;
  const from = civilDayOf(version.lastUpdated);
  if (!from) return null;
  if (today < from || today >= daysAfter(from, UPDATE_LINE_DAYS)) return null;
  return words;
}

/**
 * The line for `now`, or null when there is none: the current privacy
 * version's `updateLine`, from its date to the day before `UPDATE_LINE_DAYS`
 * days later, in London; while the version before it is inside its own days
 * too, that version's line joined to the current one's `updateLineAdds`.
 */
export function policyUpdateLine(now: Date): PolicyUpdateLine | null {
  const [current, previous] = POLICIES.privacy.versions;
  const today = siteDayKey(now);
  const own = lineOn(current, today);
  if (!own) return null;
  const adds = current.updateLineAdds?.trim();
  const before = adds ? lineOn(previous, today) : null;
  const words = adds && before ? `${before.replace(/\.$/, "")}, ${adds}` : own;
  return { version: current.version, words, link: UPDATE_LINE_LINK, href: UPDATE_LINE_HREF };
}
