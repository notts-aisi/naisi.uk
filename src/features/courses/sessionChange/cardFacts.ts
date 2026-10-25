import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { coversWords } from "@/lib/courses/sessionChange/words";
import type { GroupSessionMode } from "@/lib/firestore/courseGroups";
import { weekDocId } from "@/lib/firestore/courses";

/**
 * WHAT A SESSION CARD IS HANDED ABOUT A CHANGED SESSION (Q25, wk-changes),
 * from the group's own entry on the overview payload. Pure, no imports beyond
 * words and types, so the run home, the week page and the group page say the
 * same thing about the same session.
 */

/** The props for a card dated to the group's next session: its own day, time, room and link. */
export function nextSessionCard(group: OverviewGroup): {
  group: OverviewGroup;
  slotStartKey: string;
  mode: GroupSessionMode | null;
  title: string;
} | null {
  const next = group.calendar.nextSession;
  if (!next) return null;
  // A date key parses at noon UTC, so its weekday is London's.
  const weekday = new Date(`${next.dateKey}T12:00:00Z`).getUTCDay();
  return {
    group: {
      ...group,
      weekday,
      startTimeLocal: next.startTimeLocal,
      durationMinutes: next.durationMinutes,
      location: next.location,
      meetingUrl: next.meetingUrl,
    },
    // The card dates its session to the first matching weekday on or after
    // this, which is the session's own date.
    slotStartKey: next.dateKey,
    mode: group.sessionModes[weekDocId(next.weekNumber)] ?? null,
    title: coversWords(next.dateKey, next.weekNumbers),
  };
}

/**
 * "Tue 1 Dec · weeks 4 and 5", for the card of the week whose session covers
 * an earlier, cancelled week too. Undefined for every other card.
 */
export function coversTitle(group: OverviewGroup, weekNumber: number): string | undefined {
  const next = group.calendar.nextSession;
  if (!next || next.weekNumber !== weekNumber || next.weekNumbers.length < 2) return undefined;
  return coversWords(next.dateKey, next.weekNumbers);
}

/** The week's session, when it was cancelled and the group kept pace: the reason the group was given. */
export function cancelledIn(group: OverviewGroup, weekNumber: number): { reason: string } | null {
  const found = group.cancelledSessions.find((session) => session.weekNumber === weekNumber);
  return found ? { reason: found.reason } : null;
}
