import type { NextEmailLine, RegisterEnding } from "@/lib/courses/registerEnding";

/**
 * THE WORDS UNDER A REGISTER'S BUTTON (wk-register), from the values the
 * register's route read off records.
 *
 * Two endings, and the next-week email's switch on Site status decides which:
 *
 *  - ON ITS SCHEDULE (option B, as drawn): "Finish the register", then
 *    "Locks it and shows everyone their mark. Nobody’s emailed.", when next
 *    week's email goes, and who is chased if nobody finishes.
 *  - NOT ON ITS SCHEDULE (option A, how the site has always worked):
 *    "Push attendance", which emails the group about next week.
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

  const notes: string[] = [];
  if (finished) notes.push("This register is pushed. Everyone can see their mark.");
  if (!finished && ending.hasNext) notes.push("If nobody pushes, nobody gets next week’s email.");
  if (!finished && chase) notes.push(chase);
  return {
    button: "Push attendance",
    columnButton: "Push",
    effect: ending.hasNext
      ? `Locks the register, shows everyone their mark and emails ${group} about next week.`
      : "Locks the register and shows everyone their mark. It’s the group’s last session, so nobody’s emailed.",
    notes,
  };
}
