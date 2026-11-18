import { sessionWhenWords } from "../excused/words";
import { couldBeFollowed } from "../followable";
import { londonClockLabel, londonDayLabel, sessionWhenLabel } from "../londonLabels";
import { dayWords } from "../sessionChange/words";
import { andList } from "../staffMove/words";

/**
 * A ONE-WEEK VISIT TO ANOTHER GROUP'S SESSION: every sentence it says, to
 * staff (the page that arranges one, its route, a register, a group's page),
 * to the person (their programme page's card) and in its emails.
 *
 * The person's words and the emails' are the approved ones, word for word;
 * where a fact is missing, a sentence changes only by leaving that fact out.
 * A typed value (a name, a group's name, a room) is printed as it was typed,
 * one line; the email's template escapes it. A room that could be followed (a
 * link) is never printed: no email carries a meeting link.
 *
 * Pure: no reads, no clock. Read in the browser too.
 */

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/** One line of typed text, or "". */
function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** A group's name, or a stand-in. */
function groupName(name: string | null | undefined): string {
  return line(name) || "another group";
}

/** Somebody's name with "’s": "Aisha’s". */
function possessive(name: string): string {
  return `${line(name)}’s`;
}

/** "Wed 11 Nov, 6pm" for a session, or "" with no date. */
function startWords(dateKey: string, startTimeLocal: string): string {
  return sessionWhenWords(dateKey, startTimeLocal);
}

/** "Wed 11 Nov, 6pm to 8pm" for a session, or "" with no date or time. */
function spanWords(dateKey: string, startTimeLocal: string, durationMinutes: number): string {
  if (!dateKey) return "";
  return sessionWhenLabel({ weekday: -1, startTimeLocal, durationMinutes }, dateKey);
}

/** A room that may be printed: one line, never a link. */
function printableRoom(room: string): string {
  const said = line(room);
  return said && !couldBeFollowed(said) ? said : "";
}

/** "Monica Partridge C12, University Park": the room and the campus, each left out when missing. */
export function placeWords(room: string, campus: string): string {
  return [printableRoom(room), line(campus)].filter(Boolean).join(", ");
}

/** One session, as every sentence here reads it. */
export type VisitSessionFacts = {
  dateKey: string;
  startTimeLocal: string;
  durationMinutes: number;
  /** The room that week, as typed; "" for none. */
  room: string;
  /** The campus's label that week; "" for none. */
  campus: string;
};

// ---------------------------------------------------------------------------
// A register, and a group's page
// ---------------------------------------------------------------------------

/** "Visiting from Group C": a visitor's line on the host's register. */
export function visitingFromWords(homeName: string): string {
  return `Visiting from ${groupName(homeName)}`;
}

/** "At Group F this week": a visiting member's line on their own group's register and page. */
export function awayAtWords(hostName: string): string {
  return `At ${groupName(hostName)} this week`;
}

/** "Aisha is at Group F this week.": a mark sent for that line, refused. */
export function awayMarkRefusal(firstName: string, hostName: string): string {
  return `${line(firstName) || "They"} is at ${groupName(hostName)} this week.`;
}

/**
 * Over a correction of a visitor's line on the host's register: "Kwame’s week
 * 1 lives on your register, because Kwame came to your session. Group C’s
 * register says “At Group F this week” and can’t be changed there. Kwame’s
 * attendance is one record, so it updates on Kwame’s page and on Group C’s
 * attendance too."
 */
export function visitorCorrectionWords(input: { firstName: string; weekNumber: number; homeName: string; hostName: string }): string {
  const first = line(input.firstName) || "Their";
  const who = line(input.firstName) || "they";
  const whose = line(input.firstName) ? possessive(first) : "their";
  const home = groupName(input.homeName);
  return (
    `${line(input.firstName) ? possessive(first) : "Their"} week ${input.weekNumber} lives on your register, because ${who} came to your session. ` +
    `${possessive(home)} register says “${awayAtWords(input.hostName)}” and can’t be changed there. ` +
    `${line(input.firstName) ? possessive(first) : "Their"} attendance is one record, so it updates on ${whose} page and on ${possessive(home)} attendance too.`
  );
}

/** The chip on a visitor's line on the host's page. */
export const VISITING_CHIP = "Visiting";

/**
 * On the host group's pages, beside a visitor's name: "Visiting from Group C,
 * week 2 only. You can read Aisha’s week 2; Rahul gives the feedback." Their
 * own group's facilitators by first name; "Group C’s facilitators" with none.
 */
export function visitingLineWords(input: {
  firstName: string;
  homeName: string;
  weekNumber: number;
  homeFacilitatorFirstNames: readonly string[];
}): string {
  const first = line(input.firstName) || "their";
  const givers = andList(input.homeFacilitatorFirstNames);
  const gives = givers
    ? `${givers} ${input.homeFacilitatorFirstNames.filter((name) => line(name)).length === 1 ? "gives" : "give"} the feedback`
    : `${possessive(groupName(input.homeName))} facilitators give the feedback`;
  return `${visitingFromWords(input.homeName)}, week ${input.weekNumber} only. You can read ${possessive(first)} week ${input.weekNumber}; ${gives}.`;
}

// ---------------------------------------------------------------------------
// The person's own card (approved words)
// ---------------------------------------------------------------------------

/** The card's chip: "Visiting Group I". */
export function visitingChipWords(hostName: string): string {
  return `Visiting ${groupName(hostName)}`;
}

/** "Group I with Lucy, this week only"; "Group I, this week only" with nobody named. */
export function hostWithWords(hostName: string, hostFacilitatorFirstNames: readonly string[]): string {
  const names = andList(hostFacilitatorFirstNames);
  return names ? `${groupName(hostName)} with ${names}, this week only` : `${groupName(hostName)}, this week only`;
}

/** "You’re still in Group C: back on Wed 18 Nov."; "You’re still in Group C." with no later session of theirs. */
export function stillInWords(homeName: string, backDateKey: string | null): string {
  const back = backDateKey ? dayWords(backDateKey) : "";
  return back ? `You’re still in ${groupName(homeName)}: back on ${back}.` : `You’re still in ${groupName(homeName)}.`;
}

/** "Arranged by Zach, Tue 10 Nov, 1:40pm.": who arranged it, by first name, and when. */
export function arrangedByWords(firstName: string, at: Date): string {
  return `Arranged by ${line(firstName)}, ${londonDayLabel(at)}, ${londonClockLabel(at)}.`;
}

/** The card's third button. */
export const CANCEL_THIS_VISIT = "Cancel this visit";

/**
 * Under the buttons: "You can cancel until Wed 11 Nov, 6pm. Rahul and Lucy are
 * told." The time is when the earlier of the two sessions starts; the people
 * told are their own group's facilitators, then the host's, by first name,
 * and the second sentence is left out when there is nobody to tell.
 */
export function cancelUntilWords(until: { dateKey: string; startTimeLocal: string }, toldFirstNames: readonly string[]): string {
  const when = startWords(until.dateKey, until.startTimeLocal);
  const names = andList(toldFirstNames);
  const first = when ? `You can cancel until ${when}.` : "";
  return [first, names ? `${names} ${toldFirstNames.filter((name) => line(name)).length === 1 ? "is" : "are"} told.` : ""].filter(Boolean).join(" ");
}

/**
 * Asked once before cancelling: "Cancel your visit to Group I on Wed 11 Nov?
 * You’ll be with Group C as usual: Thu 12 Nov, 3pm. Rahul and Lucy are told."
 */
export function cancelQuestionWords(input: {
  hostName: string;
  hostDateKey: string;
  homeName: string;
  /** Their own group's session that week, or null with none. */
  own: { dateKey: string; startTimeLocal: string } | null;
  toldFirstNames: readonly string[];
}): string {
  const day = dayWords(input.hostDateKey);
  const own = input.own ? startWords(input.own.dateKey, input.own.startTimeLocal) : "";
  const names = andList(input.toldFirstNames);
  return [
    `Cancel your visit to ${groupName(input.hostName)}${day ? ` on ${day}` : ""}?`,
    own ? `You’ll be with ${groupName(input.homeName)} as usual: ${own}.` : `You’ll be with ${groupName(input.homeName)} as usual.`,
    names ? `${names} ${input.toldFirstNames.filter((name) => line(name)).length === 1 ? "is" : "are"} told.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const CANCEL_THE_VISIT = "Cancel the visit";
export const KEEP_IT = "Keep it";

/** After cancelling: "You cancelled your visit to Group I. You’re with Group C as usual on Thu 12 Nov, 3pm." */
export function cancelledWords(input: { hostName: string; homeName: string; own: { dateKey: string; startTimeLocal: string } | null }): string {
  const own = input.own ? startWords(input.own.dateKey, input.own.startTimeLocal) : "";
  return `You cancelled your visit to ${groupName(input.hostName)}. ${
    own ? `You’re with ${groupName(input.homeName)} as usual on ${own}.` : `You’re with ${groupName(input.homeName)} as usual.`
  }`;
}

/** The person's own cancel, too late: "Group I’s session has started, so this visit can’t be cancelled now." */
export function cancelTooLateWords(hostName: string): string {
  return `${possessive(groupName(hostName))} session has started, so this visit can’t be cancelled now.`;
}

/** The person's own cancel did not go through, and the visit stands: "That didn’t go through, so your visit to Group I still stands. Try again." */
export function cancelFailedWords(hostName: string): string {
  return `That didn’t go through, so your visit to ${groupName(hostName)} still stands. Try again.`;
}

/** What the cancel route says of a cancel that did not happen, beside its status: why, as a kind, never as words. */
export type CancelRefusalKind = "too-late" | "no-visit";

/**
 * THE ONE LINE THE PERSON'S PAGE SAYS WHEN THEIR CANCEL DOES NOT HAPPEN,
 * from the route's status and kind alone, never its words: too late (the
 * earlier of the two sessions has started); nothing at all when the visit is
 * already gone (the page reads itself again and shows no visit) or they are
 * signed out (the site's own sign-in); otherwise that it did not go through and
 * the visit stands. Status 0 is a request that never reached the server.
 */
export function cancelOutcomeLine(answer: { status: number; kind?: unknown }, hostName: string, firstName: string = hostName): string | null {
  // Too late names the group whose session HAS started: the earlier of the two (`cancelDeadline`).
  if (answer.kind === "too-late") return cancelTooLateWords(firstName);
  if (answer.kind === "no-visit" || answer.status === 401) return null;
  return cancelFailedWords(hostName);
}

/** On the excuse form, the week's line for a visit week: "Week 2 · Wed 11 Nov, at Group I". */
export function excuseVisitWeekWords(weekNumber: number, hostDateKey: string, hostName: string): string {
  const day = dayWords(hostDateKey);
  return `Week ${weekNumber} · ${day ? `${day}, ` : ""}at ${groupName(hostName)}`;
}

// ---------------------------------------------------------------------------
// The emails (approved words)
// ---------------------------------------------------------------------------

/** One email's words: its subject, its lines, its button and the line at its foot ("" for none). */
export type VisitEmailWords = {
  subject: string;
  lines: string[];
  button: string;
  footnote: string;
};

/** The facts every email of a visit is written from. */
export type VisitEmailFacts = {
  /** The person: the name they go by ("Daniel Kim") and their first name ("Daniel"). */
  personName: string;
  personFirstName: string;
  weekNumber: number;
  hostName: string;
  homeName: string;
  /** The host's session that week. */
  host: VisitSessionFacts;
  /** The host's facilitators by first name, never the reader's own. */
  hostFacilitatorFirstNames: readonly string[];
  /** Their own group's next session after the visit's week, or null with none. */
  backDateKey: string | null;
  /** When the earlier of the two sessions of that week starts: the last moment the visit can be cancelled. */
  cancelUntil: { dateKey: string; startTimeLocal: string };
};

/**
 * To the person: "You’re going to Group I’s session on Wed 11 Nov". Staff
 * arranged it, so the approved first sentence ("Your request is approved.")
 * and the quoted reply are not said: nobody asked, and nobody replied.
 */
export function personEmailWords(facts: VisitEmailFacts): VisitEmailWords {
  const host = groupName(facts.hostName);
  const day = dayWords(facts.host.dateKey);
  const when = spanWords(facts.host.dateKey, facts.host.startTimeLocal, facts.host.durationMinutes);
  const place = placeWords(facts.host.room, facts.host.campus);
  const names = andList(facts.hostFacilitatorFirstNames);
  const where = [place, names ? `with ${names}` : ""].filter(Boolean).join(", ");
  const back = facts.backDateKey ? dayWords(facts.backDateKey) : "";
  const until = startWords(facts.cancelUntil.dateKey, facts.cancelUntil.startTimeLocal);
  return {
    subject: `You’re going to ${possessive(host)} session${day ? ` on ${day}` : ""}`,
    lines: [
      `For week ${facts.weekNumber} you’re with ${host}:`,
      ...(when ? [when] : []),
      ...(where ? [where] : []),
      `${back ? `You’re still in ${groupName(facts.homeName)}, and back with them on ${back}.` : `You’re still in ${groupName(facts.homeName)}.`} Week ${facts.weekNumber}’s work is due by ${possessive(host)} session.`,
    ],
    button: "Open your programme page",
    footnote: until ? `Changed your mind? You can cancel the visit on your programme page until ${until}.` : "",
  };
}

/**
 * To each of the host group's facilitators: "Daniel Kim is joining Group I for
 * week 2". `online` is where the lines about joining online go, once a member
 * can ask for a visit and tick that they would join online: none today.
 */
export function hostEmailWords(facts: VisitEmailFacts, online: readonly string[] = []): VisitEmailWords {
  const person = line(facts.personName) || "Somebody";
  const first = line(facts.personFirstName) || person;
  const host = groupName(facts.hostName);
  const when = startWords(facts.host.dateKey, facts.host.startTimeLocal);
  return {
    subject: `${person} is joining ${host} for week ${facts.weekNumber}`,
    lines: [
      `${person}, from ${groupName(facts.homeName)}, is coming to your week ${facts.weekNumber} session${when ? ` on ${when}` : ""}, for that week only.`,
      `Your register will list ${first} as visiting, and you can read ${possessive(first)} week ${facts.weekNumber} work. ${possessive(groupName(facts.homeName))} facilitators still give the feedback.`,
      ...online,
    ],
    button: "Open your group",
    footnote: "This is an automated email, sent because a visit to your session was approved.",
  };
}

/** To each of the home group's facilitators: "Daniel Kim is at Group I for week 2". */
export function homeEmailWords(facts: VisitEmailFacts): VisitEmailWords {
  const person = line(facts.personName) || "Somebody";
  const first = line(facts.personFirstName) || person;
  const host = groupName(facts.hostName);
  const when = startWords(facts.host.dateKey, facts.host.startTimeLocal);
  const back = facts.backDateKey ? dayWords(facts.backDateKey) : "";
  return {
    subject: `${person} is at ${host} for week ${facts.weekNumber}`,
    lines: [
      `${person} is going to ${possessive(host)} session${when ? ` on ${when}` : ""}, for week ${facts.weekNumber} only${back ? `, and is back with ${groupName(facts.homeName)} on ${back}` : ""}.`,
      `Your register will show ${first} as “${awayAtWords(facts.hostName)}”. There’s nothing for you to do, and you still give the feedback on ${possessive(first)} work.`,
    ],
    button: "Open your group",
    footnote: "This is an automated email, sent because a visit was approved for somebody in your group.",
  };
}

/** To both groups' facilitators, when a visit is called off: "Daniel Kim’s visit to Group I for week 2 is off". No greeting. */
export function calledOffEmailWords(input: { personName: string; hostName: string; homeName: string; weekNumber: number }): VisitEmailWords {
  const person = line(input.personName) || "Somebody";
  const host = groupName(input.hostName);
  return {
    subject: `${possessive(person)} visit to ${host} for week ${input.weekNumber} is off`,
    lines: [`${person} is no longer coming to ${possessive(host)} week ${input.weekNumber} session, and will be at ${possessive(groupName(input.homeName))} as usual.`],
    button: "Open your group",
    footnote: "This is an automated email.",
  };
}

/** To the person, only when STAFF call a visit off: "Your visit to Group I for week 2 is off". */
export function calledOffPersonEmailWords(input: {
  hostName: string;
  homeName: string;
  weekNumber: number;
  hostDateKey: string;
  own: { dateKey: string; startTimeLocal: string } | null;
}): VisitEmailWords {
  const host = groupName(input.hostName);
  const day = dayWords(input.hostDateKey);
  const own = input.own ? startWords(input.own.dateKey, input.own.startTimeLocal) : "";
  return {
    subject: `Your visit to ${host} for week ${input.weekNumber} is off`,
    lines: [
      `Your visit to ${possessive(host)} session${day ? ` on ${day}` : ""} has been cancelled. ${
        own ? `You’re with ${groupName(input.homeName)} as usual on ${own}.` : `You’re with ${groupName(input.homeName)} as usual.`
      }`,
    ],
    button: "Open your programme page",
    footnote: "",
  };
}

// ---------------------------------------------------------------------------
// The page that arranges one (staff)
// ---------------------------------------------------------------------------

/** "Aisha Rahman: visit another group for one week". */
export function visitTitle(personName: string): string {
  return `${line(personName) || "Somebody"}: visit another group for one week`;
}

export const VISIT_PAGE_TITLE = "Visit another group for one week";
export const VISIT_LINK = "Visit another group for one week";
export const WHICH_WEEK = "Which week?";
export const WHICH_SESSION = "Which session?";
export const WHY_LABEL = "Why (kept with the visit)";
export const WHY_HINT = "Optional. The programme’s lead and admins read it on both groups’ history. It is never emailed, and never shown to the person or a facilitator.";
export const WHAT_WILL_HAPPEN = "What will happen";
export const CANCEL = "Cancel";
export const CLOSE = "Close";
export const FULL_THIS_WEEK = "Full this week";
export const CHOOSE_A_WEEK = "Choose a week";
export const CHOOSE_A_SESSION = "Choose a session";
export const SHOW_WHAT_HAPPENS = "Show what happens";
export const ARRANGING = "Arranging…";
export const CALLING_OFF = "Calling it off…";
export const CANT_ARRANGE = "This visit can’t be arranged";
export const BACK_TO_PEOPLE = "Go to People";
/** Over a visit that stands, on the same page. */
export const VISIT_STANDS = "This visit stands";

/** "Week 2 · Group C meets Thu 12 Nov, 3pm": a week to choose, by their own group's session. */
export function weekChoiceWords(weekNumber: number, homeName: string, own: { dateKey: string; startTimeLocal: string } | null): string {
  const when = own ? startWords(own.dateKey, own.startTimeLocal) : "";
  return when ? `Week ${weekNumber} · ${groupName(homeName)} meets ${when}` : `Week ${weekNumber}`;
}

/** "Group F · Thu 12 Nov, 5pm to 7pm": a session to choose, its first line. */
export function sessionChoiceWords(hostName: string, session: VisitSessionFacts): string {
  const when = spanWords(session.dateKey, session.startTimeLocal, session.durationMinutes);
  return when ? `${groupName(hostName)} · ${when}` : groupName(hostName);
}

/** "University Park · George Green B06 · Harriet · 1 place left", or "… · Full this week". */
export function sessionDetailWords(session: VisitSessionFacts, facilitatorFirstNames: readonly string[], placesLeft: number | null): string {
  const parts = [line(session.campus), printableRoom(session.room), andList(facilitatorFirstNames)].filter(Boolean);
  if (placesLeft !== null) parts.push(placesLeft <= 0 ? FULL_THIS_WEEK : placesLeft === 1 ? "1 place left" : `${placesLeft} places left`);
  return parts.join(" · ");
}

/** The labels of "What will happen", in the board's order. The first is the week's own. */
export const LINE_LABEL = {
  // In backticks: a scan of module specifiers over compiled code reads the
  // last word of this label, closed by a plain quote, as the start of an import.
  late: `Late from`,
  reminders: "Reminders",
  registers: "Registers",
  reading: "Reading",
  link: "Link",
  told: "Told",
} as const;

/** The first line's label: "Week 2". */
export function weekLabel(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/**
 * Week: "Aisha goes to Group F: Thu 12 Nov, 5pm to 7pm, George Green B06, with
 * Harriet. Aisha stays in Group C and is back on Wed 18 Nov."
 */
export function weekLineWords(input: {
  firstName: string;
  hostName: string;
  homeName: string;
  host: VisitSessionFacts;
  hostFacilitatorFirstNames: readonly string[];
  backDateKey: string | null;
}): string {
  const first = line(input.firstName) || "They";
  const details = [
    spanWords(input.host.dateKey, input.host.startTimeLocal, input.host.durationMinutes),
    printableRoom(input.host.room),
    andList(input.hostFacilitatorFirstNames) ? `with ${andList(input.hostFacilitatorFirstNames)}` : "",
  ].filter(Boolean);
  const back = input.backDateKey ? dayWords(input.backDateKey) : "";
  return `${first} goes to ${groupName(input.hostName)}${details.length ? `: ${details.join(", ")}` : ""}. ${first} stays in ${groupName(input.homeName)}${back ? ` and is back on ${back}` : ""}.`;
}

/** Late from: "Thu 12 Nov, 5pm: Group F’s session." */
export function lateLineWords(hostName: string, host: Pick<VisitSessionFacts, "dateKey" | "startTimeLocal">): string {
  const when = startWords(host.dateKey, host.startTimeLocal);
  return `${when ? `${when}: ` : ""}${possessive(groupName(hostName))} session.`;
}

/** Reminders: "Follow Group F’s time." and, when the week is done, "Aisha’s week 2 is done, so none will go." */
export function remindersLineWords(input: { firstName: string; hostName: string; weekNumber: number; done: boolean }): string {
  const base = `Follow ${possessive(groupName(input.hostName))} time.`;
  if (!input.done) return base;
  return `${base} ${possessive(line(input.firstName) || "Their")} week ${input.weekNumber} is done, so none will go.`;
}

/** Registers: "On Group F’s as visiting, with Group F’s check-in. Group C’s shows “At Group F this week”." */
export function registersLineWords(hostName: string, homeName: string): string {
  const host = possessive(groupName(hostName));
  return `On ${host} as visiting, with ${host} check-in. ${possessive(groupName(homeName))} shows “${awayAtWords(hostName)}”.`;
}

/** Reading: "Harriet can read Aisha’s week 2 only. Rahul keeps everything and gives the feedback." */
export function readingLineWords(input: {
  firstName: string;
  weekNumber: number;
  hostName: string;
  homeName: string;
  hostFacilitatorFirstNames: readonly string[];
  homeFacilitatorFirstNames: readonly string[];
}): string {
  const first = line(input.firstName) || "their";
  const readers = andList(input.hostFacilitatorFirstNames) || `${possessive(groupName(input.hostName))} facilitators`;
  const keepers = andList(input.homeFacilitatorFirstNames);
  const keep = keepers
    ? `${keepers} ${input.homeFacilitatorFirstNames.filter((name) => line(name)).length === 1 ? "keeps everything and gives" : "keep everything and give"} the feedback.`
    : `${possessive(groupName(input.homeName))} facilitators keep everything and give the feedback.`;
  return `${readers} can read ${possessive(first)} week ${input.weekNumber} only. ${keep}`;
}

/** Link: "If Aisha joins online, the link shown is Group F’s for that week." */
export function linkLineWords(firstName: string, hostName: string): string {
  return `If ${line(firstName) || "they"} joins online, the link shown is ${possessive(groupName(hostName))} for that week.`;
}

/** Told: "3 emails: Aisha, Harriet and Rahul." */
export function toldLineWords(firstNames: readonly string[]): { count: string; rest: string } {
  const n = firstNames.length;
  if (n === 0) return { count: "No emails", rest: ": nobody here has an address on the site." };
  return { count: n === 1 ? "1 email" : `${n} emails`, rest: `: ${andList(firstNames)}.` };
}

/** "Group K is full this week: this makes 7, one over its limit of 6." */
export function overLimitWords(hostName: string, makes: number, capacity: number): string {
  const over = makes - capacity;
  return `${groupName(hostName)} is full this week: this makes ${makes}, ${over === 1 ? "one" : String(over)} over its limit of ${capacity}.`;
}

/** "Arrange the visit and email 3 people", or "Arrange the visit" with nobody to email. */
export function arrangeButtonWords(emails: number): string {
  if (emails <= 0) return "Arrange the visit";
  return `Arrange the visit and email ${emails === 1 ? "1 person" : `${emails} people`}`;
}

/** "Call off this visit and email 3 people", or "Call off this visit" with nobody to email. */
export function callOffButtonWords(emails: number): string {
  if (emails <= 0) return "Call off this visit";
  return `Call off this visit and email ${emails === 1 ? "1 person" : `${emails} people`}`;
}

/** "Week 2: Aisha goes to Group F’s session on Thu 12 Nov, 5pm.": a visit that stands, on the page that arranged it. */
export function standingWords(input: { firstName: string; weekNumber: number; hostName: string; host: Pick<VisitSessionFacts, "dateKey" | "startTimeLocal"> }): string {
  const when = startWords(input.host.dateKey, input.host.startTimeLocal);
  return `Week ${input.weekNumber}: ${line(input.firstName) || "They"} goes to ${possessive(groupName(input.hostName))} session${when ? ` on ${when}` : ""}.`;
}

/** A visit to a session no longer happening (called off, not held, or its group gone), on the staff page. */
export function noLongerHappeningWords(hostName: string): string {
  return `${possessive(groupName(hostName))} session that week is no longer happening.`;
}

/** What the press says once a visit is arranged. */
export function arrangedWords(input: { firstName: string; hostName: string; weekNumber: number; sent: number; failed: number }): string {
  const base = `${line(input.firstName) || "They"} goes to ${groupName(input.hostName)} for week ${input.weekNumber}.`;
  return `${base}${sentWords(input.sent, input.failed, "the visit is kept")}`;
}

/** What the press says once a visit is called off. */
export function calledOffWords(input: { firstName: string; hostName: string; weekNumber: number; sent: number; failed: number }): string {
  const base = `${possessive(line(input.firstName) || "Their")} visit to ${groupName(input.hostName)} for week ${input.weekNumber} is off.`;
  return `${base}${sentWords(input.sent, input.failed, "the visit is still off")}`;
}

function sentWords(sent: number, failed: number, kept: string): string {
  const said = sent === 1 ? " 1 email sent." : sent > 1 ? ` ${sent} emails sent.` : "";
  const notSent = failed > 0 ? ` ${failed === 1 ? "1 email" : `${failed} emails`} could not be sent; ${kept}.` : "";
  return `${said}${notSent}`;
}

// ---------------------------------------------------------------------------
// The history rows (one on each group)
// ---------------------------------------------------------------------------

/** On the person's own group's history: "Aisha Rahman visits Group F for week 2." */
export function visitsDetail(personName: string, hostName: string, weekNumber: number, reason: string): string {
  return withReason(`${line(personName) || "Somebody"} visits ${groupName(hostName)} for week ${weekNumber}.`, reason);
}

/** On the host's history: "Aisha Rahman is at Group F for week 2." */
export function visitingDetail(personName: string, hostName: string, weekNumber: number, reason: string): string {
  return withReason(`${line(personName) || "Somebody"} is at ${groupName(hostName)} for week ${weekNumber}.`, reason);
}

/** On both groups' history, once called off: "Aisha Rahman’s visit to Group F for week 2 is off." */
export function calledOffDetail(personName: string, hostName: string, weekNumber: number): string {
  return `${possessive(line(personName) || "Somebody")} visit to ${groupName(hostName)} for week ${weekNumber} is off.`;
}

function withReason(base: string, reason: string): string {
  const why = reason.replace(/\s+/g, " ").trim();
  return why ? `${base} Reason: ${why}` : base;
}

// ---------------------------------------------------------------------------
// What the routes refuse
// ---------------------------------------------------------------------------

export const VISIT_REFUSAL = {
  body: "Expected a JSON object body.",
  week: "Choose the week of the visit.",
  group: "Choose the session to visit.",
  emailCount: "Say how many people the button said it would email.",
  overLimit: "Say that the page showed the session is full.",
  reason: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason. It goes into both groups’ history.",
  notYours: "Only the programme’s lead and admins can arrange a visit to another group.",
  noProgramme: "That programme is not on this form.",
  noRun: "This programme doesn’t name a course run yet, so it has no groups.",
  runGone: "The course run this programme names is no longer on the site.",
  runOver: "The course run is over, so no visit can be arranged on it.",
  runArchived: "The course run is archived, so no visit can be arranged on it.",
  noPlace: "This person doesn’t hold a place in a group on the run.",
  oneGroup: "This run has one group, so there is no other group’s session to go to.",
  noGroup: "That group isn’t one of this run’s groups.",
  noVisit: "There is no visit that week to call off.",
  changed: "Something changed while you were looking. Check the page, then press again.",
  notYourVisit: "That visit isn’t yours to cancel.",
} as const;

/** "Group F no longer meets." */
export function hostArchivedWords(hostName: string): string {
  return `${groupName(hostName)} no longer meets.`;
}

/** "Aisha is in Group F that week, so there is nothing to visit." */
export function hostIsOwnWords(firstName: string, hostName: string): string {
  return `${line(firstName) || "They"} is in ${groupName(hostName)} that week, so there is nothing to visit.`;
}

/** "Group F has no session in week 2." */
export function hostHasNoneWords(hostName: string, weekNumber: number): string {
  return `${groupName(hostName)} has no session in week ${weekNumber}.`;
}

/** "Group F’s week 2 session is called off." */
export function hostCancelledWords(hostName: string, weekNumber: number): string {
  return `${possessive(groupName(hostName))} week ${weekNumber} session is called off.`;
}

/** "Group F’s week 2 session didn’t happen." */
export function hostNotHeldWords(hostName: string, weekNumber: number): string {
  return `${possessive(groupName(hostName))} week ${weekNumber} session didn’t happen.`;
}

/** "Group F’s week 2 session has started." */
export function hostStartedWords(hostName: string, weekNumber: number): string {
  return `${possessive(groupName(hostName))} week ${weekNumber} session has started.`;
}

/** "Aisha is already marked on Group C’s register for week 2." */
export function alreadyMarkedWords(firstName: string, homeName: string, weekNumber: number): string {
  return `${line(firstName) || "They"} is already marked on ${possessive(groupName(homeName))} register for week ${weekNumber}.`;
}

/** "Aisha already has a visit in week 2." */
export function alreadyVisitingWords(firstName: string, weekNumber: number): string {
  return `${line(firstName) || "They"} already has a visit in week ${weekNumber}.`;
}

/** "Group F’s week 2 register can’t take anybody more." */
export function registerFullWords(hostName: string, weekNumber: number): string {
  return `${possessive(groupName(hostName))} week ${weekNumber} register can’t take anybody more.`;
}

/** "Group C has no session to come in week 2." */
export function ownWeekGoneWords(homeName: string, weekNumber: number): string {
  return `${groupName(homeName)} has no session to come in week ${weekNumber}.`;
}

/** "The visit can no longer be cancelled: Group F’s session has started." */
export function tooLateToCancelWords(hostName: string): string {
  return `The visit can no longer be cancelled: ${possessive(groupName(hostName))} session has started.`;
}

/** Refused: a request to be excused from that week is waiting. "Aisha is waiting to hear about being excused from week 2. Decide that request first." */
export function excusedWaitingWords(firstName: string, weekNumber: number): string {
  return `${firstName || "They"} ${firstName ? "is" : "are"} waiting to hear about being excused from week ${weekNumber}. Decide that request first.`;
}

/** The durable limit on the emails of arranging and calling off (`./limits.ts`). Staff-facing. */
export const VISIT_LIMIT_WORDS = {
  person: (limit: number) => `This person’s visits have been arranged or called off ${limit} times in the last day. Nothing was changed or sent. Try again tomorrow.`,
  presser: (limit: number) => `You have arranged or called off ${limit} visits in the last day. Nothing was changed or sent. Try again tomorrow.`,
  unread: "The limit on these emails couldn’t be checked, so nothing was changed or sent. Try again.",
} as const;

/** 409: the count changed between the page and the press. */
export function changedWords(emails: number): string {
  return `The visit now emails ${emails === 1 ? "1 person" : `${emails} people`}. Check the page, then press again.`;
}

/** 409: the session filled up between the page and the press. */
export function nowFullWords(hostName: string): string {
  return `${groupName(hostName)} is full that week now. Check the page, then press again.`;
}
