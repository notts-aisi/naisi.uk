/**
 * THE WORDS OF JOINING A SESSION ONLINE: the button on the ticket of a
 * person's next session on their programme page and what it says once
 * pressed, the route's refusals, the box at the top of a facilitator's group
 * page and register that asks for a meeting link, the register's room or
 * online choice, the line a session's link is given with on a ticket, and
 * the figures that say how many sessions somebody came to in the room and
 * online.
 *
 * Words a member reads never say "mark", "grade" or "score", and never how
 * many sessions anybody can miss. The meeting link is never in an email: the
 * words say it is here, on the site. Every name, day and count is a slot
 * filled from a record. No dash of either kind.
 *
 * Pure, with no import, so the ticket and the register in the browser, the
 * routes on the server and the tests read the same sentences.
 */

// ---------------------------------------------------------------------------
// The ticket, for somebody taking part
// ---------------------------------------------------------------------------

/** The button on the ticket. */
export const JOINING_ONLINE = "Joining online";

/** Its name for a screen reader: "Joining online on Tue 17 Nov". */
export function joiningOnlineLabel(day: string): string {
  return day ? `${JOINING_ONLINE} on ${day}` : JOINING_ONLINE;
}

/** Taking it back, while the session has not started. */
export const IN_THE_ROOM_AFTER_ALL = "I’ll be in the room after all";

/**
 * Once they have said it: who sees it, and where the link will be. With a
 * link already on the ticket, it says the link is there.
 */
export function saidOnlineWords(hasLink: boolean): string {
  return hasLink
    ? "You’ve said you’re joining online, and your facilitators can see that. The link to join is on this ticket."
    : "You’ve said you’re joining online, and your facilitators can see that. The link to join will be on this ticket, not in your emails.";
}

/** What the route answers once it has saved, either way. */
export function onlineSavedWords(online: boolean, hasLink: boolean): string {
  return online ? saidOnlineWords(hasLink) : "You’ve told us you’ll be in the room after all.";
}

/** What the press says while it is on its way. */
export const SAVING = "Saving…";

/** The route's answers, each a sentence the ticket shows as it is. */
export const JOINING_ONLINE_REFUSAL = {
  /** Not one of this group's people, told their group: says nothing of a group they were not told about. */
  notYours: "This isn’t a session of a group you’re in.",
  /** No such session of the group, or one with no day and time. */
  noSession: "That isn’t one of your group’s sessions.",
  started: "That session has already started, so tell your facilitators yourself.",
  cancelled: "That session isn’t happening, so there’s nothing to tell.",
  finished: "That session’s register is already finished.",
  notHeld: "Your facilitators have said that session didn’t happen.",
  online: "That session is online for everybody, so there’s nothing to tell.",
  /** They told us they can't make it: one thing at a time. */
  told: "You’ve told us you can’t make that session. If you can make it after all, say so first.",
  /** A facilitator has filled in their line already: theirs to change, not the person's. */
  marked: "Your facilitators have already filled in that session’s register for you, so tell them yourself.",
  full: "That session’s register is full. Tell your facilitators yourself.",
  failed: "That didn’t save. Try again.",
} as const;

// ---------------------------------------------------------------------------
// The link, on a ticket
// ---------------------------------------------------------------------------

/**
 * Said with the link of a session held in a room, before the line that says
 * the link is only here: the link is for whoever is joining online, and the
 * room is still where the session is.
 */
export const FOR_JOINING_ONLINE = "For anybody joining online.";

// ---------------------------------------------------------------------------
// The facilitators' box, at the top of the group page and the register
// ---------------------------------------------------------------------------

/** "Sam", "Sam and Priya", "Sam, Priya and Kofi". */
export function namesWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "2 people are joining online on Tue 10 Nov.", "1 person is joining online on Tue 10 Nov." */
export function joiningCountWords(count: number, day: string): string {
  const who = count === 1 ? "1 person is" : `${count} people are`;
  return day ? `${who} joining online on ${day}.` : `${who} joining online.`;
}

/** "Sam and Priya are joining online on Tue 10 Nov.", once the session has a link: no prompt. */
export function joiningNamesWords(names: readonly string[], day: string): string {
  const who = `${namesWords(names)} ${names.length === 1 ? "is" : "are"}`;
  return day ? `${who} joining online on ${day}.` : `${who} joining online.`;
}

/** The prompt, after the count: "Add a meeting link for week 2." */
export function addLinkWords(weekNumber: number): string {
  return `Add a meeting link for week ${weekNumber}.`;
}

/** The field's label. */
export function linkFieldLabel(weekNumber: number): string {
  return `Meeting link for week ${weekNumber}`;
}

/** The choice beside it. */
export const EVERY_WEEK = "Keep this link for every week";

/** The button. */
export const ADD_LINK = "Add the link";

/** What it says once saved: where the link is, and that nobody was emailed. */
export const LINK_ADDED =
  "Link added. Everybody in the group sees it on their programme page, and nobody was emailed.";

/** Said under the box: who sees the link and where. */
export const BOX_NOTE = "Your group sees the link on their programme page, never in an email.";

/** The route's answers. */
export const MEETING_LINK_REFUSAL = {
  noSession: "That isn’t one of this group’s sessions.",
  cancelled: "That session isn’t happening, so it needs no link.",
  over: "That session is over, so it needs no link.",
  /** The group already keeps its most weeks apart from its usual slot. */
  full: "This group has too many weeks set apart from its usual slot to add one more. Keep the link for every week instead.",
  failed: "That link didn’t save. Try again.",
} as const;

// ---------------------------------------------------------------------------
// The register's room or online choice
// ---------------------------------------------------------------------------

export const IN_THE_ROOM = "In the room";
export const ONLINE_WORD = "Online";

/** Said after a cell's mark to a screen reader, for somebody who joined online. */
export const JOINED_ONLINE = "Joined online.";

/** Said to a screen reader for somebody who said in advance they are joining online. */
export const SAID_ONLINE_IN_ADVANCE = "They said they’re joining online.";

/**
 * The choice's name for a screen reader: "Where Sam was in week 3: in the
 * room. Sets joined online." Never starting the way the cell's own name does
 * ("Sam, week 3: Present."), so the two are never read as one control.
 */
export function whereChoiceLabel(name: string, weekNumber: number, online: boolean): string {
  return `Where ${name} was in week ${weekNumber}: ${online ? "joined online" : "in the room"}. Sets ${online ? "in the room" : "joined online"}.`;
}

// ---------------------------------------------------------------------------
// The figures
// ---------------------------------------------------------------------------

/** "4 in the room, 1 online": the sessions somebody came to, by where they were. */
export function roomAndOnlineWords(room: number, online: number): string {
  return `${room} in the room, ${online} online`;
}

/** "5 sessions: 4 in the room, 1 online." */
export function sessionsWhereWords(room: number, online: number): string {
  const total = room + online;
  return `${total} ${total === 1 ? "session" : "sessions"}: ${roomAndOnlineWords(room, online)}`;
}
