/**
 * THE WORDS OF JOINING A SESSION ONLINE: the button on the ticket of a
 * person's next session on their programme page and what it says once
 * pressed, the route's refusals, the box at the top of a facilitator's group
 * page and register that asks for a meeting link, the email that tells the
 * group's facilitators somebody is joining a session online, the register's
 * room or online choice, the line a session's link is given with on a
 * ticket, and the figures that say how many sessions somebody came to in the
 * room and online.
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
// The email to the group's facilitators
// ---------------------------------------------------------------------------

/** One email's words: its subject, its lines, its button and the line at its foot. */
export type JoiningOnlineEmailWords = {
  subject: string;
  lines: string[];
  button: string;
  footnote: string;
};

/** "week 2", or "week 2’s session 2" for a week's second session. */
function sessionOfWeekWords(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `week ${weekNumber}’s session ${occurrence}` : `week ${weekNumber}`;
}

/**
 * "Daniel Kim is joining week 2 online": to each of the group's facilitators,
 * once per person per session. Says that somebody is joining online, when,
 * and where the link goes: with no link yet, the box at the top of their
 * group page, by its own field and button (`linkFieldLabel`, `ADD_LINK`), so
 * the email can never name a control the page does not have; with one, that
 * there is nothing to add. NEVER THE LINK, and no reason for anything. The
 * day and the time come as words ("Wed 11 Nov", "3pm"); with no time, the day
 * alone.
 */
export function joiningOnlineEmailWords(input: {
  /** The person, as the group page names them to its readers. */
  personName: string;
  groupName: string;
  weekNumber: number;
  occurrence: number;
  /** "Wed 11 Nov". */
  day: string;
  /** "3pm", or "" with no time set. */
  time: string;
  /** The session has a meeting link at the moment of the send. */
  hasLink: boolean;
}): JoiningOnlineEmailWords {
  const person = input.personName.trim() || "Somebody in your group";
  const group = input.groupName.trim() || "your group";
  const week = sessionOfWeekWords(input.weekNumber, input.occurrence);
  // "Group C’s week 2 session", or "Group C’s week 2’s session 2".
  const session = input.occurrence > 1 ? `${group}’s ${week}` : `${group}’s ${week} session`;
  const when = input.day ? (input.time ? `, on ${input.day} at ${input.time}` : `, on ${input.day}`) : "";
  const about = input.hasLink
    ? `The session already has a meeting link, so there’s nothing to add. Everybody in ${group} sees it on their programme page.`
    : `The session has no meeting link yet. To add one, open your group page: the box at the top has a field “${linkFieldLabel(input.weekNumber)}”. ` +
      `Paste the link there and press “${ADD_LINK}”. Everybody in ${group} then sees it on their programme page. It is never sent by email.`;
  return {
    subject: `${person} is joining ${week} online`,
    lines: [`${person} will join ${session} online${when}.`, about],
    button: "Open your group",
    footnote: "This is an automated email, sent because somebody in your group said they’re joining online.",
  };
}

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
