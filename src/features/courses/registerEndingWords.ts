import type { PushEmailLine } from "@/lib/courses/pushEmail";
import type { NextEmailLine, RegisterEnding } from "@/lib/courses/registerEnding";

/**
 * THE WORDS UNDER A REGISTER'S BUTTON (wk-register), and the confirm's line
 * about who the button emails, from the values the register's route read off
 * records.
 *
 * Two endings, and the next-week email's switch on Site status decides which:
 *
 *  - ON ITS SCHEDULE (option B, as drawn): "Finish the register", then
 *    "Locks it and shows everyone their mark. Nobody’s emailed.", when next
 *    week's email goes, and who is chased if nobody finishes.
 *  - NOT ON ITS SCHEDULE (option A, how the site has always worked):
 *    "Push attendance", which emails the group about next week, when there is
 *    an email to send: the board's words when it goes, and why nobody is
 *    emailed when it does not (the group's last session, a week not published
 *    yet, an email that has already gone).
 *
 * WHAT A PRESS EMAILS IS NEVER WORKED OUT HERE. The route answers it for every
 * register on the page (`ending.pushEmails`, from the push's own decision in
 * `src/lib/courses/pushEmail.ts`), and the foot and the confirm put that one
 * answer into words, so neither can promise an email the press will not send.
 *
 * Every value in a sentence comes from the payload: the group's name, the day
 * and time the email goes, the hours, the facilitators' first names and the
 * lead's. A part whose value is missing (a job switched off, a run no
 * programme names) drops its sentence or its name rather than printing a
 * blank. Pure, with no imports but types, so the page and its tests share it.
 */

export type RegisterEndingWords = {
  /** The big button, and the confirm's button. */
  button: string;
  /** The short button in a column's header. */
  columnButton: string;
  /** The line right under the big button. */
  effect: string;
  /** The lines under that, in order. */
  notes: string[];
};

/** "Rahul and Sofia", "Rahul, Sofia and Tom". */
export function listOfNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** 36 as "36", 1.5 as "1.5". */
function hours(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** Who gets the reminder: their names, or the group's facilitators. */
function remindedPeople(names: readonly string[]): string {
  return names.length > 0 ? listOfNames(names) : "The group’s facilitators";
}

/** "Sofia gets", but "Rahul and Sofia get" and "The group’s facilitators get". */
function getsAReminder(names: readonly string[]): string {
  return names.length === 1 ? "gets a reminder." : "get a reminder.";
}

/** Who gets the task: the lead and admins, or admins alone. */
function taskPeople(leadName: string): string {
  return leadName ? `${leadName} and admins` : "admins";
}

/** The sentence about next week's email, while it is on its schedule. */
export function nextEmailSentence(groupName: string, line: NextEmailLine): string {
  const group = groupName.trim() || "the group";
  switch (line.state) {
    case "goes":
      return `Next week’s email goes to ${group} on ${line.at}, whatever happens here.`;
    case "went":
      return `Next week’s email went to ${group} on ${line.at}.`;
    case "waiting-for-week":
      return `Next week’s email to ${group} is waiting for week ${line.weekNumber} to be published.`;
    case "held":
      return `Next week’s email to ${group} is held: it’s missing ${listOfNames(line.missing)}.`;
    case "shortly":
      return `Next week’s email to ${group} goes out shortly.`;
    case "missed":
      return `Week ${line.weekNumber} has started without its email.`;
  }
}

/**
 * Who is chased if nobody finishes. Option B's sentence while the email is on
 * its schedule ("Not finished 36 hours after the session? ..."), option A's
 * while it is not ("After 36 hours ..."), each with the parts whose job is on.
 */
export function chaseSentence(ending: Pick<RegisterEnding, "scheduled" | "reminder" | "task">): string {
  const { reminder, task } = ending;
  const first = reminder ?? task;
  if (!first) return "";
  if (ending.scheduled) {
    const parts: string[] = [`Not finished ${hours(first.hours)} hours after the session?`];
    if (reminder) parts.push(`${remindedPeople(reminder.names)} ${getsAReminder(reminder.names)}`);
    if (task) {
      parts.push(
        reminder
          ? `At ${hours(task.hours)} hours, ${taskPeople(task.leadName)} get a task.`
          : `${capitalise(taskPeople(task.leadName))} get a task.`,
      );
    }
    return parts.join(" ");
  }
  const parts: string[] = [];
  if (reminder) {
    const who = lowerFirst(remindedPeople(reminder.names));
    parts.push(`After ${hours(reminder.hours)} hours ${who} ${getsAReminder(reminder.names)}`);
  }
  if (task) parts.push(`After ${hours(task.hours)} hours ${taskPeople(task.leadName)} get a task.`);
  return parts.join(" ");
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "The group’s facilitators" mid-sentence; a name is left as it is. */
function lowerFirst(text: string): string {
  return text.startsWith("The group’s") ? `t${text.slice(1)}` : text;
}

/** "1 person", "2 people". */
function people(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

type HeldLine = Extract<PushEmailLine, { kind: "held" }>;

/** Why a press emails nobody, in the confirm's words: what follows "Nobody is emailed: ". */
function heldReason(group: string, line: HeldLine): string {
  switch (line.why) {
    case "unpublished":
      return `week ${line.weekNumber} isn’t published yet, so the group won’t be sent a reminder`;
    case "claimed":
      return `${group} has already had its email about week ${line.weekNumber}`;
    case "nobody":
      return `nobody in ${group} is set up to receive email`;
    case "no-date":
      return `${group} has no dates set, so no reminder can be sent`;
    case "refused":
      return `there are too many people in ${group} for one email`;
    case "missing":
      return `week ${line.weekNumber}’s email is missing something it needs`;
  }
}

/** Why a press emails nobody, in the foot's words: the sentence after "Locks the register and shows everyone their mark." */
function heldFootSentence(group: string, line: HeldLine): string {
  switch (line.why) {
    case "unpublished":
      return `Week ${line.weekNumber} isn’t published yet, so nobody’s emailed.`;
    case "claimed":
      return `${capitalise(group)} has already had its email about week ${line.weekNumber}, so nobody’s emailed.`;
    case "nobody":
      return `Nobody in ${group} is set up to receive email.`;
    case "no-date":
      return `${capitalise(group)} has no dates set, so nobody’s emailed.`;
    case "refused":
      return `There are too many people in ${group} for one email, so nobody’s emailed.`;
    case "missing":
      return `Week ${line.weekNumber}’s email is missing something it needs, so nobody’s emailed.`;
  }
}

/**
 * THE CONFIRM'S LINE ABOUT WHO THE BUTTON EMAILS, and how many, from the
 * route's answer for that register (`ending.pushEmails[sessionKey]`): what the
 * press will do, said before it.
 */
export function pushEmailSentence(groupName: string, line: PushEmailLine): string {
  const group = groupName.trim() || "this group";
  switch (line.kind) {
    case "scheduled":
      return "Nobody’s emailed. Next week’s email goes on its own schedule, whatever happens here.";
    case "not-held":
      return "Nobody is emailed: this session didn’t happen, so its register needs nothing.";
    case "last":
      return "Nobody is emailed: this is the group’s last session, so there is nothing to remind them about.";
    case "sends": {
      // A cancelled session is not one to remind them to come to: the email
      // about it says it is off.
      const about = line.cancelled
        ? `saying ${line.day ? `${line.day}’s` : `week ${line.weekNumber}’s`} session is cancelled`
        : `about week ${line.weekNumber}${line.day ? ` on ${line.day}` : ""}`;
      if (line.emails >= line.people) return `Everyone in ${group} gets one email ${about}: ${people(line.emails)}.`;
      return `${line.emails} of the ${people(line.people)} in ${group} ${line.emails === 1 ? "gets" : "get"} one email ${about}.`;
    }
    case "held":
      return `Nobody is emailed: ${heldReason(group, line)}.`;
  }
}

/**
 * Everything the foot of the register says. `focus` decides which state:
 * a session to finish, or the one just finished.
 */
export function registerEndingWords(ending: RegisterEnding): RegisterEndingWords {
  const group = ending.groupName.trim() || "the group";
  const chase = chaseSentence(ending);
  const finished = ending.focus?.finished === true;

  if (ending.scheduled) {
    const notes: string[] = [];
    if (finished) notes.push("This register is finished. Everyone can see their mark.");
    if (ending.nextEmail) notes.push(nextEmailSentence(ending.groupName, ending.nextEmail));
    if (!finished && chase) notes.push(chase);
    return {
      button: "Finish the register",
      columnButton: "Finish",
      effect: "Locks it and shows everyone their mark. Nobody’s emailed.",
      notes,
    };
  }

  // What pressing this register's button emails, as the route answered it.
  // A payload with no answer for the session (one from before the route gave
  // it) is worded from whether a session comes after it, as it always was.
  const line = ending.focus && !finished ? ending.pushEmails?.[ending.focus.sessionKey] : undefined;
  const sends = line ? line.kind === "sends" : ending.hasNext;
  const notes: string[] = [];
  if (finished) notes.push("This register is pushed. Everyone can see their mark.");
  if (!finished && sends) notes.push("If nobody pushes, nobody gets next week’s email.");
  if (!finished && chase) notes.push(chase);
  return {
    button: "Push attendance",
    columnButton: "Push",
    effect: pushEffect(group, line, ending.hasNext),
    notes,
  };
}

/** The line under "Push attendance": the board's when the press emails the group, and why nobody is emailed when not. */
function pushEffect(group: string, line: PushEmailLine | undefined, hasNext: boolean): string {
  const locks = "Locks the register and shows everyone their mark.";
  const kind = line?.kind ?? (hasNext ? "sends" : "last");
  if (kind === "sends") return `Locks the register, shows everyone their mark and emails ${group} about next week.`;
  if (kind === "last") return `${locks} It’s the group’s last session, so nobody’s emailed.`;
  if (line?.kind === "held") return `${locks} ${heldFootSentence(group, line)}`;
  return `${locks} Nobody’s emailed.`;
}

// ---------------------------------------------------------------------------
// The push's own answer, when next week's email waits for its week
// ---------------------------------------------------------------------------

/**
 * Who marks a week ready, which publishes it, as the push's answer names them
 * to the person who pressed. Only the programme's lead and admins can (the
 * ready route), so a facilitator is told who does it and never told to do it
 * themselves; nobody is named to themselves.
 */
export type MarksReady =
  /** The person who pressed is an admin: marking it ready and the run's catch-up send are both theirs. */
  | { kind: "admin" }
  /** The person who pressed leads the programme that names the run. */
  | { kind: "you" }
  /** The programme's lead, by the name they go by ("" when they have given none). */
  | { kind: "lead"; firstName: string }
  /** No lead stands for the run: admins mark its weeks ready. */
  | { kind: "admins" };

/** "Week 3 isn’t published yet, so nobody was emailed.": what happened, in the foot's words. */
export function unpublishedHeldWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t published yet, so nobody was emailed.`;
}

/** The sentence after it: who marks the week ready, said to the person who pressed. */
function marksReadyWords(who: MarksReady): string {
  switch (who.kind) {
    case "admin":
      return "Mark it ready, then use the run’s catch-up send.";
    case "you":
      return "Marking it ready publishes it.";
    case "lead": {
      const name = who.firstName.trim();
      return name ? `${name} marks it ready.` : "The programme’s lead marks it ready.";
    }
    case "admins":
      return "An admin marks it ready.";
  }
}

/**
 * The push's answer when the group's email about the next session waits for
 * that session's week to be published: "Week 3 isn’t published yet, so nobody
 * was emailed. Claudia marks it ready." Nothing sends the email later when the
 * week is marked ready, and these words promise nothing of the kind.
 */
export function unpublishedPushWords(weekNumber: number, marksReady: MarksReady): string {
  return `${unpublishedHeldWords(weekNumber)} ${marksReadyWords(marksReady)}`;
}
