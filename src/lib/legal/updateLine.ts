import { siteDayKey } from "@/lib/datetime/siteTime";
import { POLICIES } from "./policies";

/**
 * THE LINE ON HOME THAT SAYS THE PRIVACY POLICY CHANGED.
 *
 * A change to how we use somebody's information is told on the site, not by
 * email and not by asking anybody to accept it again
 * (`needsPolicyAcceptance` in `./acceptance.ts`). This is how the site tells
 * it: one short sentence on Home, the same for every version, and a link to
 * the top of the policy, where "What's changed" says what did. Home says
 * nothing of the change itself.
 *
 * WHICH VERSIONS. Only a version marked `toldOnHome` in `./policies.ts`: one
 * that changed how people's information is used. A version without the mark
 * has no line, and does not end the line of the version before it.
 *
 * FOR HOW LONG. From the version's `lastUpdated` day, London time, for
 * `UPDATE_LINE_DAYS` days, and then to nobody. When two marked versions are
 * inside their days at once, the line is the newer one's. A date that cannot
 * be read shows no line.
 *
 * DISMISSED ONCE. The line carries its version's number, so Home can leave
 * it out for somebody who dismissed it. That is kept in their own browser
 * (`./updateLineDismissal.ts`), never by us. A later marked version is a
 * line of its own, shown to them again.
 *
 * Pure: the clock is the caller's, so a page reads it once and a test can
 * hand it any day, and nothing here reads or keeps anything about a person.
 */

/** How many days the line shows for, the version's own date the first of them. */
export const UPDATE_LINE_DAYS = 7;

/** What the line says, whichever version it is about. */
export const UPDATE_LINE_WORDS = "We've updated our privacy policy.";

/** Where the link goes: the top of the current policy, which says what changed. */
export const UPDATE_LINE_HREF = "/privacy#whats-changed";

/** The link's words. */
export const UPDATE_LINE_LINK = "Read what's changed";

export type PolicyUpdateLine = {
  /** The version the line is about: what a dismissal is remembered against. */
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

/**
 * The line for `now`, or null when there is none: the newest privacy version
 * marked `toldOnHome` whose days `now` is inside, in London, from its date to
 * the day before `UPDATE_LINE_DAYS` days later.
 */
export function policyUpdateLine(now: Date): PolicyUpdateLine | null {
  const today = siteDayKey(now);
  // Newest first, so the first marked version inside its days is the newest.
  const told = POLICIES.privacy.versions.find((version) => {
    if (version.toldOnHome !== true) return false;
    const from = civilDayOf(version.lastUpdated);
    return from !== null && today >= from && today < daysAfter(from, UPDATE_LINE_DAYS);
  });
  if (!told) return null;
  return { version: told.version, words: UPDATE_LINE_WORDS, link: UPDATE_LINE_LINK, href: UPDATE_LINE_HREF };
}
