import { formatSiteDate } from "@/lib/datetime/siteTime";

/**
 * The days a certificate names, read in London (`formatSiteDate`), whatever
 * zone the server runs in.
 *
 * The month is cut to its first three letters, as every short date on the
 * site is: the en-GB short month for September is "Sept", and a certificate
 * reads "Mon 14 Sep 2026" beside "Mon 14 Dec 2026".
 */

function parts(at: Date): { weekday: string; day: string; month: string; year: string } {
  return {
    weekday: formatSiteDate(at, { weekday: "short" }).slice(0, 3),
    day: formatSiteDate(at, { day: "numeric" }),
    month: formatSiteDate(at, { month: "short" }).slice(0, 3),
    year: formatSiteDate(at, { year: "numeric" }),
  };
}

/** "Mon 14 Dec 2026": the issue day a certificate states. */
export function issuedOnWords(at: Date): string {
  const { weekday, day, month, year } = parts(at);
  return `${weekday} ${day} ${month} ${year}`;
}

/** "Mon 14 Dec": the issue day on the programme page's card. */
export function issuedShortWords(at: Date): string {
  const { weekday, day, month } = parts(at);
  return `${weekday} ${day} ${month}`;
}

/** The year and month (1 to 12) of the issue day in London, for LinkedIn. */
export function issuedYearMonth(at: Date): { year: number; month: number } {
  return {
    year: Number(formatSiteDate(at, { year: "numeric" })),
    month: Number(formatSiteDate(at, { month: "numeric" })),
  };
}
