import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { clockWords, dayWords, namesWords, peopleWords } from "@/lib/courses/sessionChange/words";
import { cameBy, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { didNotHappenLines } from "@/lib/courses/registerCover/pageWords";
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

/**
 * THE LINES A CORRECTION OFFERS ONE READER ON ONE LINE, so a sheet offers
 * nothing the route would refuse them: an admin or the programme's lead
 * (`marksExcused`) every one; anybody else no Absent where an excusal stands
 * on the line, and no Excused but where one stands and the sheet puts lines
 * back (`restores`: "It did happen" does, a line's correction never). An
 * ask for a correction is decided by an admin or the lead, and is offered
 * every line.
 */
export function choicesFor(
  choices: readonly LineChoice[],
  reader: { marksExcused: boolean; excusalStands: boolean; restores: boolean },
): LineChoice[] {
  if (reader.marksExcused) return [...choices];
  return choices.filter((choice) =>
    choice.status === "excused" ? reader.restores && reader.excusalStands : choice.status !== "absent" || !reader.excusalStands,
  );
}

/** The line "It did happen" gives somebody nobody chose one for: Excused where an excusal stands, Absent anywhere else. */
export function didHappenFill(excusalStands: boolean): "excused" | "absent" {
  return excusalStands ? "excused" : "absent";
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
  // An approved request to be excused: its approver and time are an admin's alone.
  if (entry.how === "approval") {
    if (!entry.name) return "Set by an approved request";
    const at = dayAndClock(entry.at);
    return at ? `Set by ${firstOf(entry.name)}’s approval, ${at}` : `Set by ${firstOf(entry.name)}’s approval`;
  }
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
  /** `byApproval`: set by an approved request to be excused, named and dated for an admin alone. */
  beforeSetBy: { name: string; at: string; byApproval?: boolean } | null;
  correctedBy: { name: string };
  correctedAt: string;
  /** Corrected by an approved request to be excused: who and when are an admin's alone. */
  byApproval?: boolean;
  reason?: string;
  movedFrom: string | null;
  asked: { name: string; at: string; yours: boolean } | null;
};

/**
 * The line beside a line with an ask on it.
 *  - waiting: "You asked for In the room at 9:40am. Waiting for an admin or the programme’s lead."
 *  - approved: "Corrected by Sam at 10:05am, as you asked."
 *  - declined: "Declined by Sam at 10:05am: “Daniel left at 3pm.”" (the reply only when the reader is sent it)
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
 * 9:40am. Corrected by Sam, Tue 10 Nov, 10:05am. Why: “...”"
 * The reason only when the reader is sent it.
 */
export function storyWords(story: StoryView, sessionLabelOf: (key: string) => string = (key) => key): string {
  const parts: string[] = [];
  if (story.kind === "moved") {
    parts.push(story.movedFrom ? `Moved here from ${sessionLabelOf(story.movedFrom)}.` : "Moved here from another week.");
  } else if (story.kind === "did-happen") {
    parts.push("Put back when the session was said to have happened.");
  } else if (story.before) {
    const by = story.beforeSetBy;
    const approver = by ? firstOf(by.name) : "";
    const setBy = !by
      ? ""
      : by.byApproval
        ? approver
          ? `, set by ${approver}’s approval, ${dayAndClock(by.at)}`
          : ", set by an approved request to be excused"
        : `, set by ${approver || "somebody"}, ${dayAndClock(by.at)}`;
    parts.push(`Was ${story.before}${setBy}.`);
  }
  if (story.kind === "held-online") parts.push("The whole column was corrected: it was held online.");
  if (story.asked) {
    parts.push(`${story.asked.yours ? "You" : firstOf(story.asked.name) || "Somebody"} asked, ${dayAndClock(story.asked.at)}.`);
  }
  if (story.byApproval) {
    const who = firstOf(story.correctedBy.name);
    const at = dayAndClock(story.correctedAt);
    parts.push(`Corrected by ${who ? `${who}’s approval` : "an approved request to be excused"}${at ? `, ${at}` : ""}.`);
  } else {
    parts.push(`Corrected by ${firstOf(story.correctedBy.name) || "somebody"}, ${dayAndClock(story.correctedAt)}.`);
  }
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

/**
 * The chase of a register a move or a clear puts back to not taken, as the
 * route's preview says it (`chase`): whether the reminder email and the card
 * for the lead and admins go again, or why not (their time has passed, or
 * the job is switched off), and while the email goes again, who it goes to
 * and from when.
 */
export type ChaseView = {
  email: string;
  card: string;
  emailTo?: { kind: string; names: string[] } | null;
  emailFrom?: string | null;
};

/** Whether the reminder email will go to somebody again. */
function emailGoes(chase: ChaseView | undefined): chase is ChaseView & { emailTo: { kind: string; names: string[] } } {
  return Boolean(chase && chase.email === "returns" && chase.emailTo && chase.emailTo.names.length > 0);
}

/** The chase, as a preview says it comes back, or why not. */
function chaseWords(chase: ChaseView | undefined): string {
  if (!chase) return "";
  const email = emailGoes(chase)
    ? "The reminder email goes again."
    : chase.email === "returns"
      ? "The reminder email has nobody to go to."
      : chase.email === "off"
        ? "The reminder email is switched off, so it doesn’t go."
        : "The reminder email’s time for this session has passed, so it doesn’t go again.";
  const card =
    chase.card === "returns"
      ? "The card for the lead and admins comes back."
      : chase.card === "off"
        ? "The card for the lead and admins is switched off, so it doesn’t come back."
        : "The card for the lead and admins doesn’t come back: its time has passed.";
  return `${email} ${card}`;
}

/** "Nobody is emailed. ...": what a column correction tells, when nothing emails anybody. */
const TOLD_NOBODY = "Nobody is emailed. Its facilitators see it on the register; the people see it on their own pages.";

/**
 * Told, for a register a move or a clear puts back to not taken: nobody is
 * emailed, unless the reminder email goes again, when one plain sentence
 * says who gets it and when ("Its facilitators, Rahul and Sofia, get the
 * register reminder email soon after 6:04am on Thu 12 Nov if it isn’t
 * finished by then."). `at` is when the preview was worked out.
 */
export function toldWords(chase: ChaseView | undefined, at: Date): string {
  if (!emailGoes(chase)) return TOLD_NOBODY;
  const firsts = chase.emailTo.names.map((name) => firstOf(name) || "Somebody");
  const one = firsts.length === 1;
  const who =
    chase.emailTo.kind === "cover-taker"
      ? `${firsts[0]}, who took it in a facilitator’s place,`
      : chase.emailTo.kind === "cover-giver"
        ? `${firsts[0]}, who gave the session to somebody,`
        : `Its ${one ? "facilitator" : "facilitators"}, ${namesWords(firsts)},`;
  const from = instant(chase.emailFrom);
  const when =
    !from || from.getTime() <= at.getTime()
      ? "within about 15 minutes"
      : londonDayLabel(from) === londonDayLabel(at)
        ? `soon after ${londonClockLabel(from)} today`
        : `soon after ${londonClockLabel(from)} on ${londonDayLabel(from)}`;
  const verb = one || chase.emailTo.kind !== "facilitators" ? "gets" : "get";
  return `${who} ${verb} the register reminder email ${when} if it isn’t finished by then. Nobody else is emailed.`;
}

export type BeforeYouSave = { label: string; text: string }[];

/** "Before you save" for the column's online, move and clear, from the route's own preview. */
export function columnPreviewLines(preview: Record<string, unknown>, groupName: string): BeforeYouSave {
  const kind = preview.kind;
  const staying = (preview.staying as NamedLine[] | undefined) ?? [];
  const lines: BeforeYouSave = [];
  const figures = { label: "Figures", text: `Each person’s page, ${groupName.trim() || "the group"}, Overview and Surveys update.` };
  // A move or a clear puts the register back to not taken, so its reminder may go again.
  const chased = kind === "move" || kind === "clear" ? (preview.chase as ChaseView | undefined) : undefined;
  const told = { label: "Told", text: toldWords(chased, instant(preview.at as string | undefined) ?? new Date()) };
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
    const chase = chaseWords(chased);
    if (chase && to) lines.push({ label: "Reminders", text: chase });
  } else if (kind === "clear") {
    const clears = Number(preview.clears ?? 0);
    lines.push({
      label: "Changes",
      text: `${linesWords(clears)} cleared. Week ${preview.weekNumber} goes back to not taken, and the group’s history keeps what each said.`,
    });
    lines.push(staysWords(preview));
    const chase = chaseWords(chased);
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

/**
 * Whether the sheet offers Push the rest back, from the route's own preview
 * (`push`, worked out by every refusal a push meets), and, when it does not,
 * why, in the sentence the group page's own panel says for the same refusal.
 * Not offered until a preview has said.
 */
export function pushChoiceOf(preview: Record<string, unknown> | null): { offered: boolean; why: string } {
  const push = preview?.push as { offered?: unknown; why?: unknown } | undefined;
  if (!push || typeof push !== "object") return { offered: false, why: "" };
  if (push.offered === true) return { offered: true, why: "" };
  return { offered: false, why: typeof push.why === "string" ? push.why : "" };
}

/** "Before you save" for It didn't happen, from the route's own preview. */
export function didNotHappenPreviewLines(preview: Record<string, unknown>): BeforeYouSave {
  const weekNumber = Number(preview.weekNumber ?? 0);
  const lines: BeforeYouSave = [];
  const facts = preview.didNotHappen as { checkIn: boolean; reports: number } | undefined;
  const clearing = (preview.clearing as NamedLine[] | undefined) ?? [];
  const puttingBack = (preview.puttingBack as NamedLine[] | undefined) ?? [];
  // A line that said somebody came over an excusal goes back to excused, named as a cleared one is.
  const backWords =
    puttingBack.length > 0
      ? ` ${namesWords(puttingBack.map((each) => `${firstOf(each.name)} (${each.line.toLowerCase()})`))} ${puttingBack.length === 1 ? "goes" : "go"} back to excused.`
      : "";
  // The one-week change's own words for the cancel chosen: kept pace, the week
  // leaves everyone's attendance; pushed back, it meets a week later and its
  // register is taken then.
  const attendance = didNotHappenLines(
    { leavesAttendance: true, chaseStops: false, checkIn: false, reports: 0, lines: { cleared: 0, said: {} } },
    weekNumber,
    preview.pace === "push" ? "push" : "cancel",
  ).find((row) => row.label === "Attendance");
  if (attendance) lines.push(attendance);
  lines.push({
    label: "Register",
    text:
      clearing.length === 0 && puttingBack.length === 0
        ? "Nothing was set on its register, so nothing is cleared."
        : clearing.length === 0
          ? `Nothing set for it is cleared.${backWords} The group’s history keeps what each said.`
          : `${linesWords(clearing.length)} cleared: ${namesWords(clearing.map((each) => `${firstOf(each.name)} (${each.line.toLowerCase()})`))}.${backWords} The group’s history keeps what each said.`,
  });
  // Whose cover of a later session the press takes off (only a push moves one), in the route's own sentences: one line.
  const coversEnd = ((preview.coversEnd as string[] | undefined) ?? []).filter((text) => typeof text === "string" && text.trim());
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
  if (coversEnd.length > 0) lines.push({ label: "Cover", text: coversEnd.join(" ") });
  if (facts) {
    // What was opened or written for it, in the one-week change's own words for
    // the cancel chosen: kept pace, they are kept; pushed back, the week's
    // check-in and report are its new session's (a push back is refused once
    // either exists, so none is ever carried over).
    const said = didNotHappenLines(
      { leavesAttendance: false, chaseStops: false, checkIn: facts.checkIn, reports: facts.reports, lines: { cleared: 0, said: {} } },
      weekNumber,
      preview.pace === "push" ? "push" : "cancel",
    ).find((row) => row.label === "Check-in, report");
    if (said) lines.push(said);
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
      // Not "nobody was emailed": the register it leaves may be chased again.
      return `Week ${weekNumber}’s ${linesWords(count)} moved to week ${toWeek ?? "?"}. Week ${weekNumber} is back to not taken.`;
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

/**
 * The four ways somebody can be put down for It did happen: in the room,
 * online, absent, or excused (somebody who told us in advance they couldn't
 * make it is not counted absent).
 */
export const DID_HAPPEN_CHOICES: readonly LineChoice[] = LINE_CHOICES.filter(
  (choice) => choice.key === "present" || choice.key === "present-online" || choice.key === "absent" || choice.key === "excused",
);

/** The choice a person's line says now ("Excused", "In the room"), or null for a line that says nothing. */
export function choiceOfLine(line: string): LineChoice | null {
  return LINE_CHOICES.find((choice) => choice.words === line) ?? null;
}

/**
 * The choices It did happen offers one person: the four, and what their line
 * says now when it is another (arrived late, left early), so it can stay.
 */
export function didHappenChoicesFor(line: string): LineChoice[] {
  const now = choiceOfLine(line);
  return now && !DID_HAPPEN_CHOICES.some((choice) => choice.key === now.key) ? [...DID_HAPPEN_CHOICES, now] : [...DID_HAPPEN_CHOICES];
}

/** What a person's line says now, beside their name on It did happen: "Now: Excused", "Now: Not set". */
export function didHappenNowWords(line: string): string {
  return `Now: ${line.trim() || "Not set"}`;
}

/** The counts It did happen's Before you save says, from the choice for each person (a key, or null for none yet). */
export function didHappenCounts(keys: readonly (string | null)[]): { room: number; online: number; absent: number; excused: number } {
  const counts = { room: 0, online: 0, absent: 0, excused: 0 };
  for (const key of keys) {
    const choice = choiceOf(key);
    if (!choice) continue;
    if (cameBy(choice.status)) {
      if (choice.online) counts.online += 1;
      else counts.room += 1;
    } else if (choice.status === "absent") counts.absent += 1;
    else if (choice.status === "excused") counts.excused += 1;
  }
  return counts;
}

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

/** Who has a request: "Nobody has it yet", "You have it", "Sam has it". */
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

export function requestsWaitingLine(count: number, excused = 0): string {
  const asked = Math.min(Math.max(excused, 0), count);
  const corrections = count - asked;
  const correctionsLine =
    corrections === 1 ? "A facilitator has asked for a line of a register to be corrected." : `Facilitators have asked for ${corrections} lines of registers to be corrected.`;
  const excusedLine = asked === 1 ? "Somebody has asked to be excused from a week." : `${asked} requests to be excused are waiting.`;
  if (asked === 0) return correctionsLine;
  return corrections === 0 ? excusedLine : `${excusedLine} ${correctionsLine}`;
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
export const FACILITATORS_ROW_CHIP = "Admins and the programme’s lead only";
export const FACILITATORS_ROW_NOTE = "Facilitators don’t see this, and nor does anyone in the group.";
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
