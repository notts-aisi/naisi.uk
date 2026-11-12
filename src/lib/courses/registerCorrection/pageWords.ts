import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { clockWords, dayWords, namesWords, peopleWords } from "@/lib/courses/sessionChange/words";
import { cameBy, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { linesWords, lineWords } from "./words";

/**
 * THE WORDS OF THE PAGES THAT CORRECT A REGISTER, and the small arithmetic
 * behind them: the choices a line can be corrected to, the lines a register
 * says beside a corrected line or an ask, the sheets' sentences, the column's
 * "Before you save", the Requests page's rows and a member's "Corrected on".
 *
 * No server imports: every page in the browser says the same thing, and a
 * time is put into words by the house clock (`londonLabels`). Pure, so the
 * tests run each sentence.
 *
 * WHO IS TOLD WHAT is decided by the server: the register's read leaves out a
 * reason or a reply the reader may not read, so a sentence here says a
 * reason only when it is handed one.
 */

// ---------------------------------------------------------------------------
// A line, and the lines it can be corrected to
// ---------------------------------------------------------------------------

/** One line a register can say: a mark, and online beside a mark that says they came. */
export type LineChoice = { key: string; status: AttendanceStatus; online: boolean; words: string };

/** A line's key: "present", "present-online", "absent". */
export function lineKey(status: AttendanceStatus | null, online: boolean): string {
  if (!status) return "none";
  return cameBy(status) && online ? `${status}-online` : status;
}

/** Every line a correction or a request can ask for, in the order a register is read. */
export const LINE_CHOICES: readonly LineChoice[] = (
  [
    ["present", false],
    ["present", true],
    ["late", false],
    ["late", true],
    ["left-early", false],
    ["left-early", true],
    ["absent", false],
    ["excused", false],
  ] as const
).map(([status, online]) => ({ key: lineKey(status, online), status, online, words: lineWords(status, online) }));

/** The lines a line can be corrected to: every one but what it says now. */
export function choicesOtherThan(status: AttendanceStatus | null, online: boolean): LineChoice[] {
  const now = lineKey(status, online);
  return LINE_CHOICES.filter((choice) => choice.key !== now);
}

/** A choice by its key, or null. */
export function choiceOf(key: string | null): LineChoice | null {
  return LINE_CHOICES.find((choice) => choice.key === key) ?? null;
}

/** A line as a route takes it: `{ status, online? }`, `online` only beside a mark that says they came. */
export function lineBody(choice: LineChoice): { status: AttendanceStatus; online?: boolean } {
  return cameBy(choice.status) ? { status: choice.status, online: choice.online } : { status: choice.status };
}

/** A reason as the routes hold it: one line. A line break typed or pasted becomes a space. */
export function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

/** The longest reason or reply, as the routes hold it. */
export const REASON_MAX = 300;

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

function instant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** "Tue 10 Nov, 9:40am", or "" with no instant. */
export function dayAndClock(iso: string | null | undefined): string {
  const at = instant(iso);
  return at ? `${londonDayLabel(at)}, ${londonClockLabel(at)}` : "";
}

/** "at 9:40am" on the London day `now` is, "on Tue 10 Nov at 9:40am" otherwise; "" with no instant. */
export function whenWords(iso: string | null | undefined, now: Date): string {
  const at = instant(iso);
  if (!at) return "";
  return londonDayLabel(at) === londonDayLabel(now) ? `at ${londonClockLabel(at)}` : `on ${londonDayLabel(at)} at ${londonClockLabel(at)}`;
}

/** "Tue 10 Nov", the London day of an instant or a date key; "" with neither. */
export function dayOf(dateKeyOrIso: string | null | undefined): string {
  if (!dateKeyOrIso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKeyOrIso)) return dayWords(dateKeyOrIso);
  const at = instant(dateKeyOrIso);
  return at ? londonDayLabel(at) : "";
}

/** "Rahul", the first word of a name. */
export function firstOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** A reason or a reply in quotes: “Daniel was there all session.” */
export function quoted(text: string): string {
  const said = text.replace(/\s+/g, " ").trim();
  return said ? `“${said}”` : "";
}

// ---------------------------------------------------------------------------
// One line of a finished register
// ---------------------------------------------------------------------------

/** "Daniel Kim · week 1 · Wed 4 Nov" */
export function lineHead(name: string, weekNumber: number, occurrence: number, dateKey: string): string {
  const week = occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`;
  return [name, week, dayOf(dateKey)].filter(Boolean).join(" · ");
}

export const ASK_TITLE = "Ask for a correction";
/** The Finish sheet's line about what comes after Finish. */
export const AFTER_FINISH =
  "The register locks. After that, a change goes through an admin or the programme’s lead, asked for from the line, and every change records who made it, when and why.";
export const CORRECT_TITLE = "Correct this line";
export const LINE_TITLE = "This line";
export const WHAT_IT_SHOULD_SAY = "What it should say";
export const WHY_NEEDED = "Why (needed)";
export const SEND_THE_REQUEST = "Send the request";
export const WITHDRAW = "Withdraw the correction";
export const SAVE_THE_CORRECTION = "Save the correction";
export const CANCEL = "Cancel";
export const CLOSE = "Close";
export const SAVING = "Saving…";
export const SENDING = "Sending…";
/** The chip in a corrected cell. */
export const CORRECTED = "Corrected";
/** The chip in a cell with an ask waiting. */
export const ASKED = "Asked";
/** The chip in a cell whose newest ask was declined. */
export const DECLINED = "Declined";

/** "The register says Absent." */
export function registerSaysWords(words: string): string {
  return `The register says ${words}.`;
}

/** Under the ask's button: where it goes, who is emailed, and where a corrected line shows. */
export function askGoesWords(name: string): string {
  const first = firstOf(name) || "They";
  return `It goes to the admins and the programme’s lead, who approve or decline it. Nobody is emailed, ${first} included. Once it’s corrected, ${first} sees the corrected line on their own page.`;
}

/** Under a correction's button. */
export function correctGoesWords(name: string): string {
  const first = firstOf(name) || "They";
  return `Nobody is emailed. ${first} sees the corrected line on their own page.`;
}

/** "Set by Rahul, Wed 25 Nov, 3:04pm", "Set before the session", or "" with nobody. */
export function setByChip(entry: { name: string; at: string; how?: string; yours?: boolean } | null): string {
  if (!entry) return "";
  if (entry.how === "self") return "Set before the session";
  const who = entry.yours ? "you" : firstOf(entry.name) || "somebody";
  const when = dayAndClock(entry.at);
  return when ? `Set by ${who}, ${when}` : `Set by ${who}`;
}

/** An ask as the register's read sends it, beside the line. */
export type RequestView = {
  id: string;
  state: "waiting" | "approved" | "declined";
  from: string;
  to: string;
  askedBy: { name: string };
  askedAt: string;
  yours: boolean;
  reason?: string;
  handling?: { name: string } | null;
  decidedBy: { name: string } | null;
  decidedAt: string | null;
  reply?: string;
};

/** A corrected line's story, as the register's read sends it. */
export type StoryView = {
  kind: "line" | "held-online" | "moved" | "did-happen";
  before: string | null;
  beforeSetBy: { name: string; at: string } | null;
  correctedBy: { name: string };
  correctedAt: string;
  reason?: string;
  movedFrom: string | null;
  asked: { name: string; at: string; yours: boolean } | null;
};

/**
 * The line beside a line with an ask on it.
 *  - waiting: "You asked for In the room at 9:40am. Waiting for an admin or the programme’s lead."
 *  - approved: "Corrected by Zach at 10:05am, as you asked."
 *  - declined: "Declined by Zach at 10:05am: “Daniel left at 3pm.”" (the reply only when the reader is sent it)
 */
export function requestLine(request: RequestView, now: Date): string {
  const asker = request.yours ? "You" : firstOf(request.askedBy.name) || "Somebody";
  if (request.state === "waiting") {
    const handling = request.handling ? ` ${firstOf(request.handling.name)} has it.` : "";
    return `${asker} asked for ${request.to} ${whenWords(request.askedAt, now)}. Waiting for an admin or the programme’s lead.${handling}`;
  }
  const by = firstOf(request.decidedBy?.name ?? "") || "Somebody";
  const when = whenWords(request.decidedAt, now);
  if (request.state === "approved") {
    return `Corrected by ${by}${when ? ` ${when}` : ""}, as ${request.yours ? "you" : firstOf(request.askedBy.name) || "they"} asked.`;
  }
  const reply = request.reply ? `: ${quoted(request.reply)}` : ".";
  return `${asker === "You" ? "Your" : `${asker}’s`} ask for ${request.to} was declined by ${by}${when ? ` ${when}` : ""}${reply}`;
}

/** The chip a cell carries: an ask waiting, a correction, a decline, or nothing. */
export function cellChip(input: { corrected: boolean; request: RequestView | null }): string {
  if (input.request?.state === "waiting") return ASKED;
  if (input.corrected) return CORRECTED;
  if (input.request?.state === "declined") return DECLINED;
  return "";
}

/**
 * A corrected line's story, in the order it happened:
 * "Was Absent, set by Rahul, Wed 4 Nov, 3:06pm. Rahul asked on Tue 10 Nov at
 * 9:40am. Corrected by Zach, Tue 10 Nov, 10:05am. Why: “...”"
 * The reason only when the reader is sent it.
 */
export function storyWords(story: StoryView, sessionLabelOf: (key: string) => string = (key) => key): string {
  const parts: string[] = [];
  if (story.kind === "moved") {
    parts.push(story.movedFrom ? `Moved here from ${sessionLabelOf(story.movedFrom)}.` : "Moved here from another week.");
  } else if (story.kind === "did-happen") {
    parts.push("Put back when the session was said to have happened.");
  } else if (story.before) {
    const setBy = story.beforeSetBy ? `, set by ${firstOf(story.beforeSetBy.name) || "somebody"}, ${dayAndClock(story.beforeSetBy.at)}` : "";
    parts.push(`Was ${story.before}${setBy}.`);
  }
  if (story.kind === "held-online") parts.push("The whole column was corrected: it was held online.");
  if (story.asked) {
    parts.push(`${story.asked.yours ? "You" : firstOf(story.asked.name) || "Somebody"} asked, ${dayAndClock(story.asked.at)}.`);
  }
  parts.push(`Corrected by ${firstOf(story.correctedBy.name) || "somebody"}, ${dayAndClock(story.correctedAt)}.`);
  if (story.reason) parts.push(`Why: ${quoted(story.reason)}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// A whole column
// ---------------------------------------------------------------------------

export type ColumnWay = "online" | "move" | "clear" | "did-not-happen";

export const COLUMN_WAYS: readonly { way: ColumnWay; title: string; line: string }[] = [
  {
    way: "online",
    title: "It was held online",
    line: "Everyone set as In the room was online.",
  },
  {
    way: "move",
    title: "These lines belong to another session",
    line: "Move them to another week whose register nobody has taken.",
  },
  {
    way: "clear",
    title: "It was taken for the wrong session: clear the column",
    line: "The week goes back to not taken, and the lines are kept in the group’s history.",
  },
  {
    way: "did-not-happen",
    title: "It didn’t happen",
    line: "Choose keep pace or push the rest back, as on the group’s page.",
  },
];

/** "Correct week 1’s whole column", the column menu's own button. */
export function correctColumnWords(weekNumber: number): string {
  return `Correct week ${weekNumber}’s whole column`;
}

/** "Week 1 did happen", the column menu's button for a column that says it didn't. */
export function didHappenWords(weekNumber: number): string {
  return `Week ${weekNumber} did happen`;
}

export const WHAT_WAS_WRONG = "What was wrong";
export const BEFORE_YOU_SAVE = "Before you save";
export const WHO_WAS_THERE = "Who was there";
export const SAVE_IT_HAPPENED = "Save: it happened";
export const WHICH_WEEK = "The week they belong to";
export const KEEP_PACE = "Keep pace";
export const PUSH_THE_REST_BACK = "Push the rest back a week";
export const PREVIEW_WAITING = "Choose what was wrong to see what changes.";

/** "Group I · Wed 4 Nov · finished by Lucy, Wed 4 Nov, 7:58pm" */
export function columnHead(groupName: string, dateKey: string, finished: { name: string; at: string } | null): string {
  const done = finished ? `finished by ${firstOf(finished.name) || "somebody"}, ${dayAndClock(finished.at)}` : "";
  return [groupName.trim(), dayOf(dateKey), done].filter(Boolean).join(" · ");
}

type NamedLine = { uid: string; name: string; line: string };

/** "Kai stays Absent", "Kai and Ola stay as they are". */
function stayWords(staying: readonly NamedLine[]): string {
  if (staying.length === 0) return "";
  if (staying.length === 1) return `${firstOf(staying[0].name)} stays ${staying[0].line}.`;
  const lines = new Set(staying.map((each) => each.line));
  const names = namesWords(staying.map((each) => firstOf(each.name)));
  return lines.size === 1 ? `${names} stay ${staying[0].line}.` : `${names} stay as they are.`;
}

/** The chase, as a preview says it comes back. */
function chaseWords(chase: { email: string; card: string } | undefined): string {
  if (!chase) return "";
  if (chase.email === "returns") return "The reminders about its register start again.";
  if (chase.card === "returns") return "The reminder email’s time has passed, so only the card for the lead and admins comes back.";
  return "Nothing chases it again: the reminders’ times have passed.";
}

export type BeforeYouSave = { label: string; text: string }[];

/** "Before you save" for the column's online, move and clear, from the route's own preview. */
export function columnPreviewLines(preview: Record<string, unknown>, groupName: string): BeforeYouSave {
  const kind = preview.kind;
  const staying = (preview.staying as NamedLine[] | undefined) ?? [];
  const lines: BeforeYouSave = [];
  const figures = { label: "Figures", text: `Each person’s page, ${groupName.trim() || "the group"}, Overview and Surveys update.` };
  const told = { label: "Told", text: "Nobody is emailed. Its facilitators see it on the register; the people see it on their own pages." };
  if (kind === "online") {
    const changes = Number(preview.changes ?? 0);
    lines.push({
      label: "Changes",
      text:
        changes === 0
          ? `Nobody is down as In the room, so nothing changes.${staying.length ? ` ${stayWords(staying)}` : ""}`
          : `${linesWords(changes)}: In the room to Online.${staying.length ? ` ${stayWords(staying)}` : ""}`,
    });
  } else if (kind === "move") {
    const to = preview.to as { weekNumber: number; dateKey: string } | null;
    const moves = Number(preview.moves ?? 0);
    lines.push({
      label: "Changes",
      text: to
        ? `${linesWords(moves)} move to week ${to.weekNumber}${to.dateKey ? `, ${dayOf(to.dateKey)}` : ""}, with who set each. Week ${preview.weekNumber} goes back to not taken.`
        : `Choose the week whose session these ${linesWords(moves)} belong to.`,
    });
    lines.push(staysWords(preview));
    const chase = chaseWords(preview.chase as { email: string; card: string } | undefined);
    if (chase && to) lines.push({ label: "Reminders", text: chase });
  } else if (kind === "clear") {
    const clears = Number(preview.clears ?? 0);
    lines.push({
      label: "Changes",
      text: `${linesWords(clears)} cleared. Week ${preview.weekNumber} goes back to not taken, and the group’s history keeps what each said.`,
    });
    lines.push(staysWords(preview));
    const chase = chaseWords(preview.chase as { email: string; card: string } | undefined);
    if (chase) lines.push({ label: "Reminders", text: chase });
  }
  lines.push(figures, told);
  return lines;
}

/** What stays with the session a move or a clear leaves: its check-in, its reports, any notes. */
function staysWords(preview: Record<string, unknown>): { label: string; text: string } {
  const stays = (preview.stays as { checkIn: boolean; reports: number } | undefined) ?? { checkIn: false, reports: 0 };
  const kept = [stays.checkIn ? "its check-in" : "", stays.reports > 0 ? (stays.reports === 1 ? "its session report" : `its ${stays.reports} session reports`) : ""].filter(Boolean);
  const said = "What people said in advance, and any notes on the register, stay with this week.";
  return {
    label: "Stays",
    text: kept.length ? `${said} So do ${namesWords(kept)}: they don’t move.` : said,
  };
}

/** A session as a did-not-happen preview draws it (`SessionMoment`). */
type Moment = { weekNumber: number; dateKey: string; startTimeLocal: string } | null;

/** "Before you save" for It didn't happen, from the route's own preview. */
export function didNotHappenPreviewLines(preview: Record<string, unknown>): BeforeYouSave {
  const weekNumber = Number(preview.weekNumber ?? 0);
  const lines: BeforeYouSave = [];
  const facts = preview.didNotHappen as
    | { leavesAttendance: boolean; chaseStops: boolean; checkIn: boolean; reports: number }
    | undefined;
  const clearing = (preview.clearing as NamedLine[] | undefined) ?? [];
  lines.push({ label: "Attendance", text: `Week ${weekNumber} leaves everyone’s attendance. Nobody is counted absent.` });
  lines.push({
    label: "Register",
    text:
      clearing.length === 0
        ? "Nothing was set on its register, so nothing is cleared."
        : `${linesWords(clearing.length)} cleared: ${namesWords(clearing.map((each) => `${firstOf(each.name)} (${each.line.toLowerCase()})`))}. The group’s history keeps what each said.`,
  });
  if (preview.pace === "push") {
    const after = preview.after as Moment;
    lines.push({
      label: "Dates",
      text: after
        ? `Week ${weekNumber} meets on ${dayWords(after.dateKey)}${clockWords(after.startTimeLocal) ? ` at ${clockWords(after.startTimeLocal)}` : ""} instead, and every week after it a week later.`
        : `Week ${weekNumber} and every week after it meet a week later.`,
    });
  } else {
    lines.push({ label: "Dates", text: "The weeks after it keep their dates." });
  }
  if (facts) {
    const made = [facts.checkIn ? "its check-in" : "", facts.reports > 0 ? (facts.reports === 1 ? "its session report" : `its ${facts.reports} session reports`) : ""].filter(Boolean);
    if (made.length) lines.push({ label: "Check-in, report", text: `${namesWords(made)} ${made.length === 1 && facts.reports <= 1 ? "is" : "are"} kept.` });
  }
  return lines;
}

/** "Email Group A (6 people)": the optional notice, with its count. */
export function emailGroupWords(groupName: string, emails: number): string {
  return `Email ${groupName.trim() || "the group"} (${peopleWords(emails)})`;
}

/** The column's button, naming what it does. */
export function columnButtonWords(input: {
  way: ColumnWay | "did-happen";
  weekNumber: number;
  lines: number;
  toWeek: number | null;
  tell: boolean;
  emails: number;
}): string {
  switch (input.way) {
    case "online":
      return `Correct ${linesWords(input.lines)}`;
    case "move":
      return input.toWeek ? `Move ${linesWords(input.lines)} to week ${input.toWeek}` : `Move ${linesWords(input.lines)}`;
    case "clear":
      return `Clear ${linesWords(input.lines)}`;
    case "did-not-happen":
      return input.tell ? `Save: it didn’t happen, and email ${peopleWords(input.emails)}` : "Save: it didn’t happen";
    case "did-happen":
      return SAVE_IT_HAPPENED;
  }
}

/** The line a column correction leaves once it went through. */
export function columnDoneWords(way: ColumnWay | "did-happen", weekNumber: number, count: number, toWeek: number | null): string {
  switch (way) {
    case "online":
      return `Week ${weekNumber}: ${linesWords(count)} corrected to Online. Nobody was emailed.`;
    case "move":
      return `Week ${weekNumber}’s ${linesWords(count)} moved to week ${toWeek ?? "?"}. Nobody was emailed.`;
    case "clear":
      return `Week ${weekNumber}: ${linesWords(count)} cleared. It’s back to not taken.`;
    case "did-not-happen":
      return `Week ${weekNumber} is down as not having happened.`;
    case "did-happen":
      return `Week ${weekNumber} is back in everyone’s attendance. Nobody was emailed.`;
  }
}

/** For It did happen: who called it off, when and why, as the preview says it. */
export function calledOffWords(calledOff: { byName: string; at: string; reason: string } | null, weekNumber: number): string {
  if (!calledOff) return `Week ${weekNumber}’s register says it didn’t happen.`;
  const why = calledOff.reason ? `, because ${quoted(calledOff.reason)}` : "";
  return `${firstOf(calledOff.byName) || "Somebody"} said week ${weekNumber} didn’t happen, ${dayAndClock(calledOff.at)}${why}.`;
}

/** "Before you save" for It did happen. */
export function didHappenPreviewLines(preview: Record<string, unknown>, counts: { room: number; online: number; absent: number; excused: number }): BeforeYouSave {
  const weekNumber = Number(preview.weekNumber ?? 0);
  const parts = [
    counts.room ? `${counts.room} in the room` : "",
    counts.online ? `${counts.online} online` : "",
    counts.absent ? `${counts.absent} absent` : "",
    counts.excused ? `${counts.excused} excused` : "",
  ].filter(Boolean);
  return [
    { label: "Attendance", text: `Week ${weekNumber} comes back into everyone’s attendance${parts.length ? `: ${namesWords(parts)}` : ""}.` },
    { label: "Told", text: "Nobody is emailed. Its facilitators see it on the register." },
  ];
}

/** The three ways somebody can be put down for It did happen. */
export const DID_HAPPEN_CHOICES: readonly LineChoice[] = LINE_CHOICES.filter(
  (choice) => choice.key === "present" || choice.key === "present-online" || choice.key === "absent",
);

// ---------------------------------------------------------------------------
// The Requests page and one request's page
// ---------------------------------------------------------------------------

export const REQUESTS_TITLE = "Requests";
export const REGISTER_CORRECTION = "Register correction";
export const NOBODY_HAS_IT = "Nobody has it yet";
export const TAKE_IT = "Take it";
export const APPROVE_AND_CORRECT = "Approve and correct";
export const DECLINE = "Decline";
export const WHAT_WILL_HAPPEN = "What will happen";
export const OPEN = "Open";
export const ALL_PROGRAMMES = "All programmes";

/** "6 waiting" */
export function waitingChip(count: number): string {
  return `${count} waiting`;
}

/** The line under the Requests page's title, by who is reading. */
export function requestsLede(viewer: "admin" | "lead"): string {
  return viewer === "admin" ? "Every programme’s register corrections." : "Register corrections for the programmes you lead.";
}

/** "Group F, week 1: Kwame Asante, Arrived late to In the room" */
export function requestAbout(row: { group: { name: string }; weekNumber: number; occurrence: number; subject: { name: string }; from: string; to: string }): string {
  const week = row.occurrence > 1 ? `week ${row.weekNumber}, session ${row.occurrence}` : `week ${row.weekNumber}`;
  return `${row.group.name}, ${week}: ${row.subject.name}, ${row.from} to ${row.to}`;
}

/** Who has a request: "Nobody has it yet", "You have it", "Zach has it". */
export function handlingWords(handling: { name: string } | null, mine: boolean): string {
  if (!handling) return NOBODY_HAS_IT;
  return mine ? "You have it" : `${firstOf(handling.name) || "Somebody"} has it`;
}

/** A row's state chip. */
export function stateChip(state: "waiting" | "handling" | "approved" | "declined" | "withdrawn"): string {
  switch (state) {
    case "waiting":
      return "Waiting";
    case "handling":
      return "Being handled";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "withdrawn":
      return "Withdrawn";
  }
}

/** "Nothing waiting" / "No requests waiting" etc. for the empty state. */
export const NOTHING_WAITING = "Nothing waiting";
export const NOTHING_WAITING_LINE = "When a facilitator asks for a line of a finished register to be corrected, it lands here.";
export const NOTHING_IN_THIS_VIEW = "Nothing here.";
export const NO_REQUESTS_HERE = "There are no requests for you here";
export const NO_REQUESTS_HERE_LINE = "Requests are for admins and the people leading a programme.";
export const REQUEST_NOT_HERE = "That request isn’t here";
export const REQUEST_NOT_HERE_LINE = "It may have been for a programme you don’t lead. The Requests page lists every one you can open.";
export const BACK_TO_REQUESTS = "Back to the requests";

/** "Asked by Rahul Mehta, Tue 10 Nov, 9:40am" */
export function askedByWords(name: string, at: string | null): string {
  const when = dayAndClock(at);
  return when ? `Asked by ${name}, ${when}` : `Asked by ${name}`;
}

/** "Finished by Rahul, Wed 4 Nov, 5:02pm." */
export function finishedByWords(finished: { by: { name: string }; at: string } | null): string {
  if (!finished) return "The register isn’t finished.";
  return `Finished by ${firstOf(finished.by.name) || "somebody"}, ${dayAndClock(finished.at)}.`;
}

/** What approving will do, line by line. */
export function approvingLines(input: { subject: string; asker: string; groupName: string; mine: boolean }): BeforeYouSave {
  const first = firstOf(input.subject) || "Their";
  return [
    { label: "Approving", text: "Changes the line on the spot and records who, when, from, to and why." },
    { label: "Figures", text: `${first}’s attendance, ${input.groupName.trim() || "the group"}’s and the programme’s update everywhere.` },
    { label: "Told", text: `${input.mine ? "You" : firstOf(input.asker) || "The asker"}, on the register. Nobody is emailed.` },
  ];
}

/** "Reply to Rahul (needed to decline)" */
export function replyLabel(asker: string): string {
  return `Reply to ${firstOf(asker) || "them"} (needed to decline)`;
}

/** A request's history, one line per event. */
export function historyWords(entry: { what: string; by: { name: string }; at: string }): string {
  const who = entry.by.name || "Somebody";
  const verb =
    entry.what === "asked"
      ? "asked for this"
      : entry.what === "taken"
        ? "took it"
        : entry.what === "withdrawn"
          ? "withdrew it"
          : entry.what === "approved"
            ? "approved it, and the line was corrected"
            : entry.what === "declined"
              ? "declined it"
              : entry.what;
  return `${who} ${verb}`;
}

/** The line once a request is decided. */
export function decidedWords(status: string, decidedBy: { name: string } | null, decidedAt: string | null): string {
  const who = decidedBy?.name || "Somebody";
  const when = dayAndClock(decidedAt);
  if (status === "approved") return `Approved by ${who}${when ? `, ${when}` : ""}. The line was corrected.`;
  if (status === "declined") return `Declined by ${who}${when ? `, ${when}` : ""}.`;
  if (status === "withdrawn") return "The person who asked withdrew it.";
  return "";
}

/** A request the reader asked: they don't decide it. */
export const YOURS_TO_WAIT = "You asked for this, so somebody else decides it.";

/** Home: "1 request waiting" */
export function requestsWaitingTitle(count: number): string {
  return count === 1 ? "Request waiting" : "Requests waiting";
}

export function requestsWaitingLine(count: number): string {
  return count === 1 ? "A facilitator has asked for a line of a register to be corrected." : `Facilitators have asked for ${count} lines of registers to be corrected.`;
}

/** The programme's head: "2 requests waiting" */
export function programmeRequestsWords(count: number): string {
  return count === 1 ? "1 request waiting" : `${count} requests waiting`;
}

// ---------------------------------------------------------------------------
// The group's attendance across every week
// ---------------------------------------------------------------------------

export const ATTENDANCE_TAB = "Attendance, all weeks";
export const CORRECT_ANY_LINE =
  "Leads and admins can correct any line of a finished week: click it. Every correction asks why, and the group’s history keeps who, when, from and to.";
export const FACILITATORS_ROW = "Facilitators";
export const FACILITATORS_ROW_NOTE = "Admins and the programme’s lead only. Facilitators don’t see this, and nor does anyone in the group.";
export const IN_THE_ROOM_COUNT = "In the room";
export const ONLINE_COUNT = "Online";

/** A cell of the attendance grid in words. */
export function cellWords(cell: { state: string; mark: AttendanceStatus | null; online: boolean; saved: boolean }): string {
  switch (cell.state) {
    case "mark":
      return cell.mark ? lineWords(cell.mark, cell.online) : "Not taken yet";
    case "not-held":
      return "Didn’t happen";
    case "before":
      return "Not in the group yet";
    case "after":
      return "Left the group";
    case "today":
      return "Today";
    case "none":
      return "No session";
    default:
      return "Not taken yet";
  }
}

/** The legend over the attendance grid. */
export const ATTENDANCE_LEGEND: readonly string[] = [
  "In the room",
  "Online",
  "Arrived late or left early",
  "Absent",
  "Excused",
  "Didn’t happen",
  "Not taken yet",
];

/** A facilitator's presence cell: "There", "Arrived 4:40pm", "Not there", or "" with nothing recorded. */
export function presenceCellWords(entry: { state: string | null; arrivedAt: string | null } | null): string {
  if (!entry?.state) return "";
  if (entry.state === "there") return "There";
  if (entry.state === "late") {
    const at = instant(entry.arrivedAt);
    return at ? `Arrived ${londonClockLabel(at)}` : "Arrived late";
  }
  return "Not there";
}

/** A column head: "Week 1 · Wed 4 Nov" */
export function columnLabel(weekNumber: number, dateKey: string): string {
  return [`Week ${weekNumber}`, dayOf(dateKey)].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// A member's own sessions
// ---------------------------------------------------------------------------

/** "Corrected on Tue 10 Nov" */
export function correctedOnWords(dateKey: string): string {
  const day = dayOf(dateKey);
  return day ? `Corrected on ${day}` : CORRECTED;
}

/** "Week 1, Wed 4 Nov: corrected on Tue 10 Nov." */
export function correctedSessionWords(weekNumber: number, dateKey: string, correctedOn: string): string {
  const day = dayOf(dateKey);
  const on = dayOf(correctedOn);
  return `Week ${weekNumber}${day ? `, ${day}` : ""}: ${on ? `corrected on ${on}` : "corrected"}.`;
}
