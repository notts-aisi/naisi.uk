import { drawWeekRule } from "../packsAndCases/drawWeek";
import type { DrawWeeks, GroupWeek } from "../packsAndCases/readers";
import { pairsAskOf } from "./model";

/**
 * THE WEEK THE GROUP PAGE'S PAIRS CARD IS ABOUT, on a course with a week in
 * pairs: the card is always there on such a course, and never pinned, since
 * pairs are made for their own session rather than handed out the session
 * before.
 *
 *  - the week of the group's next session (one in progress included) when it
 *    asks for pairs, as the card always did;
 *  - else the earliest week in pairs still to come, by the one rule that says
 *    which weeks are still to come (`drawWeekRule`, over the weeks in pairs);
 *  - else no week: none still to come is in pairs, and the card says so.
 *
 * Null on a course none of whose taught weeks is in pairs: no card. Pure,
 * from what `readDrawWeeks` read.
 */
export function pairsCardWeek(course: DrawWeeks, nextSessionWeek: number | null, now: Date): { week: GroupWeek | null } | null {
  const inPairs = course.taught.filter((n) => {
    const week = course.weeks.get(n);
    return Boolean(week && pairsAskOf(week.blocks));
  });
  if (inPairs.length === 0) return null;
  if (nextSessionWeek !== null && inPairs.includes(nextSessionWeek)) return { week: course.weeks.get(nextSessionWeek) ?? null };
  const rule = drawWeekRule({ sessions: course.sessions, givingWeeks: inPairs, now });
  return { week: rule.ahead && rule.weekNumber !== null ? (course.weeks.get(rule.weekNumber) ?? null) : null };
}
