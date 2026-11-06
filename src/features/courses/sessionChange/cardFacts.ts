import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { campusLabel } from "@/lib/courses/campus";
import { heldOnline } from "@/lib/courses/joiningOnline/model";
import { coversWords, LINK_WILL_BE_HERE } from "@/lib/courses/sessionChange/words";
import { GROUP_FIELD_LIMITS, type GroupSessionMode } from "@/lib/firestore/courseGroups";
import { validateSubmissionUrl, weekDocId } from "@/lib/firestore/courses";

/**
 * WHAT A SESSION CARD IS HANDED ABOUT A CHANGED SESSION,
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

/**
 * WHAT THE TICKET FOR THE GROUP'S NEXT SESSION SAYS: the session's own day, time, room and joining
 * link, each resolved for its own week, so a session moved or held online for
 * one week reads as it will be held, and never as the group's usual slot.
 *
 * The room is left out of an online week. A week with no room yet that is
 * not online names the group's campus in the room's place ("Jubilee"); a
 * week set in person with no room still says the room is to come.
 *
 * THE LINK, whenever the session has one (its week's own or the group's
 * standing one), is on the ticket of everybody in the group, an in-person
 * week's too: somebody may be joining online. `joinFor` says who it is for.
 * A session held online is joined online by everybody; a session held in a
 * room has the link for whoever is joining online, and the room is still
 * where it is (`heldOnline`).
 * The link is the site's only: it is checked as a web address again
 * here, and an online week with no link to show says where it will be,
 * never that anybody will send it. Null once the group has no session left.
 */
export type TicketFacts = {
  weekNumber: number;
  /** Its own week and any cancelled week straight before it that it covers. */
  weekNumbers: number[];
  dateKey: string;
  startTimeLocal: string;
  durationMinutes: number;
  room: string | null;
  mode: GroupSessionMode | null;
  joinUrl: string | null;
  /**
   * Who the link is for: `everybody` when the session is held online,
   * `joining-online` when it is held in a room and the link is for whoever
   * joins from elsewhere. Null with no link.
   */
  joinFor: "everybody" | "joining-online" | null;
  /** A sentence for an online week whose link is not here yet, or an in-person week with no room yet. */
  missing: string | null;
  /** The explainer the session starts with: how long and what about, or null. */
  explainer: { minutes: number; topic: string } | null;
};

export function ticketFacts(group: OverviewGroup): TicketFacts | null {
  const next = group.calendar.nextSession;
  if (!next) return null;
  const mode = group.sessionModes[weekDocId(next.weekNumber)] ?? null;
  const link =
    next.meetingUrl && !validateSubmissionUrl(next.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl) ? next.meetingUrl : null;
  // The link whenever the session has one, an in-person week's too: somebody
  // may be joining it online.
  const joinUrl = link;
  const online = heldOnline({ mode, campus: group.campus ?? null, room: next.location });
  const room = mode !== "virtual" && next.location.trim() ? next.location.trim() : null;
  // Where the room would be, while there is none: the group's campus.
  const standIn = mode !== "virtual" ? campusLabel(group.campus ?? null) || null : null;
  return {
    weekNumber: next.weekNumber,
    weekNumbers: next.weekNumbers.length > 0 ? next.weekNumbers : [next.weekNumber],
    dateKey: next.dateKey,
    startTimeLocal: next.startTimeLocal,
    durationMinutes: next.durationMinutes,
    room: room ?? standIn,
    mode,
    joinUrl,
    joinFor: joinUrl ? (online ? "everybody" : "joining-online") : null,
    missing:
      mode === "virtual" && !joinUrl
        ? LINK_WILL_BE_HERE
        : mode === "in-person" && !room
          ? "Your facilitator will confirm the room."
          : null,
    explainer: next.explainer ?? null,
  };
}

/** The week's session, when it was cancelled and the group kept pace: the reason the group was given. */
export function cancelledIn(group: OverviewGroup, weekNumber: number): { reason: string } | null {
  const found = group.cancelledSessions.find((session) => session.weekNumber === weekNumber);
  return found ? { reason: found.reason } : null;
}
