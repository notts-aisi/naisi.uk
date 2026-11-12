/**
 * A GROUP'S PAGE AS ARITHMETIC: which state each week is in, where the term
 * is, the words on every button that emails, and the lines of "What will
 * happen", worked out from what the change routes' previews answer
 * (`POST /api/courses/groups/[groupId]/session/change` and `.../regular`,
 * each with `preview: true`).
 *
 * PURE. No reads, no clock: every date and instant is handed in. The page,
 * its change panel in the browser and the tests ask these functions, so the
 * panel cannot say one thing and a test check another. Times print through
 * the house clock: stored wall clocks through `clockWords` and `hoursWords`,
 * instants through `londonDayLabel` and `londonClockLabel`.
 */

import type { GroupCampus } from "../campus";
import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { CAMPUS_LABEL } from "../campusWords";
import { clockWords, dayWords, hoursWords, namesWords, peopleWords } from "../sessionChange/words";
import { weekdaysWords } from "../regularTime/words";
import type { DidNotHappenPreview } from "../registerCover/pageWords";
import {
  ROOM_TO_BE_CONFIRMED,
  type HistoryFilter,
  type TermChip,
  type WeekSaid,
  type WeekState,
} from "./words";

// ---------------------------------------------------------------------------
// The page's own shape, as the server hands it to the browser
// ---------------------------------------------------------------------------

export type GroupPageViewer = "admin" | "lead" | "facilitator";

/** What a week's change record says it is, when it has one. */
export type WeekChange = "online" | "moved" | "cancelled" | "pushed";

/** One taught week of the group's plan, its first session, as the page draws it. Names only: no address, no link. */
export type GroupPageWeek = {
  weekNumber: number;
  weekId: string;
  /** Keys the week's register and its link ("w03"). */
  sessionKey: string;
  /** The week's title on the run ("How fast"), or "". */
  title: string;
  /** The session's civil date, "" when the calendar cannot date it. */
  dateKey: string;
  /** Stored "HH:MM"; printed through the house clock. */
  hhmm: string;
  minutes: number;
  /** The week's room, "" for one still to book. */
  room: string;
  campus: GroupCampus | null;
  online: boolean;
  cancelled: boolean;
  change: WeekChange | null;
  state: WeekState;
  /** Its start has passed. */
  started: boolean;
  /** Its end has passed. */
  ended: boolean;
  /** Its register was taken (finished, marked, or said not to have happened). */
  taken: boolean;
  /** The week has a meeting link, its own or the group's. Never the link. */
  hasLink: boolean;
  /** The seven days of the week's slot, for a move's Day. */
  slotDays: string[];
  /** Who said they are joining this session online, and who said they can't make it: names. */
  joiningOnline: string[];
  cantMakeIt: string[];
  /** The group's people for this session and what each has said. Empty on the facilitator's page. */
  people: { uid: string; name: string; said: WeekSaid }[];
  /** Its register is finished. */
  finished: boolean;
  /** Its register says the session did not happen (the old switch). */
  heldFalse: boolean;
  /** One of the group's facilitators has started its register (saved a mark or set a line). */
  facilitatorStarted: boolean;
  /**
   * Who took its register in a facilitator's place, or was given the
   * session, by name, and whether a session given still holds; null with
   * nobody, and always on the facilitator's page.
   */
  cover: { kind: "self" | "given"; byName: string; live: boolean } | null;
  /** "Started 12 minutes ago", for a session that has started; "" before. */
  startedAgo: string;
};

/** One row of the group's history, as the History tab draws it. */
export type GroupPageHistoryRow = {
  id: string;
  /** An instant, or null for a row with no time. */
  at: string | null;
  actorName: string;
  headline: string;
  rest: string;
  category: "time-and-room" | "people" | "link" | "registers" | "other";
};

/** Everything a group's page draws, read on the server (`loadGroupPage`). Names only: no address, no link. */
export type GroupPageView = {
  viewer: GroupPageViewer;
  runId: string;
  groupId: string;
  groupName: string;
  /** The programme in a sentence, for the way back ("AGI Strategy Fellowship"). */
  programmeName: string;
  incubator: boolean;
  /** "Week 2 is tomorrow", or null with nothing to say. */
  chip: string | null;
  /** The group's facilitators by name, and by first name for a week's "with Rahul". */
  facilitatorNames: string[];
  facilitatorFirstNames: string[];
  /** The group's fellows, never its facilitators. */
  peopleCount: number;
  /** Facilitators who also hold a place in the group: named apart, never counted. */
  facilitatorsWithPlaces: string[];
  meets: {
    weekday: number;
    /** Stored "HH:MM", "" with no time yet. */
    hhmm: string;
    minutes: number;
    room: string;
    campus: GroupCampus | null;
    /** The group has a standing link. Never the link. */
    hasLink: boolean;
  };
  /** Admins, the programme's lead and the run's track leads change the regular time and room. */
  canChangeRegular: boolean;
  /** The programme's lead's first name, for the facilitator's "Claudia or an admin ..." */
  leadFirstName: string | null;
  weeks: GroupPageWeek[];
  /** The week the page opens on. */
  openWeek: number | null;
  todayKey: string;
  /** Who a notice about the group's room reaches, never the viewer: the send's own count. */
  notice: { emails: number; refused: boolean };
  /** The session "Set the link" for every week saves on: the next one still to end, not cancelled. */
  linkSessionKey: string | null;
  linkWeekNumber: number | null;
  /** The group's history, for admins and the lead; null on the facilitator's page. */
  history: { rows: GroupPageHistoryRow[]; more: boolean } | null;
};

/** A week's register, as the ways to take it in a facilitator's place ask it (`coverChoicesOf`). */
export function weekRegisterFacts(week: GroupPageWeek): {
  weekNumber: number;
  started: boolean;
  cancelled: boolean;
  dated: boolean;
  finished: boolean;
  heldFalse: boolean;
  facilitatorStarted: boolean;
  covered: boolean;
  taken: boolean;
} {
  return {
    weekNumber: week.weekNumber,
    started: week.started,
    cancelled: week.cancelled,
    dated: Boolean(week.dateKey && week.hhmm),
    finished: week.finished,
    heldFalse: week.heldFalse,
    facilitatorStarted: week.facilitatorStarted,
    covered: week.cover !== null,
    taken: week.taken,
  };
}

// ---------------------------------------------------------------------------
// Which state a week is in
// ---------------------------------------------------------------------------

/**
 * A week's state, most telling first: a register taken says it met (or
 * didn't happen); a cancelled week says so; a session that has passed with
 * no register says that; then today and tomorrow; then a week changed on its
 * own; otherwise nothing.
 */
export function weekStateOf(input: {
  dateKey: string;
  started: boolean;
  taken: boolean;
  /** The register says the session did not happen. */
  heldFalse: boolean;
  cancelled: boolean;
  change: WeekChange | null;
  online: boolean;
  todayKey: string;
  tomorrowKey: string;
}): WeekState {
  if (input.taken) return input.heldFalse ? "didnt-happen" : "met";
  if (input.cancelled) return "cancelled";
  if (input.started) return "no-register";
  if (input.dateKey && input.dateKey === input.todayKey) return "today";
  if (input.dateKey && input.dateKey === input.tomorrowKey) return "tomorrow";
  if (input.change === "moved" || input.change === "pushed") return "moved";
  if (input.online) return "online";
  return "upcoming";
}

/** The week the page opens on: the first whose session has not ended and is not cancelled, else the last. */
export function openingWeek(weeks: readonly GroupPageWeek[]): number | null {
  const next = weeks.find((week) => !week.ended && !week.cancelled && week.dateKey);
  return next?.weekNumber ?? weeks[weeks.length - 1]?.weekNumber ?? null;
}

/** Where the term is, for the chip beside the group's name. */
export function termChipOf(weeks: readonly GroupPageWeek[], peopleCount: number, todayKey: string, tomorrowKey: string): TermChip | null {
  const next = weeks.find((week) => !week.ended && !week.cancelled && week.dateKey);
  if (next) {
    if (next.dateKey === todayKey) return { kind: "today", weekNumber: next.weekNumber };
    if (next.dateKey === tomorrowKey) return { kind: "tomorrow", weekNumber: next.weekNumber };
    if (peopleCount === 0 && !weeks.some((week) => week.taken)) return { kind: "new" };
    return { kind: "on", weekNumber: next.weekNumber, dateKey: next.dateKey };
  }
  if (weeks.some((week) => week.dateKey)) return { kind: "finished" };
  return peopleCount === 0 ? { kind: "new" } : null;
}

/** The week after this one, for "Cancel and keep pace": its number and date. */
export function weekAfter(weeks: readonly GroupPageWeek[], weekNumber: number): { weekNumber: number; dateKey: string } | null {
  const later = weeks.find((week) => week.weekNumber > weekNumber && !week.cancelled && week.dateKey);
  return later ? { weekNumber: later.weekNumber, dateKey: later.dateKey } : null;
}

/**
 * What one-week choices a week offers, from the page's own facts (the week,
 * and the group's weeks in plan order); the route decides again. "Cancel and
 * push the rest back" moves every later week, so it is not offered once a
 * later week's register was taken: nothing may move a session that met.
 */
export function oneWeekChoicesOf(
  week: GroupPageWeek,
  weeks: readonly GroupPageWeek[],
): {
  /** A week that passed with no register: the four choices of putting it right. */
  putRight: boolean;
  /** The week met: nothing to change. */
  met: boolean;
  online: boolean;
  restore: boolean;
  /** Cancel and push the rest back a week: no later week has met. */
  push: boolean;
} {
  const met = week.taken;
  const putRight = !met && week.started;
  const index = weeks.findIndex((each) => each.weekNumber === week.weekNumber);
  const laterMet = index >= 0 && weeks.slice(index + 1).some((each) => each.taken);
  return {
    putRight,
    met,
    online: !met && !week.started && week.hasLink && !week.online,
    restore: !met && !week.started && week.change !== null && week.change !== "pushed",
    push: !met && !laterMet,
  };
}

/** The days a move can land on: today or later for a move, today or earlier for "It met at another time". */
export function moveDays(week: GroupPageWeek, todayKey: string, metAtAnotherTime: boolean): string[] {
  return week.slotDays.filter((dateKey) => (metAtAnotherTime ? dateKey <= todayKey : dateKey >= todayKey));
}

/** The weeks a new regular time may start from: never a week whose register was taken, nor any before one. */
export function regularStartWeeks(weeks: readonly GroupPageWeek[]): number[] {
  let lastTaken = 0;
  for (const week of weeks) if (week.taken) lastTaken = Math.max(lastTaken, week.weekNumber);
  return weeks.filter((week) => week.weekNumber > lastTaken && week.dateKey).map((week) => week.weekNumber);
}

/** The week a new regular time starts from unless chosen: the first still to start, else the first allowed. */
export function defaultRegularStart(weeks: readonly GroupPageWeek[]): number | null {
  const allowed = new Set(regularStartWeeks(weeks));
  const next = weeks.find((week) => allowed.has(week.weekNumber) && !week.started);
  return next?.weekNumber ?? [...allowed][0] ?? null;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * A history row's one sentence, as two lines: what changed, then before, the
 * reason and who was emailed. "Moved week 2 to Thu 12 Nov, 3pm. Before: Wed
 * 11 Nov, 3pm. Reason: closed. Emailed 7." → the headline and "Before: ...
 * Emailed 7."
 */
export function historyLines(detail: string): { headline: string; rest: string } {
  const said = detail.trim();
  const at = said.search(/ (?=Before: |Reason: |Emailed \d|Nobody was emailed\.)/);
  if (at < 0) return { headline: said, rest: "" };
  return { headline: said.slice(0, at).trim(), rest: said.slice(at + 1).trim() };
}

/** The rows a filter shows. Everything is every row. */
export function filterHistory<T extends { category: string }>(rows: readonly T[], filter: HistoryFilter): T[] {
  return filter === "everything" ? [...rows] : rows.filter((row) => row.category === filter);
}

/** "Tue 10 Nov, 12:20pm", when a row was written; "" with no time. */
export function historyWhenWords(at: string | null): string {
  if (!at) return "";
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return `${londonDayLabel(when)}, ${londonClockLabel(when)}`;
}

// ---------------------------------------------------------------------------
// The buttons that email
// ---------------------------------------------------------------------------

export type OneWeekKind = "move" | "online" | "cancel" | "push" | "restore";

/** ", and email 7 people" or " (emails nobody)", the tail every button that emails ends with. */
function emailsTail(emails: number): string {
  return emails > 0 ? ` and email ${peopleWords(emails)}` : " (emails nobody)";
}

/**
 * The one button of a one-week change, naming what happens and how many it
 * emails: "Move week 2 and email 7 people", "Hold week 4 online and email 6
 * people", "Save the correction (emails nobody)".
 */
export function oneWeekButtonWords(kind: OneWeekKind, weekNumber: number, emails: number, metAtAnotherTime: boolean): string {
  if (metAtAnotherTime) return emails > 0 ? `Save the correction and email ${peopleWords(emails)}` : "Save the correction (emails nobody)";
  const tail = emailsTail(emails);
  switch (kind) {
    case "move":
      return `Move week ${weekNumber}${tail}`;
    case "online":
      return `Hold week ${weekNumber} online${tail}`;
    case "cancel":
      return `Cancel week ${weekNumber}${tail}`;
    case "push":
      return emails > 0
        ? `Cancel week ${weekNumber}, push the rest back and email ${peopleWords(emails)}`
        : `Cancel week ${weekNumber} and push the rest back (emails nobody)`;
    case "restore":
      return `Put week ${weekNumber} back${tail}`;
  }
}

/**
 * The same button before "What will happen" has answered, when nobody yet
 * knows how many it emails: what happens, and no count. "Move week 2",
 * "Save the correction", "Change Group A’s time".
 */
export function waitingButtonWords(input: { kind: OneWeekKind | null; weekNumber: number | null; metAtAnotherTime: boolean; regular: boolean; groupName: string }): string {
  if (input.regular) return `Change ${input.groupName}’s time`;
  if (!input.kind || input.weekNumber === null) return "Change";
  if (input.metAtAnotherTime) return "Save the correction";
  const n = input.weekNumber;
  switch (input.kind) {
    case "move":
      return `Move week ${n}`;
    case "online":
      return `Hold week ${n} online`;
    case "cancel":
      return `Cancel week ${n}`;
    case "push":
      return `Cancel week ${n} and push the rest back`;
    case "restore":
      return `Put week ${n} back`;
  }
}

/** "Change Group A’s time and email 6 people". */
export function regularButtonWords(groupName: string, emails: number): string {
  return `Change ${groupName}’s time${emailsTail(emails)}`;
}

/** "Save the room and email 6 people". */
export function roomButtonWords(emails: number): string {
  return `Save the room${emailsTail(emails)}`;
}

// ---------------------------------------------------------------------------
// What the previews answer, as the wire carries it
// ---------------------------------------------------------------------------

/** One session, as a preview names it (`SessionMoment`). */
export type PreviewMoment = {
  weekNumber: number;
  dateKey: string;
  startTimeLocal: string;
  durationMinutes: number;
  room: string;
  campus: GroupCampus | null;
  online: boolean;
  cancelled: boolean;
};

export type PreviewSend = { before: string | null; after: string | null; gone: boolean };

export type PreviewReminders = {
  weekOpen: PreviewSend & { scheduled: boolean };
  reminders: {
    on: boolean;
    threeDay: { before: string | null; after: string | null; gone: number };
    oneDay: { before: string | null; after: string | null; gone: number };
    people: number;
  };
};

export type PreviewTold = { emails: number; refused: boolean; people: number; facilitatorNames: string[] };

export type OneWeekPreview = {
  kind: OneWeekKind;
  weekNumber: number;
  started: boolean;
  before: PreviewMoment | null;
  after: PreviewMoment | null;
  lastSession: { before: string; after: string };
  /** From when the week's work counts as late (the session its people are due at), before and after; null with none. */
  lateFrom: { before: string | null; after: string | null };
  reminders: PreviewReminders;
  said: { joiningOnline: { count: number; names: string[] }; cantMakeIt: { count: number; names: string[] } };
  told: PreviewTold;
  register: { exists: boolean; taken: boolean };
  /** A session called off after it started: what else follows (attendance, its lines, its check-in and report, the chase); null otherwise. */
  didNotHappen?: DidNotHappenPreview | null;
  notice: { title: string; message: string };
  at: string | null;
};

export type RegularPreview = {
  fromWeek: number;
  dayOrTimeChanged: boolean;
  askedAgain: boolean;
  regular: {
    before: { weekday: number; startTimeLocal: string; durationMinutes: number; room: string; campus: GroupCampus | null };
    after: { weekday: number; startTimeLocal: string; durationMinutes: number; room: string; campus: GroupCampus | null };
  };
  moves: { weekNumber: number; before: PreviewMoment | null; after: PreviewMoment | null; lateFrom: { before: string | null; after: string | null } }[];
  kept: { weekNumber: number; pinned: boolean; session: PreviewMoment | null }[];
  ownTimes: { weekNumber: number; kind: "online" | "moved" | "cancelled" | "pushed" | "set"; session: PreviewMoment | null; campus: GroupCampus | null }[];
  reminders: ({ weekNumber: number } & PreviewReminders)[];
  told: PreviewTold;
  notice: { subject: string; before: string[]; after: string[]; asks: boolean };
  at: string | null;
};

/** One line of "What will happen": its label and its sentence. */
export type PreviewLine = { label: string; text: string };

// ---------------------------------------------------------------------------
// The lines of "What will happen"
// ---------------------------------------------------------------------------

/** "Wed 11 Nov, 3pm, Portland A21": a session as a sentence names where it was. */
function momentShort(moment: PreviewMoment): string {
  const where = moment.online ? "online" : moment.room.trim();
  return [dayWords(moment.dateKey), clockWords(moment.startTimeLocal), where].filter(Boolean).join(", ");
}

/** "Thu 12 Nov, 3pm to 5pm, Monica Partridge E02 (University Park)": a session as a sentence names where it goes. */
function momentLong(moment: PreviewMoment): string {
  const campus = moment.campus ? CAMPUS_LABEL[moment.campus] : "";
  const room = moment.room.trim();
  const where = moment.online
    ? "online"
    : room
      ? campus && moment.campus !== "online"
        ? `${room} (${campus})`
        : room
      : ROOM_TO_BE_CONFIRMED;
  return [dayWords(moment.dateKey), hoursWords(moment.startTimeLocal, moment.durationMinutes), where].filter(Boolean).join(", ");
}

/** "Wed 25 Nov, 3pm", an instant as the page says it; "" for none. */
export function instantWords(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/**
 * From when the week's work counts as late, before and after the change (the
 * session its people are due at): "Week 2’s work counts as late from Thu 12
 * Nov, 3pm (was Wed 11 Nov, 3pm)." / "Unchanged: Wed 25 Nov, 3pm." Nothing
 * locks: work added after it is shown as late, with how late.
 */
export function lateFromLine(weekNumber: number, lateFrom: { before: string | null; after: string | null }): string {
  const before = instantWords(lateFrom.before);
  const after = instantWords(lateFrom.after);
  if (!after) return before ? `Week ${weekNumber} would have no session, so nothing added to its work would count as late (it counted from ${before}).` : "";
  if (before === after) return `Unchanged: ${after}.`;
  return before ? `Week ${weekNumber}’s work counts as late from ${after} (was ${before}).` : `Week ${weekNumber}’s work counts as late from ${after}.`;
}

/** The panel's label for that line. */
export const LATE_FROM = "Late from";

/** Both automatic emails before a session are off: one plain line, and nothing else. */
export const REMINDERS_OFF = "The automatic emails before a session are switched off, so none goes out on its own.";

/** What the week's automatic emails do, from what the preview read of them. */
export function remindersLine(weekNumber: number, reminders: PreviewReminders): string {
  const open = reminders.weekOpen;
  const each = reminders.reminders;
  if (!open.scheduled && !each.on) return REMINDERS_OFF;
  const parts: string[] = [];
  if (open.scheduled) {
    if (open.gone) parts.push(`“Week ${weekNumber} is open” already went, and isn’t sent again.`);
    else if (open.before !== open.after && open.after) {
      parts.push(`“Week ${weekNumber} is open” moves to ${instantWords(open.after)}.`);
    } else if (open.after) parts.push(`“Week ${weekNumber} is open” goes on ${instantWords(open.after)}, as before.`);
  } else {
    parts.push(`“Week ${weekNumber} is open” is switched off.`);
  }
  if (each.on) {
    const say = (name: string, send: { before: string | null; after: string | null; gone: number }) => {
      if (send.gone > 0) return `The ${name} reminder already went to ${peopleWords(send.gone)}.`;
      if (!send.after) return "";
      return send.before !== send.after
        ? `The ${name} reminder moves to ${instantWords(send.after)}.`
        : `The ${name} reminder goes on ${instantWords(send.after)}, as before.`;
    };
    parts.push(say("3-day", each.threeDay), say("1-day", each.oneDay));
  } else {
    parts.push("The reminders before a session are switched off.");
  }
  return parts.filter(Boolean).join(" ");
}

/** "Sofia is still joining online and Grace still can’t make it. The email lets each of them change their answer." */
export function saidLine(said: OneWeekPreview["said"], kind: OneWeekKind): string {
  const online = said.joiningOnline.names;
  const cant = said.cantMakeIt.names;
  const onlineCount = Math.max(said.joiningOnline.count, online.length);
  const cantCount = Math.max(said.cantMakeIt.count, cant.length);
  if (onlineCount === 0 && cantCount === 0) return "Nobody has said they’re joining online or can’t make it.";
  if (kind === "cancel") return "There’s no session, so nobody needs to answer for it.";
  const who = (names: string[], count: number) => (names.length > 0 ? namesWords(names) : peopleWords(count));
  const pieces = [
    onlineCount > 0 ? `${who(online, onlineCount)} ${onlineCount === 1 ? "is" : "are"} still joining online` : "",
    cantCount > 0 ? `${who(cant, cantCount)} still can’t make it` : "",
  ].filter(Boolean);
  return `${pieces.join(" and ")}. What each said stays with the session.`;
}

/** "Group C’s 6 and Rahul", who the notice reaches, in words. */
export function toldWho(told: PreviewTold, groupName: string, incubator: boolean): string {
  const owner = incubator ? "the incubator’s" : `${groupName}’s`;
  const parts = [...(told.people > 0 ? [`${owner} ${told.people}`] : []), ...told.facilitatorNames];
  return namesWords(parts);
}

/** Who is told: "7 people by email: Group C’s 6 and Rahul. ..." or nobody, and why. */
export function toldLine(input: {
  told: PreviewTold;
  tell: boolean;
  groupName: string;
  incubator: boolean;
  /** A session put right after it met: nobody is told unless ticked. */
  correction: boolean;
}): string {
  const { told, tell, groupName, incubator, correction } = input;
  if (told.refused) return "Too many people to email in one send, so nobody is emailed. Tell them with an update from Messages.";
  if (!tell) {
    return correction
      ? `Nobody: the session has happened. The change shows in ${groupName}’s history.`
      : `Nobody is emailed. The change shows in ${groupName}’s history.`;
  }
  if (told.emails === 0) return `Nobody can be emailed yet. The change shows on the programme page and in ${groupName}’s history.`;
  const who = toldWho(told, groupName, incubator);
  return `${peopleWords(told.emails)} by email${who ? `: ${who}` : ""}. Programme pages and Home show the new time straight away.`;
}

/** The session line of a one-week change. */
export function oneWeekSessionLine(preview: OneWeekPreview, metAtAnotherTime: boolean): string {
  const n = preview.weekNumber;
  const before = preview.before;
  const after = preview.after;
  switch (preview.kind) {
    case "move":
      if (!before || !after) return "";
      return metAtAnotherTime
        ? `Week ${n} is recorded as ${momentLong(after)}, not ${dayWords(before.dateKey)}, ${clockWords(before.startTimeLocal)}.`
        : `Week ${n} moves from ${momentShort(before)} to ${momentLong(after)}. Other weeks stay as they are.`;
    case "online": {
      if (!after) return "";
      const room = before?.room.trim() ?? "";
      return `Week ${n} is online: ${dayWords(after.dateKey)}, ${hoursWords(after.startTimeLocal, after.durationMinutes)}.${room ? ` ${room} isn’t needed that week.` : ""}`;
    }
    case "cancel":
      return before
        ? `There’s no session for week ${n} on ${dayWords(before.dateKey)}. The other weeks stay as they are.`
        : `There’s no session for week ${n}. The other weeks stay as they are.`;
    case "push": {
      const last = preview.lastSession.after;
      const meets = after ? `Week ${n} meets on ${dayWords(after.dateKey)} and later weeks follow` : `Week ${n} and later weeks move back a week`;
      return last ? `${meets}; the last session becomes ${dayWords(last)}.` : `${meets}.`;
    }
    case "restore":
      return after ? `Week ${n} goes back to ${momentLong(after)}, like the group’s other weeks.` : "";
  }
}

/** Every line of "What will happen" for one week's change. */
export function oneWeekPreviewLines(input: {
  preview: OneWeekPreview;
  metAtAnotherTime: boolean;
  tell: boolean;
  groupName: string;
  incubator: boolean;
}): PreviewLine[] {
  const { preview, metAtAnotherTime, tell, groupName, incubator } = input;
  const lines: PreviewLine[] = [];
  const session = oneWeekSessionLine(preview, metAtAnotherTime);
  if (session) lines.push({ label: "Session", text: session });
  const late = lateFromLine(preview.weekNumber, preview.lateFrom);
  if (late) lines.push({ label: LATE_FROM, text: late });
  if (metAtAnotherTime && preview.after) {
    lines.push({
      label: "Register",
      text: `Its register is for ${dayWords(preview.after.dateKey)}, ${clockWords(preview.after.startTimeLocal)}, and can be taken now.`,
    });
  }
  lines.push({ label: "Reminders", text: remindersLine(preview.weekNumber, preview.reminders) });
  lines.push({ label: "Answers", text: saidLine(preview.said, preview.kind) });
  lines.push({ label: "Told", text: toldLine({ told: preview.told, tell, groupName, incubator, correction: metAtAnotherTime }) });
  return lines;
}

/** "weeks 2 to 6", "week 4", "weeks 2 and 3". */
function weekSpanWords(weekNumbers: readonly number[]): string {
  if (weekNumbers.length === 0) return "";
  if (weekNumbers.length === 1) return `week ${weekNumbers[0]}`;
  const sorted = [...weekNumbers].sort((a, b) => a - b);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `weeks ${sorted[0]} to ${sorted[sorted.length - 1]}`;
  return `weeks ${namesWords(sorted.map(String))}`;
}

function capital(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const OWN_TIME_WORDS: Record<RegularPreview["ownTimes"][number]["kind"], string> = {
  online: "held online",
  moved: "moved on its own",
  cancelled: "cancelled",
  pushed: "pushed back",
  set: "set on its own",
};

/** Every line of "What will happen" for a new regular time from a week onwards. */
export function regularPreviewLines(input: {
  preview: RegularPreview;
  groupName: string;
  incubator: boolean;
  todayKey: string;
}): PreviewLine[] {
  const { preview, groupName, incubator, todayKey } = input;
  const lines: PreviewLine[] = [];
  const after = preview.regular.after;
  const slot = `${weekdaysWords(after.weekday)}, ${hoursWords(after.startTimeLocal, after.durationMinutes)}`;

  const moved = preview.moves.filter((move) => move.after);
  if (moved.length > 0) {
    const dates = moved.map((move) => {
      const day = dayWords(move.after!.dateKey);
      return move.after!.dateKey === todayKey ? `today, ${day}` : day;
    });
    lines.push({
      label: "Sessions",
      text: `${capital(weekSpanWords(moved.map((move) => move.weekNumber)))} move to ${slot}: ${namesWords(dates)}.`,
    });
  } else {
    lines.push({ label: "Sessions", text: "No session moves." });
  }

  if (preview.kept.length > 0) {
    const kept = preview.kept.filter((week) => week.session);
    const text =
      kept.length === 1
        ? `Week ${kept[0].weekNumber} keeps ${dayWords(kept[0].session!.dateKey)}, ${clockWords(kept[0].session!.startTimeLocal)}. Its register and late times don’t change.`
        : `${capital(weekSpanWords(kept.map((week) => week.weekNumber)))} keep their dates (${namesWords(kept.map((week) => dayWords(week.session!.dateKey)))}). Their registers and late times don’t change.`;
    if (kept.length > 0) lines.push({ label: "Kept", text });
  }

  for (const own of preview.ownTimes) {
    const when = own.session ? `${dayWords(own.session.dateKey)}, ${clockWords(own.session.startTimeLocal)}` : "";
    lines.push({
      label: "Keeps its own",
      text: `Week ${own.weekNumber} keeps its own change (${OWN_TIME_WORDS[own.kind]})${when ? `: ${when}` : ""}.`,
    });
  }

  const lateParts = preview.moves
    .slice(0, 2)
    .map((move) => {
      const before = instantWords(move.lateFrom.before);
      const now = instantWords(move.lateFrom.after);
      if (!now || before === now) return "";
      return before ? `Week ${move.weekNumber}: ${now}, not ${before}.` : `Week ${move.weekNumber}: ${now}.`;
    })
    .filter(Boolean);
  if (preview.moves.length > 2) lateParts.push("Later weeks: at each one’s new session.");
  if (lateParts.length > 0) lines.push({ label: LATE_FROM, text: lateParts.join(" ") });

  if (preview.reminders.length > 0) {
    const off = preview.reminders.every((each) => !each.weekOpen.scheduled && !each.reminders.on);
    lines.push({
      label: "Reminders",
      text: off ? REMINDERS_OFF : preview.reminders.map((each) => remindersLine(each.weekNumber, each)).join(" "),
    });
  }

  const roomBefore = preview.regular.before.room.trim();
  const roomAfter = after.room.trim();
  if (!roomAfter) {
    lines.push({ label: "Room", text: "To be confirmed. People see “Room to be confirmed” until you set it, and setting it emails the group." });
  } else if (roomAfter !== roomBefore || after.campus !== preview.regular.before.campus) {
    const campus = after.campus ? CAMPUS_LABEL[after.campus] : "";
    lines.push({ label: "Room", text: campus ? `${roomAfter}, ${campus}.` : `${roomAfter}.` });
  }

  lines.push({
    label: "Asked again",
    text: preview.askedAgain
      ? "The email asks Can you make this time? with the same three answers. Answers given before stop counting."
      : "Nobody is asked Can you make this time? again: the day and the start stay the same.",
  });
  lines.push({ label: "Told", text: toldLine({ told: preview.told, tell: true, groupName, incubator, correction: false }) });
  return lines;
}

// ---------------------------------------------------------------------------
// What a press came to
// ---------------------------------------------------------------------------

/** What a notice's send came to, counted ("Emailed 6 people."), or that nobody was emailed. */
export function sentWords(tally: { sent: number; held: number; suppressed: number; failed: number } | null): string {
  if (!tally) return "Nobody was emailed.";
  const parts: string[] = [];
  if (tally.sent > 0) parts.push(`Emailed ${peopleWords(tally.sent)}.`);
  if (tally.held > 0) parts.push(`${peopleWords(tally.held)} held, because this copy of the site doesn’t email them.`);
  if (tally.suppressed > 0) parts.push(`${peopleWords(tally.suppressed)} not emailed: do-not-email list.`);
  if (tally.failed > 0) parts.push(`${peopleWords(tally.failed)} couldn’t be sent.`);
  return parts.length > 0 ? parts.join(" ") : "Nobody was emailed.";
}

/** The start times a panel offers: every half hour from 7am to 10pm, and the one a session has now if it is between. */
export function startTimeOptions(current: string): string[] {
  const out: string[] = [];
  for (let minute = 7 * 60; minute <= 22 * 60; minute += 30) {
    out.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(current) && !out.includes(current)) out.push(current);
  return out.sort();
}

/** The lengths a panel offers: the presets, and the one a session has now. */
export function lengthOptions(presets: readonly number[], current: number): number[] {
  const out = [...presets];
  if (Number.isInteger(current) && current > 0 && !out.includes(current)) out.push(current);
  return out.sort((a, b) => a - b);
}
