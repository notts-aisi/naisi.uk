import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { clockWords, dayWords, namesWords, peopleWords } from "@/lib/courses/sessionChange/words";
import { firstWordOf } from "./pageModel";

/**
 * THE WORDS OF COVERING A REGISTER ON THE PAGES: the notice on a group's
 * page when a session has started and nobody has started its register, the
 * three ways forward, the sheet that gives a session to somebody else, the
 * register's line about whose place is taken and who set each line, and the
 * check before Finish.
 *
 * PURE, and in British English. Stored wall clocks print through
 * `clockWords`, instants through the house clock (`londonClockLabel`,
 * `londonDayLabel`). Facilitators are named by first name in a sentence
 * ("Josh"), by whole name where the board does ("in place of Josh Bennett").
 */

// ---------------------------------------------------------------------------
// The ways forward, on the group's page
// ---------------------------------------------------------------------------

export const TAKE_THE_REGISTER = "Take the register";
export const IM_COVERING_IT = "I’m covering it";
export const SOMEONE_ELSE_IS_COVERING = "Someone else is covering";
export const IT_DIDNT_HAPPEN = "It didn’t happen";
export const NO_REGISTER_YET = "No register yet";

/** "Josh's place", "Priya and Sam's place". */
function placeOf(firstNames: readonly string[]): string {
  return `${namesWords(firstNames)}’s place`;
}

/** "Take the register in Josh's place", or "Take the register" for a group with no facilitator. */
export function takeInPlaceWords(firstNames: readonly string[]): string {
  return firstNames.length > 0 ? `Take the register in ${placeOf(firstNames)}` : TAKE_THE_REGISTER;
}

/** "Josh hasn't started week 2's register", "Priya and Sam haven't ...", "Nobody has started ...". */
export function notStartedTitle(firstNames: readonly string[], weekNumber: number): string {
  if (firstNames.length === 0) return `Nobody has started week ${weekNumber}’s register`;
  return `${namesWords(firstNames)} ${firstNames.length === 1 ? "hasn’t" : "haven’t"} started week ${weekNumber}’s register`;
}

/** "Started 12 minutes ago", "Started 3 hours ago", "Started on Tue 3 Nov": from the session's start. */
export function startedAgoWords(startsAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - startsAt.getTime()) / 60_000);
  if (minutes < 1) return "Started just now";
  if (minutes < 60) return `Started ${minutes === 1 ? "1 minute" : `${minutes} minutes`} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Started ${hours === 1 ? "1 hour" : `${hours} hours`} ago`;
  return `Started on ${londonDayLabel(startsAt)}`;
}

/**
 * The notice's sentence: when and where the session began, and that nobody
 * has started its register. "Group E's session began at 4pm in Monica
 * Partridge E05, and Josh hasn't started its register." For a session that
 * has ended, its day: "Group E's session was Tue 3 Nov, 4pm, ...".
 */
export function notStartedLine(input: {
  groupName: string;
  dateKey: string;
  hhmm: string;
  room: string;
  ended: boolean;
  firstNames: readonly string[];
}): string {
  const group = input.groupName.trim() || "The group";
  const clock = clockWords(input.hhmm);
  const where = input.room.trim() ? ` in ${input.room.trim()}` : "";
  const when = input.ended
    ? `was ${[dayWords(input.dateKey), clock].filter(Boolean).join(", ")}${where ? `,${where}` : ""}`
    : `began${clock ? ` at ${clock}` : ""}${where}`;
  const who =
    input.firstNames.length === 0
      ? "nobody has started its register"
      : `${namesWords(input.firstNames)} ${input.firstNames.length === 1 ? "hasn’t" : "haven’t"} started its register`;
  return `${group}’s session ${when}, and ${who}. Admins and leads can take it from here, for this session or any past one.`;
}

/** Under the three: "Whichever you choose, the register records who took it, and the reminders to Josh about it stop." */
export function whicheverWords(firstNames: readonly string[]): string {
  if (firstNames.length === 0) return "Whichever you choose, the register records who took it.";
  return `Whichever you choose, the register records who took it, and the reminders to ${namesWords(firstNames)} about it stop.`;
}

/** The sheet's title: "Group E, today at 4pm", or "Group E, Tue 3 Nov at 4pm". */
export function sheetTitle(groupName: string, dateKey: string, hhmm: string, todayKey: string): string {
  const group = groupName.trim() || "This group";
  const day = dateKey === todayKey ? "today" : dayWords(dateKey);
  const clock = clockWords(hhmm);
  return `${group}, ${day}${clock ? ` at ${clock}` : ""}`;
}

/**
 * The sheet's question: "Josh Bennett hasn't started the register. What's
 * happening?"; for a register somebody has saved lines on and not finished,
 * that it isn't finished.
 */
export function sheetQuestion(fullNames: readonly string[], started: boolean, taken = false): string {
  if (!started) {
    return fullNames.length > 0 ? `If ${namesWords(fullNames)} can’t make it, choose who takes the register.` : "Choose who takes the register.";
  }
  if (taken) return "Its register has lines on it and isn’t finished. What’s happening?";
  if (fullNames.length === 0) return "Nobody has started the register. What’s happening?";
  return `${namesWords(fullNames)} ${fullNames.length === 1 ? "hasn’t" : "haven’t"} started the register. What’s happening?`;
}

/** Once a facilitator has started the register, there is nobody to cover for: the sheet opens the register itself. */
export const HELPING_LINE = "One of the group’s facilitators has started this register, so it doesn’t need covering. You can still open it and help.";
export const OPEN_THE_REGISTER = "Open the register";
/** A register finished since the page was drawn. */
export const FINISHED_LINE = "This register is finished.";

export const IM_COVERING_IT_LINE = "You take the register, open the check-in and write the session report from it.";
export const SOMEONE_ELSE_LINE = "Give them this session’s register, check-in and report, for this session only.";

/** "Nobody ran it. You choose what happens to week 2 next." */
export function didntHappenLine(weekNumber: number): string {
  return `Nobody ran it. You choose what happens to week ${weekNumber} next.`;
}

/** A week somebody already has: "Zach is taking this register." / "Ola Nowak has this session until midnight." */
export function coveredLine(cover: { kind: "self" | "given"; byName: string; live: boolean }): string {
  if (cover.kind === "self") return `${cover.byName} is taking this register. Choosing again replaces that.`;
  return cover.live
    ? `${cover.byName} has this session until midnight. Choosing again replaces that.`
    : `${cover.byName} had this session until midnight, and the register isn’t finished.`;
}

// ---------------------------------------------------------------------------
// Someone else is covering
// ---------------------------------------------------------------------------

export const WHOS_COVERING = "Who’s covering";
export const OFF_UNLESS_TICKED = "Off unless you tick it.";
export const CHOOSE_SOMEBODY = "Choose who is covering.";
export const READING_PEOPLE = "Reading who could cover…";

/** "Group E, today at 4pm, Monica Partridge E05." */
export function giveLede(groupName: string, dateKey: string, hhmm: string, room: string, todayKey: string): string {
  const where = room.trim() ? `, ${room.trim()}` : "";
  return `${sheetTitle(groupName, dateKey, hhmm, todayKey)}${where}.`;
}

/** "until midnight at the end of Tue 10 Nov", from the cover's own end (the start of the next London day). */
export function untilWords(untilIso: string | null): string {
  if (!untilIso) return "until midnight";
  const until = new Date(untilIso);
  if (Number.isNaN(until.getTime())) return "until midnight";
  return `until midnight at the end of ${londonDayLabel(new Date(until.getTime() - 60_000))}`;
}

/** What somebody given a session gets, and for how long. */
export function giveWhatTheyGet(untilIso: string | null): string {
  return `An admin, a committee member, the programme’s lead, one of its track leads or one of its facilitators. For this session only, ${untilWords(untilIso)}, they get its register, check-in and session report, with the group’s names: no notes, applications or email addresses.`;
}

/**
 * Who has a session already, over the person picker: "Ola Nowak has this
 * session until midnight. Giving it to somebody else replaces that."; for the
 * person chosen, that it is theirs already and nothing would be sent.
 */
export function givenAlreadyWords(holder: { name: string; kind: "self" | "given"; live: boolean }, chosenIsHolder: boolean): string {
  if (chosenIsHolder && holder.kind === "given" && holder.live) {
    return `${holder.name} has this session already, until midnight. Giving it again sends nothing.`;
  }
  if (holder.kind === "self") return `${holder.name} is taking this register. Giving it to somebody else replaces that.`;
  return holder.live
    ? `${holder.name} has this session until midnight. Giving it to somebody else replaces that.`
    : `${holder.name} had this session until midnight, and the register isn’t finished.`;
}

/** "Tell Group E that Ola is running today's session (6 people)". */
export function tellGroupWords(groupName: string, firstName: string, today: boolean, dateKey: string, emails: number): string {
  const which = today ? "today’s session" : `the session on ${dayWords(dateKey)}`;
  return `Tell ${groupName.trim() || "the group"} that ${firstName} is running ${which} (${peopleWords(emails)})`;
}

/** "To Ola", over the email they are sent. */
export function emailToWords(firstName: string): string {
  return `To ${firstName}`;
}

/**
 * The one button: "Give Ola this session and email Ola (1)"; with the tick,
 * "Give Ola this session and email Ola and the group (7)"; "Give Ola this
 * session" when nobody can be emailed.
 */
export function giveButtonWords(firstName: string, personEmails: number, groupEmails: number): string {
  const base = `Give ${firstName} this session`;
  if (personEmails > 0 && groupEmails > 0) return `${base} and email ${firstName} and the group (${personEmails + groupEmails})`;
  if (personEmails > 0) return `${base} and email ${firstName} (${personEmails})`;
  if (groupEmails > 0) return `${base} and email the group (${groupEmails})`;
  return base;
}

/** After the press: "Ola has this session until midnight. Emailed Ola." */
export function gaveWords(firstName: string, sentToPerson: boolean, groupSent: number): string {
  const emailed = [sentToPerson ? firstName : "", groupSent > 0 ? peopleWords(groupSent) + " in the group" : ""].filter(Boolean);
  return `${firstName} has this session until midnight.${emailed.length > 0 ? ` Emailed ${namesWords(emailed)}.` : " Nobody was emailed."}`;
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

/** One line's stamp, as the register's read sends it. */
export type SetterView = { name: string; at: string; how: string; yours?: boolean };

/**
 * WHO SET A LINE, AND WHEN, in the board's words: "Set before the session"
 * for the person's own word, "Set by you, 4:14pm" for the reader's own line,
 * "Zach, 4:14pm" for anybody else's, and "Zach’s approval, 9:10pm" for a
 * line an admin's approval of a request to be excused wrote.
 */
export function setByWords(entry: SetterView): string {
  if (entry.how === "self") return "Set before the session";
  // Who approved it, and when, reach admins alone: anybody else is sent neither.
  if (entry.how === "approval" && !entry.name) return SET_BY_APPROVED_REQUEST;
  const at = new Date(entry.at);
  const clock = Number.isNaN(at.getTime()) ? "" : londonClockLabel(at);
  if (entry.yours) return clock ? `Set by you, ${clock}` : "Set by you";
  const who = firstWordOf(entry.name) || "Somebody";
  if (entry.how === "approval") return clock ? `${who}’s approval, ${clock}` : `${who}’s approval`;
  return clock ? `${who}, ${clock}` : who;
}

/** A line an approved request to be excused set, as a reader who is not an admin is told it. */
export const SET_BY_APPROVED_REQUEST = "Set by an approved request";

/** A person on the cover, as the register's read sends them. */
export type CoverPersonView = { uid: string; name: string; you?: boolean };

/** A session's cover, as the register's read sends it. */
export type CoverLineView = {
  kind: "self" | "given";
  by: CoverPersonView;
  at: string;
  covering: CoverPersonView[];
  live: boolean;
  yours: boolean;
  /**
   * False for a session given to somebody who runs nothing on the programme.
   * Sent to admins, the programme's lead and the person who holds it alone.
   */
  stands?: boolean;
};

/**
 * THE LINE OVER THE REGISTER ABOUT WHOSE PLACE IS TAKEN, for one session,
 * or null with nothing to say:
 *
 *  - the reader took it, or was given it: "You're taking this in place of
 *    Josh Bennett. The register will say Zach took it, and the reminders to
 *    Josh about it stop.";
 *  - a facilitator whose place somebody took, arriving: "Zach started this
 *    register at 4:12pm, covering for you. Carry on from here: each line says
 *    who set it." Never a word about their own record of being there;
 *  - an admin or a lead about to save the first line of a register nobody
 *    has started: that the first line takes it in the facilitators' place,
 *    said before they tap;
 *  - an admin or a lead on a register a facilitator started: that they are
 *    helping, not covering.
 */
export function placeLine(input: {
  cover: CoverLineView | null;
  /** The group's facilitators, by whole name, with the reader marked. */
  facilitators: CoverPersonView[];
  /** The reader is one of the group's facilitators. */
  readerFacilitates: boolean;
  /** One of the group's facilitators has saved a line or a mark on it. */
  facilitatorStarted: boolean;
  finished: boolean;
}): string | null {
  const { cover, facilitators } = input;
  if (input.finished) return null;
  if (cover) {
    const firstOf = (person: CoverPersonView) => firstWordOf(person.name);
    if (cover.kind === "given" && cover.live && cover.stands === false) return givenNoLongerStandsLine(cover.by.name);
    if (cover.yours && cover.live) {
      const took = firstOf(cover.by);
      if (cover.covering.length === 0) return `You’re taking this register. It will say ${took} took it.`;
      return `You’re taking this in place of ${namesWords(cover.covering.map((each) => each.name))}. The register will say ${took} took it, and the reminders to ${namesWords(cover.covering.map(firstOf))} about it stop.`;
    }
    if (input.readerFacilitates) {
      const covering = [...cover.covering.filter((each) => each.you).map(() => "you"), ...cover.covering.filter((each) => !each.you).map(firstOf)];
      const forWhom = covering.length > 0 ? `, covering for ${namesWords(covering)}` : "";
      const started =
        cover.kind === "self"
          ? `${firstOf(cover.by)} started this register at ${clockOf(cover.at)}${forWhom}.`
          : `${cover.by.name} was given this session${forWhom}.`;
      return `${started} Carry on from here: each line says who set it.`;
    }
    const place = cover.covering.length > 0 ? ` in ${namesWords(cover.covering.map(firstOf))}’s place` : "";
    if (cover.kind === "self") return `${cover.by.name} is taking this register${place}.`;
    return cover.live ? `${cover.by.name} has this session until midnight${place}.` : `${cover.by.name} had this session${place}, until midnight.`;
  }
  if (input.readerFacilitates) return null;
  if (input.facilitatorStarted) return "One of the group’s facilitators started this register, so you’re helping, not covering. Each line says who set it.";
  if (facilitators.length === 0) return "The first line you set takes this register. It will say you took it.";
  return `You’re not one of the group’s facilitators, so the first line you set takes this register in place of ${namesWords(facilitators.map((each) => each.name))}. It will say you took it, and the reminders to ${namesWords(facilitators.map((each) => firstWordOf(each.name)))} about it stop.`;
}

function clockOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : londonClockLabel(at);
}

/** Over the one session's meeting link, for somebody given that session (never in an email). */
export const GIVEN_SESSION_LINK_LINE = "This session’s meeting link is here while the session is yours.";

/**
 * To the person a session was given to, on the register's page, once they no
 * run nothing on the programme: the grant does not stand.
 */
export const REGISTER_NOT_YOURS_TITLE = "This register isn’t yours now";

export const GIVEN_NO_LONGER_YOURS =
  "This session was given to you, but you no longer run anything on this programme, so its register isn’t yours to take now. Whoever gave it to you can give it to somebody else.";

/**
 * The register's line about a session given to somebody who runs nothing on
 * the programme, to the people who can give it again (admins and the
 * programme's lead): the only readers sent whether it stands.
 */
export function givenNoLongerStandsLine(name: string): string {
  return `${name.trim() || "The person"} was given this session but no longer runs anything on the programme, so it isn’t theirs now. You can give it to somebody else.`;
}
export const JOIN_ONLINE = "Join online";

/** The line where the old "Didn't happen" switch was: where the two cancels live now. */
export const DIDNT_HAPPEN_MOVED_FACILITATOR = "Didn’t happen? Use Change one week on the group’s page.";
export const DIDNT_HAPPEN_MOVED_STAFF = "Didn’t happen? Use It didn’t happen on the group’s page.";
export const OPEN_THE_GROUPS_PAGE = "Open the group’s page";

/** Over a report written in a facilitator's place: "It will say you wrote it, covering for Josh." */
export function reportCoveringLine(firstNames: readonly string[]): string {
  return firstNames.length > 0 ? `It will say you wrote it, covering for ${namesWords(firstNames)}.` : "It will say you wrote it.";
}

export const WRITE_THE_SESSION_REPORT = "Write the session report";

// ---------------------------------------------------------------------------
// The check before Finish
// ---------------------------------------------------------------------------

export const CHECK_IT_BEFORE_YOU_FINISH = "Check it before you finish";
export const KEEP_EDITING = "Keep editing";
export const NOBODY_MARKED_YET = "Nobody is marked yet.";
export const FACILITATORS_HERE_TODAY = "Facilitators here today";
export const ONLY_ADMINS_AND_LEAD_SEE_HERE = "Only admins and the programme’s lead see who was here.";

/** "Sam Okafor (you)". */
export function hereTickWords(name: string, you: boolean): string {
  return you ? `${name} (you)` : name;
}

// ---------------------------------------------------------------------------
// The side panel, for admins and the programme's lead
// ---------------------------------------------------------------------------

export const THIS_SESSION = "This session";
export const TAKEN_BY = "Taken by";
export const FACILITATORS_RECORD_TITLE = "Facilitators (admins and the programme’s lead only)";
export const CHANGE = "Change";
export const NOBODY_RECORDED = "Nothing recorded yet.";

/** "Zach, from 4:12pm, covering for Josh". */
export function takenByWords(cover: CoverLineView): string {
  const covering = cover.covering.length > 0 ? `, covering for ${namesWords(cover.covering.map((each) => firstWordOf(each.name)))}` : "";
  if (cover.kind === "given") return `${cover.by.name}, given this session${covering}`;
  return `${cover.by.name}, from ${clockOf(cover.at)}${covering}`;
}

/** "Reminders to Josh about this register". */
export function remindersTitle(firstNames: readonly string[]): string {
  return firstNames.length > 0 ? `Reminders to ${namesWords(firstNames)} about this register` : "Reminders about this register";
}

/** "Stopped at 4:12pm", when the cover was taken. */
export function remindersStoppedWords(cover: CoverLineView): string {
  const at = new Date(cover.at);
  if (Number.isNaN(at.getTime())) return "Stopped";
  return `Stopped at ${londonClockLabel(at)} on ${londonDayLabel(at)}`;
}

/** One facilitator's entry: "Josh Bennett: not there", "Josh Bennett: arrived late, 4:41pm". */
export function presenceWords(entry: { name: string; state: string; arrivedAt: string | null }): string {
  if (entry.state === "there") return `${entry.name}: there`;
  if (entry.state === "late") {
    const at = entry.arrivedAt ? new Date(entry.arrivedAt) : null;
    return at && !Number.isNaN(at.getTime()) ? `${entry.name}: arrived late, ${londonClockLabel(at)}` : `${entry.name}: arrived late`;
  }
  return `${entry.name}: not there`;
}

export const PRESENCE_CHOICES: readonly { value: "there" | "late" | "not-there"; label: string }[] = [
  { value: "there", label: "There" },
  { value: "late", label: "Arrived late" },
  { value: "not-there", label: "Not there" },
];

// ---------------------------------------------------------------------------
// It didn't happen: the Change panel with the two cancels
// ---------------------------------------------------------------------------

/** What the change route's preview says of a session called off after it started (`preview.didNotHappen`). */
export type DidNotHappenPreview = {
  leavesAttendance: boolean;
  chaseStops: boolean;
  checkIn: boolean;
  reports: number;
  lines: { cleared: number; said: Record<string, string>; names?: Record<string, string> };
};

/** "Week 2 didn't happen". */
export function didntHappenTitle(weekNumber: number): string {
  return `Week ${weekNumber} didn’t happen`;
}

/** "Group E, Tue 10 Nov, 4pm." */
export function didntHappenLede(groupName: string, dateKey: string, hhmm: string): string {
  return `${[groupName.trim() || "The group", dayWords(dateKey), clockWords(hhmm)].filter(Boolean).join(", ")}.`;
}

export const WHAT_HAPPENS_AFTER = "What happens to the weeks after it";

/** Over the two cancels in Change one week, for a week whose register is a draft with marks. */
export const DRAFT_DIDNT_HAPPEN_LINE =
  "Its register has lines on it and isn’t finished. If the session didn’t happen, choose what happens to the weeks after it: its lines are cleared, and the group’s history keeps what each said.";
export const KEEP_PACE = "Keep pace";
export const PUSH_THE_REST_BACK = "Push the rest back a week";

/** "Email Group E (6 people)": the optional notice, with its count. */
export function emailGroupWords(groupName: string, emails: number): string {
  return `Email ${groupName.trim() || "the group"} (${peopleWords(emails)})`;
}

function capital(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * THE LINES "WHAT WILL HAPPEN" GAINS for a session called off after it
 * started, from the change route's own preview: it leaves everyone's
 * attendance; the lines set for it are cleared (whose, and what each said)
 * while what people said in advance stays; whether a check-in or a report
 * was made for it; and that the reminders about its register stop. Only
 * what is true today, and true for the cancel chosen: kept pace, the week
 * has no session; pushed back, the week meets a week later, and its
 * register, check-in and report are that session's (a push back is refused
 * once a check-in or a report exists, so none is ever carried over). The
 * panel's own lines say when the week's work locks.
 */
export function didNotHappenLines(
  facts: DidNotHappenPreview,
  weekNumber: number,
  kind: "cancel" | "push" | string = "cancel",
): { label: string; text: string }[] {
  const lines: { label: string; text: string }[] = [];
  const pushed = kind === "push";
  if (facts.leavesAttendance) {
    lines.push({
      label: "Attendance",
      text: pushed
        ? `The session that didn’t happen leaves everyone’s attendance. Nobody is counted absent, and week ${weekNumber}’s register is taken at its new session.`
        : `Week ${weekNumber} leaves everyone’s attendance. Nobody is counted absent.`,
    });
  }
  const said = Object.entries(facts.lines.said);
  if (facts.lines.cleared === 0 || said.length === 0) {
    lines.push({ label: "Register", text: "Nothing was set on its register, so nothing is cleared." });
  } else {
    const each = said.map(([uid, words]) => `${facts.lines.names?.[uid] ?? "Somebody"} (${words.toLowerCase()})`);
    lines.push({
      label: "Register",
      text: `${facts.lines.cleared === 1 ? "1 line set for it is" : `${facts.lines.cleared} lines set for it are`} cleared: ${namesWords(each)}. The group’s history keeps what each said, and what people said in advance stays.`,
    });
  }
  const made = [facts.checkIn ? "its check-in was opened" : "", facts.reports > 0 ? `${facts.reports === 1 ? "1 session report was" : `${facts.reports} session reports were`} written` : ""].filter(Boolean);
  lines.push({
    label: "Check-in, report",
    text:
      made.length > 0
        ? `${capital(made.join(", and "))}. They are kept, and nothing more opens for it.`
        : pushed
          ? `Nothing was opened or written for it. Week ${weekNumber}’s check-in and report are for its new session.`
          : "Neither opens: there was no session.",
  });
  if (facts.chaseStops) lines.push({ label: "Register reminders", text: `Reminders about week ${weekNumber}’s register stop.` });
  return lines;
}
