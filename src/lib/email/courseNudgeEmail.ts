import "server-only";
import { couldBeFollowed } from "@/lib/courses/followable";
import type { GroupSession, GroupSessionMode } from "@/lib/firestore/courseGroups";

/**
 * WHAT OUTLIVES THE WEEKLY NUDGE: the three pieces of the old weekly course
 * email that the week's emails, the register's page and the programme's
 * Overview still share. The nudge itself (its admin-edited template, its
 * renderer and the run-wide catch-up send) is gone; "Week N is open" and the
 * reminders before a session are fixed words in
 * `src/lib/courses/weekEmails/words.ts`.
 *
 *  - `groupNudgeMarkerId`: the ONE claim on a group's "Week N is open" about
 *    one session, which both of that email's lanes take
 *    (`src/lib/courses/nextWeekEmail.ts`). Its name and its ids are the
 *    nudge's, kept so every claim already written keeps meaning what it
 *    meant: a group mailed about a session is never mailed about it again.
 *  - `courseNudgeSessionWhere`: where a session is, as an email may print it.
 *  - `courseWeekUrl`: the week's page, as a link in an email.
 */

/**
 * THE GROUP'S CLAIM ON ITS EMAIL ABOUT ONE SESSION: one document per (run,
 * group, session slot) in `courseNudges`, created with `.create()` before the
 * first message goes, by the register's push and by the
 * `courses-next-week-email` job alike. Two presses, two ticks, or a press and
 * a tick aim at one document, and one of them sends.
 *
 * KEYED ON THE SESSION'S SLOT (the civil date its week began), so
 * renumbering a plan cannot move a claim already taken. CONSTRUCT-ONLY, never
 * parsed: `runId`, `groupId`, `slotStartKey`, `weekNumber` and `weekId` are
 * stored as fields on the document. A prefix of its own, so it cannot collide
 * with the `emailrate__` send throttle in the same collection.
 *
 * ── THE OCCURRENCE IS PART OF THE KEY ───────────────────────────────────────
 * A group that meets twice in a week holds two sessions inside ONE slot, so
 * the occurrence is appended, and BYTE-IDENTICALLY ABSENT FOR 1, on the same
 * rule `sessionKey` follows. Every claim written before the argument existed
 * keeps its id.
 */
export function groupNudgeMarkerId(
  runId: string,
  groupId: string,
  nextSlotStartKey: string,
  occurrence: number = 1,
): string {
  const base = `gnudge__${runId}__${groupId}__${nextSlotStartKey}`;
  const n = Number.isInteger(occurrence) ? occurrence : 1;
  return n <= 1 ? base : `${base}-${n}`;
}

/**
 * WHERE A SESSION IS, as an email may print it: the room, "Online", or "".
 *
 * DELIBERATELY NEVER THE GROUP'S VIDEO LINK. It lives behind the authed group
 * page for a reason, and email is the most forwardable surface there is: an
 * online group gets the word "Online" here and the real link on the page it
 * is one click from. A group with neither a room nor a link returns "".
 *
 * ── `mode` OVERRIDES THE STORED FIELDS ──────────────────────────────────────
 * The week's own online or in-person switch wins over what the slot carries:
 *
 *   · `"virtual"`   → "Online", whatever the room says;
 *   · `"in-person"` → the room, and NEVER "Online": a group with a standing
 *                     link that meets in a room this week is told the room,
 *                     or nothing when no room is stored;
 *   · `null`        → the room when there is one, "Online" when there is
 *                     only a link.
 *
 * ── A ROOM IS TYPED BY A PERSON, AND A LINK CAN BE TYPED INTO ONE ───────────
 * So the room is asked about before it is printed (`couldBeFollowed`, the one
 * function the placement email asks too). A room a reader could follow is not
 * printed: the answer is "", exactly as for a group with no room. It is never
 * turned into "Online": a room that holds a link may still be a room.
 */
export function courseNudgeSessionWhere(
  session: GroupSession | null | undefined,
  mode?: GroupSessionMode | null,
): string {
  if (!session) return "";
  const location = session.location.trim();
  // What is printed of the room: nothing, when a reader could follow it.
  const room = couldBeFollowed(location) ? "" : location;
  if (mode === "virtual") return "Online";
  if (mode === "in-person") return room;
  if (location) return room;
  return session.meetingUrl ? "Online" : "";
}

/** The week's page on the site for this run, or "" when a part of it is missing. */
export function courseWeekUrl(
  appUrl: string,
  runId: string,
  weekNumber: number,
): string {
  const base = appUrl.replace(/\/+$/, "");
  if (!base || !runId || !Number.isFinite(weekNumber) || weekNumber < 1) return "";
  return `${base}/learn/${encodeURIComponent(runId)}/weeks/${Math.floor(weekNumber)}`;
}
