/**
 * THE WORDS OF CHANGING A SESSION (Q25), in one place: the Sessions view's,
 * the dialog's, the route's refusals, the update it posts and what the
 * group's people read. No imports, so the dialog in the browser and the route
 * on the server say the same thing in the same words.
 *
 * The words the boards draw (wk-session, wk-changes) are copied exactly, with
 * their apostrophes. The words they do not draw are written in the same voice
 * and listed for Claude Design in the build notes.
 *
 * Dates are civil dates ("2026-11-24"), formatted at noon UTC in London, so no
 * offset can move the day a date key names.
 */

const DAY_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function partsOf(dateKey: string): { weekday: string; day: string; month: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const at = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  const parts = DAY_PARTS.formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** "Tue 24 Nov", the house date. "" for anything that is not a date key. */
export function dayWords(dateKey: string): string {
  const parts = partsOf(dateKey);
  return parts ? `${parts.weekday} ${parts.day} ${parts.month}` : "";
}

/** "Thu 19 to Wed 25 Nov", or "Thu 26 Nov to Wed 2 Dec" across a month. */
export function dayRangeWords(fromKey: string, toKey: string): string {
  const from = partsOf(fromKey);
  const to = partsOf(toKey);
  if (!from || !to) return "";
  return from.month === to.month
    ? `${from.weekday} ${from.day} to ${to.weekday} ${to.day} ${to.month}`
    : `${from.weekday} ${from.day} ${from.month} to ${to.weekday} ${to.day} ${to.month}`;
}

/** "6pm", "6:30pm", "12pm" from a stored "18:00". "" for anything that is not a time. */
export function clockWords(hhmm: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = match[2];
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === "00" ? `${twelve}${suffix}` : `${twelve}:${minute}${suffix}`;
}

/**
 * A time a person typed, as the stored "HH:MM", or null when it is not one.
 * Takes the house way ("6pm", "6:30pm", "6 pm") and a 24-hour clock
 * ("18:00", "18.00"). A bare "6" is no time: morning or evening is not ours
 * to guess.
 */
export function parseClock(text: string): string | null {
  const typed = text.trim().toLowerCase().replace(/\s+/g, "");
  const twelve = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)$/.exec(typed);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = Number(twelve[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const h24 = (hour % 12) + (twelve[3] === "pm" ? 12 : 0);
    return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const clock = /^(\d{1,2})[:.](\d{2})$/.exec(typed);
  if (clock) {
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return null;
}

/** Index = `GroupSession.weekday` (`Date.getDay()`, 0 = Sunday). */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesdays 6pm", a group's weekly slot as the Sessions view draws it. "" while it has no day or time. */
export function slotWords(weekday: number, hhmm: string): string {
  const day = WEEKDAYS[weekday];
  const clock = clockWords(hhmm);
  return day && clock ? `${day}s ${clock}` : "";
}

/** "Rahul", "Rahul and Sofia", "Rahul, Sofia and Tom". */
export function namesWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "1 person", "7 people". */
export function peopleWords(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

/** "weeks 4 and 5", "weeks 3, 4 and 5"; "week 4" for one. */
export function weeksWords(weekNumbers: readonly number[]): string {
  if (weekNumbers.length === 1) return `week ${weekNumbers[0]}`;
  return `weeks ${namesWords(weekNumbers.map(String))}`;
}

// ---------------------------------------------------------------------------
// The Sessions view
// ---------------------------------------------------------------------------

export const SESSIONS_VIEW = "Sessions";

/** "Week 4 of 6 · Thu 19 to Wed 25 Nov". */
export function weekHeading(weekNumber: number, totalWeeks: number, range: string): string {
  const week = totalWeeks > 0 ? `Week ${weekNumber} of ${totalWeeks}` : `Week ${weekNumber}`;
  return range ? `${week} · ${range}` : week;
}

/** A break in the run's own plan: "Reading week · Thu 19 to Wed 25 Nov". */
export function breakHeading(label: string, range: string): string {
  return range ? `${label} · ${range}` : label;
}

/** The way to the week before and the week after, as the view's two links say them. */
export function weekLinkWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** "Thursdays 6pm · [Room]". */
export function slotLine(slot: string, room: string): string {
  return [slot, room.trim()].filter(Boolean).join(" · ");
}

/** "Week 4", above a card's session. */
export function cardWeekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** "Today, 6pm" or "Tue 24 Nov, 6pm". */
export function sessionWhenWords(dateKey: string, hhmm: string, todayKey: string): string {
  const day = dateKey === todayKey ? "Today" : dayWords(dateKey);
  const clock = clockWords(hhmm);
  return [day, clock].filter(Boolean).join(", ");
}

export const CHANGE_A_SESSION = "Change a session";

/** What a card says of a session that has been changed. */
export const STATE_WORDS = {
  online: "Online",
  moved: "Moved",
  cancelled: "Cancelled",
} as const;

/** A card whose group has no session in the week shown, because it was pushed back: "Tue 24 Nov · cancelled, the rest a week later". */
export function pushedCardWords(dateKey: string): string {
  return `${dayWords(dateKey)} · cancelled, the rest a week later`;
}

/** A card whose group meets on no day of the week shown. */
export const NO_SESSION_THIS_WEEK = "No session this week";

/** A card whose session has started: it is the register's now. */
export const SESSION_STARTED = "Started";

/** A group's own page of its sessions: "Group B’s sessions". */
export function groupSessionsHeading(groupName: string): string {
  return `${groupName}’s sessions`;
}

export const GROUP_SESSIONS_LEDE =
  "Each session from today to the group’s last. Changing one asks for a reason, and can tell the group.";

export const NO_MORE_SESSIONS = "There are no more sessions to change.";

export const BACK_TO_GROUP = "Back to the group";

/** A Groups tab with groups but no dates yet. */
export const NO_DATES_YET =
  "This programme’s run has no start date yet, so there are no sessions to change.";

/** A Groups tab whose run has no groups. */
export const NO_GROUPS_YET = "There are no groups on this programme yet.";

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

/** "Change Group B’s week 4 session". */
export function changeTitle(groupName: string, weekNumber: number): string {
  return `Change ${groupName}’s week ${weekNumber} session`;
}

/** "Tue 24 Nov · 6pm · [Room] · Rahul and Sofia". */
export function changeSubtitle(parts: { dateKey: string; hhmm: string; where: string; facilitators: string }): string {
  return [dayWords(parts.dateKey), clockWords(parts.hhmm), parts.where.trim(), parts.facilitators]
    .filter(Boolean)
    .join(" · ");
}

export const CLOSE = "Close";
export const WHAT_HAPPENS = "What happens to the session";

export const ONLINE_LABEL = "Hold it online";
/** "Same day and time. The join link goes on Group B’s programme page, never in an email." */
export function onlineHint(groupName: string): string {
  return `Same day and time. The join link goes on ${groupName}’s programme page, never in an email.`;
}
/** Why "Hold it online" cannot be chosen. */
export function noLinkHint(groupName: string): string {
  return `${groupName} has no join link yet, so it can’t be held online. Add the link to the group’s session first.`;
}

export const MOVE_LABEL = "Move it";
export const MOVE_HINT = "One week only.";
export const DAY_LABEL = "Day";
export const TIME_LABEL = "Time";
export const ROOM_LABEL = "Room";

export const KEEP_PACE_LABEL = "Cancel it, and keep pace";
/**
 * "Week 4’s reading stays open. On Tue 1 Dec the group talks about weeks 4
 * and 5 together, and still finishes on Tue 8 Dec."
 */
export function keepPaceHint(args: {
  weekNumber: number;
  next: { dateKey: string; weekNumbers: readonly number[] } | null;
  finishDateKey: string;
  finishMoves: boolean;
}): string {
  const opening = `Week ${args.weekNumber}’s reading stays open.`;
  if (!args.next) {
    return args.finishDateKey
      ? `${opening} There’s no session after it, so the group finishes on ${dayWords(args.finishDateKey)}.`
      : opening;
  }
  const together = `On ${dayWords(args.next.dateKey)} the group talks about ${weeksWords(args.next.weekNumbers)} together`;
  if (!args.finishDateKey) return `${opening} ${together}.`;
  const finish = args.finishMoves ? "and finishes on" : "and still finishes on";
  return `${opening} ${together}, ${finish} ${dayWords(args.finishDateKey)}.`;
}

export const PUSH_LABEL = "Cancel it, and push the rest back a week";
/**
 * "Group B’s last session would move to Tue 15 Dec." The board adds ", after
 * term ends on Fri 11 Dec" when that is true; nothing on the site holds when
 * a term ends yet, so the clause is never said.
 */
export function pushHint(groupName: string, lastDateKey: string): string {
  return lastDateKey ? `${groupName}’s last session would move to ${dayWords(lastDateKey)}.` : "";
}

export const RESTORE_LABEL = "Hold it as usual";
/** "Back to Tuesdays 6pm in [Room], like the group’s other weeks." */
export function restoreHint(slot: string, room: string): string {
  const where = room.trim() ? ` in ${room.trim()}` : "";
  return slot ? `Back to ${slot}${where}, like the group’s other weeks.` : "Back to how the group’s other weeks meet.";
}

/** What a changed session says it is now, above the options. */
export function currentlyWords(kind: "online" | "moved" | "cancelled"): string {
  if (kind === "online") return "This session is being held online.";
  if (kind === "moved") return "This session has been moved.";
  return "This session is cancelled.";
}

export const REASON_LABEL = "Reason (the group sees this)";

export const TELL_LABEL = "Tell the group";
/** "Emails the 7 people in Group B and puts an update on their programme page." */
export function tellLine(groupName: string, people: number, emails: number): string {
  if (people === 0) return `Nobody is in ${groupName} yet, so there is nobody to tell.`;
  if (emails === 0) return `Puts an update on ${groupName}’s programme page. Nobody in it can be emailed yet.`;
  if (emails >= people) {
    return `Emails the ${peopleWords(people)} in ${groupName} and puts an update on their programme page.`;
  }
  return `Emails ${emails} of the ${peopleWords(people)} in ${groupName} and puts an update on their programme page.`;
}
/** Over what one send can take. */
export const TOO_MANY_TO_TELL = "Too many people to email in one send. Tell them with an update from Messages.";

/** The button, which names the session: "Cancel Tue 24 Nov’s session". Before a choice, "Change Tue 24 Nov’s session". */
export function pressWords(kind: ChangeKind | null, dateKey: string): string {
  const day = dayWords(dateKey);
  if (kind === null) return `Change ${day}’s session`;
  if (kind === "online") return `Hold ${day}’s session online`;
  if (kind === "move") return `Move ${day}’s session`;
  if (kind === "restore") return `Hold ${day}’s session as usual`;
  return `Cancel ${day}’s session`;
}

/** Beside the button: "Emails 7 people". */
export function emailsLine(emails: number): string {
  return `Emails ${peopleWords(emails)}`;
}

export const KEEP_IT = "Keep it";
export const CHANGING = "Changing…";
export const CHOOSE_FIRST = "Choose what happens to the session.";

/** "Rahul, Sofia, Claudia and admins can change a session." */
export function whoCanLine(firstNames: readonly string[]): string {
  const names = [...new Set(firstNames.filter(Boolean))];
  return names.length > 0
    ? `${names.join(", ")} and admins can change a session.`
    : "Admins can change a session.";
}

/** After a press, the first half: what is now true. */
export function changedWords(kind: ChangeKind, dateKey: string): string {
  const day = dayWords(dateKey);
  if (kind === "online") return `${day}’s session is online.`;
  if (kind === "move") return `${day}’s session has moved.`;
  if (kind === "restore") return `The session is back to usual, on ${day}.`;
  if (kind === "push") return `${day}’s session is cancelled, and the rest move back a week.`;
  return `${day}’s session is cancelled.`;
}

/** After a press with Tell the group off. */
export const NOBODY_TOLD = "Nobody was told.";

/** The change went through and the update did not: what to do about it. */
export function notToldWords(reason: string): string {
  return `The group hasn’t been told yet: ${reason} Press Tell the group to try again.`;
}

export const TELL_AGAIN = "Tell the group";

/** When the dialog cannot say whether the change went through. */
export const UNKNOWN_OUTCOME =
  "We couldn’t tell whether that went through. Close this and look at the session before you press again.";

// ---------------------------------------------------------------------------
// The kinds a press asks for
// ---------------------------------------------------------------------------

/** What the dialog's options send: `cancel` keeps pace, `push` moves the rest back. */
export type ChangeKind = "online" | "move" | "cancel" | "push" | "restore";

export const CHANGE_KINDS: readonly ChangeKind[] = ["online", "move", "cancel", "push", "restore"];

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const REFUSAL = {
  body: "Expected a JSON object body.",
  week: "Say which week’s session to change.",
  date: "Say which session to change: the date it was on is missing.",
  kind: "Choose what happens to the session.",
  reason: "Give a reason. The group sees it.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason. It goes into an email, and a link to a session never does.",
  tell: "Choose whether to tell the group.",
  emailCount: "Say how many people the button said it would email.",
  move: "Say the day, the time and the room it moves to.",
  time: "Write the time like 6pm.",
  room: "Say which room it’s in.",
  roomLink: "A room can’t be a link. To meet online, choose Hold it online.",
  sameAsNow: "That’s already when and where it is. Change the day, the time or the room.",
  gone: "That group isn’t on this programme any more.",
  noSuchSession: "That group has no session in that week.",
  started: "That session has started, so it can’t be changed now.",
  stale: "That session has changed since this was opened. Close it and open it again.",
  noLink: "This group has no join link yet, so it can’t be held online. Add the link to the group’s session first.",
  notChanged: "That session is already as usual.",
  noPlan: "That week isn’t in the group’s plan, so it can’t be pushed back.",
  planFull: "The group’s plan is full, so it can’t take another week.",
  movedIntoPast: "That day and time have passed. Choose a later one.",
  full: "This group has changed 20 of its weeks already, which is all a group can hold. Ask an admin.",
  overCap: "Too many people to email in one send. Turn off Tell the group, then tell them with an update from Messages.",
  nobodyToEmail: "Nobody in the group can be emailed yet. Turn off Tell the group to change it without telling them.",
} as const;

/** "The reason must be 200 characters or fewer." */
export function reasonTooLongWords(max: number): string {
  return `The reason must be ${max} characters or fewer.`;
}

/** "Choose a day in week 4, from Thu 19 to Wed 25 Nov." */
export function dayOutOfWeekWords(weekNumber: number, range: string): string {
  return `Choose a day in week ${weekNumber}, from ${range}.`;
}

/** The count on the button is a promise, as an update's is. */
export function countChangedWords(emails: number): string {
  return `The number of people this emails has changed to ${emails}. Check it, then press again.`;
}

// ---------------------------------------------------------------------------
// The update "Tell the group" posts
// ---------------------------------------------------------------------------

/**
 * The update's title and message. The board draws the cancelled one exactly
 * ("Tue 24 Nov’s session is cancelled" / "Rahul and Sofia are both away.
 * Week 4’s reading stays open."); the others are in the same voice. None
 * carries a link: the reason refuses one, a room refuses one, and the online
 * one says where the link is instead.
 */
export function updateWords(
  change:
    | { kind: "cancel"; dateKey: string; weekNumber: number }
    | { kind: "push"; dateKey: string; weekNumber: number; newDateKey: string }
    | { kind: "online"; dateKey: string }
    | { kind: "move"; dateKey: string; newDateKey: string; hhmm: string; room: string }
    | { kind: "restore"; weekNumber: number; dateKey: string; hhmm: string; room: string },
  reason: string,
): { title: string; message: string } {
  const day = dayWords(change.dateKey);
  const because = reason.trim();
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
  switch (change.kind) {
    case "cancel":
      return {
        title: `${day}’s session is cancelled`,
        message: join(because, `Week ${change.weekNumber}’s reading stays open.`),
      };
    case "push":
      return {
        title: `${day}’s session is cancelled`,
        message: join(
          because,
          `Week ${change.weekNumber} is now on ${dayWords(change.newDateKey)}, and every session after it moves back a week.`,
        ),
      };
    case "online":
      return {
        title: `${day}’s session is online`,
        message: join(because, "Same day and time. The link to join is on your programme page, not in your emails."),
      };
    case "move": {
      const where = change.room.trim() ? ` in ${change.room.trim()}` : "";
      return {
        title: `${day}’s session has moved`,
        message: join(
          because,
          `It’s on ${dayWords(change.newDateKey)} at ${clockWords(change.hhmm)}${where}, this week only.`,
        ),
      };
    }
    case "restore": {
      const where = change.room.trim() ? ` in ${change.room.trim()}` : "";
      return {
        title: `Week ${change.weekNumber}’s session is back to usual`,
        message: join(because, `It’s on ${day} at ${clockWords(change.hhmm)}${where}.`),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// What the group's people read (wk-changes)
// ---------------------------------------------------------------------------

/** The notice's heading: "No session tonight" on the evening, "No session today" before 5pm, the date before the day. */
export function noticeHeading(dateKey: string, hhmm: string, todayKey: string): string {
  if (dateKey !== todayKey) return `No session on ${dayWords(dateKey)}`;
  const hour = Number(hhmm.slice(0, 2));
  return Number.isInteger(hour) && hour >= 17 ? "No session tonight" : "No session today";
}

/** "Tue 24 Nov is cancelled. Rahul and Sofia are both away." */
export function noticeCancelledLine(dateKey: string, reason: string): string {
  return [`${dayWords(dateKey)} is cancelled.`, reason.trim()].filter(Boolean).join(" ");
}

/** "Do week 4’s reading anyway. On Tue 1 Dec you’ll talk about weeks 4 and 5 together." */
export function noticeKeepPaceLine(
  weekNumber: number,
  next: { dateKey: string; weekNumbers: readonly number[] } | null,
): string {
  const reading = `Do week ${weekNumber}’s reading anyway.`;
  if (!next) return reading;
  return `${reading} On ${dayWords(next.dateKey)} you’ll talk about ${weeksWords(next.weekNumbers)} together.`;
}

/** "Week 4 is now on Tue 1 Dec, and every session after it moves back a week." */
export function noticePushedLine(weekNumber: number, newDateKey: string): string {
  return newDateKey
    ? `Week ${weekNumber} is now on ${dayWords(newDateKey)}, and every session after it moves back a week.`
    : `Week ${weekNumber} and every session after it move back a week.`;
}

/** The card for a session that covers more than its own week: "Tue 1 Dec · weeks 4 and 5". */
export function coversWords(dateKey: string, weekNumbers: readonly number[]): string {
  return `${dayWords(dateKey)} · ${weeksWords(weekNumbers)}`;
}

/** A week page's card for a cancelled week. */
export const CANCELLED_CARD = "Cancelled";

/** The label of the slot a pushed-back session leaves in the group's plan. */
export const PUSHED_BREAK_LABEL = "No session this week";

/** Under "Join online", on every card that offers the link. */
export const LINK_IS_HERE = "The link is here, not in your emails, so it can’t be forwarded.";

/** The button that opens the link. */
export const JOIN_ONLINE = "Join online";

/** An online week whose link the card cannot give: never a promise to send it. */
export const LINK_WILL_BE_HERE = "The link to join will be here, not in your emails.";
