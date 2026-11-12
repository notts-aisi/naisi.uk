import { clockWords, dayWords, hoursWords, slotRangeWords } from "../sessionChange/words";

/**
 * THE WORDS OF A GROUP'S HISTORY: the one sentence each row about a group's
 * time, room, link or facilitators keeps (`courseAudit.detail`), as the
 * group's History tab reads a row: what changed, what it was before, the
 * reason and how many were emailed. "Moved week 2 to Thu 12 Nov, 3pm, Monica
 * Partridge E02. Before: Wed 11 Nov, 3pm, Portland A21. Reason: Portland A21
 * is closed for an exam. Emailed 7."
 *
 * Pure and with no imports beyond the house's own clock and dates, so the
 * routes and the tests say the same thing. Never a meeting link: the link
 * rows say which weeks, not what.
 */

/** One session as a history row names it: "Thu 12 Nov, 3pm, Monica Partridge E02". */
export function momentWords(moment: { dateKey: string; hhmm: string; room: string }): string {
  return [dayWords(moment.dateKey), clockWords(moment.hhmm), moment.room.trim()].filter(Boolean).join(", ");
}

/** "Room to be confirmed", for a room left empty on purpose, in a row. */
export const ROOM_TO_BE_CONFIRMED = "Room to be confirmed";

/** "Reason: Portland A21 is closed.", with a full stop; "" with none. */
export function reasonWords(reason: string | null | undefined): string {
  const said = (reason ?? "").trim();
  if (!said) return "";
  return /[.!?]$/.test(said) ? `Reason: ${said}` : `Reason: ${said}.`;
}

/** "Emailed 7." / "Emailed 1." / "Nobody was emailed." */
export function emailedWords(emailed: number): string {
  return emailed > 0 ? `Emailed ${emailed}.` : "Nobody was emailed.";
}

/** The row's one sentence: the headline, then before, the reason and who was emailed, each only when there is one. */
export function historyDetail(parts: {
  headline: string;
  before?: string;
  reason?: string | null;
  emailed?: number | null;
}): string {
  return [
    parts.headline,
    parts.before ? `Before: ${parts.before}.` : "",
    reasonWords(parts.reason),
    parts.emailed === undefined || parts.emailed === null ? "" : emailedWords(parts.emailed),
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// One week
// ---------------------------------------------------------------------------

/** "Moved week 2 to Thu 12 Nov, 3pm, Monica Partridge E02." */
export function movedHeadline(weekNumber: number, to: { dateKey: string; hhmm: string; room: string }): string {
  return `Moved week ${weekNumber} to ${momentWords({ ...to, room: to.room || ROOM_TO_BE_CONFIRMED })}.`;
}

/** "Recorded week 2 as met on Tue 10 Nov, 10am, George Green A04." */
export function putRightHeadline(weekNumber: number, to: { dateKey: string; hhmm: string; room: string }): string {
  return `Recorded week ${weekNumber} as met on ${momentWords(to)}.`;
}

/** "Held week 4 online, Wed 25 Nov, 3pm." */
export function onlineHeadline(weekNumber: number, at: { dateKey: string; hhmm: string }): string {
  return `Held week ${weekNumber} online, ${dayWords(at.dateKey)}, ${clockWords(at.hhmm)}.`;
}

/** "Cancelled week 2’s session on Wed 11 Nov, keeping pace." */
export function cancelledHeadline(weekNumber: number, dateKey: string): string {
  return `Cancelled week ${weekNumber}’s session on ${dayWords(dateKey)}, keeping pace.`;
}

/** "Cancelled week 2’s session on Wed 11 Nov and pushed it and the rest back a week, to Wed 18 Nov." */
export function pushedHeadline(weekNumber: number, dateKey: string, newDateKey: string): string {
  const to = newDateKey ? `, to ${dayWords(newDateKey)}` : "";
  return `Cancelled week ${weekNumber}’s session on ${dayWords(dateKey)} and pushed it and the rest back a week${to}.`;
}

/** "Put week 2 back as usual: Wed 11 Nov, 3pm, Portland A21." */
export function restoredHeadline(weekNumber: number, to: { dateKey: string; hhmm: string; room: string }): string {
  return `Put week ${weekNumber} back as usual: ${momentWords(to)}.`;
}

// ---------------------------------------------------------------------------
// The group's regular time, room, link and facilitators
// ---------------------------------------------------------------------------

/** "Tuesdays, 5:30pm to 7:30pm, Monica Partridge C10" (the room, or Room to be confirmed). */
export function regularWords(slot: { weekday: number; hhmm: string; minutes: number; room: string }): string {
  const when = slotRangeWords(slot.weekday, slot.hhmm, slot.minutes);
  const [day, ...rest] = when.split(" ");
  const said = rest.length > 0 ? `${day}, ${rest.join(" ")}` : when;
  return [said, slot.room.trim() || ROOM_TO_BE_CONFIRMED].filter(Boolean).join(", ");
}

/** "Changed the regular time to Tuesdays, 5:30pm to 7:30pm, Room to be confirmed, from week 2." */
export function regularHeadline(
  fromWeek: number,
  slot: { weekday: number; hhmm: string; minutes: number; room: string },
  pinned: readonly number[],
): string {
  const kept = pinned.length === 0 ? "" : ` ${keptWeeksWords(pinned)} kept the times they met.`;
  return `Changed the regular time to ${regularWords(slot)}, from week ${fromWeek}.${kept}`;
}

/** "Week 1", "Weeks 1 and 2", "Weeks 1, 2 and 3". */
export function keptWeeksWords(weeks: readonly number[]): string {
  if (weeks.length === 1) return `Week ${weeks[0]}`;
  const listed = weeks.map(String);
  return `Weeks ${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}`;
}

/** "Set the room to Monica Partridge C10." / "Took the room away: Room to be confirmed." */
export function roomHeadline(room: string): string {
  return room.trim() ? `Set the room to ${room.trim()}.` : `Took the room away: ${ROOM_TO_BE_CONFIRMED.toLowerCase()}.`;
}

/** "Set the meeting link for week 2 only." / "Set the meeting link for every week, from week 2." Never the link. */
export function linkHeadline(weekNumber: number, everyWeek: boolean): string {
  return everyWeek
    ? `Set the meeting link for every week, from week ${weekNumber}.`
    : `Set the meeting link for week ${weekNumber} only.`;
}

/** "Before: no link." / "Before: a link of its own." Never the link. */
export function linkBeforeWords(had: boolean): string {
  return had ? "a link was set" : "no link";
}

/** "Added Rahul Mehta as a facilitator." */
export function facilitatorAddedHeadline(name: string): string {
  return `Added ${name} as a facilitator.`;
}

/** "Took Rahul Mehta off the group’s facilitators." */
export function facilitatorRemovedHeadline(name: string): string {
  return `Took ${name} off the group’s facilitators.`;
}

/** "Thu 12 Nov, 3pm to 5pm": a session's day and hours, for a sentence. */
export function sessionHoursWords(dateKey: string, hhmm: string, minutes: number): string {
  return [dayWords(dateKey), hoursWords(hhmm, minutes)].filter(Boolean).join(", ");
}
