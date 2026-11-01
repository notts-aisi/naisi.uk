import { FEEDBACK_SENT, dayAndClockWords } from "@/lib/courses/writtenAnswerWords";

/**
 * THE WORDS OF A GROUP'S WEEK (boards wk-fac-group, wk-fac-group-phone,
 * wk-reflections and wk-reflections-phone), in one place: This week's work,
 * the reflections half of the review queue, who ticked each source, the
 * private notes, and the page where a facilitator picks reflections to read
 * out. Every name, number and date in them comes from a record.
 *
 * The boards draw some of these; the rest (who ticked each source, the
 * private notes, a facilitator's own work, the lead's pages) no board draws,
 * and they are listed in the build notes for the boards' designers to
 * confirm. No sentence here guesses a pronoun.
 */

// ---------------------------------------------------------------------------
// This week's work (wk-fac-group)
// ---------------------------------------------------------------------------

export const THIS_WEEKS_WORK = "This week’s work";

/** "Week 3 · Thu 12 to Wed 18 Nov", set in capitals by the stylesheet; "Week 3" with no dates. */
export function weekMetaWords(weekNumber: number, range: string): string {
  return range ? `Week ${weekNumber} · ${range}` : `Week ${weekNumber}`;
}

export const NAME = "Name";

/** A column's head: "Part 1 reflection". */
export function partReflectionWords(partNumber: number): string {
  return `Part ${partNumber} reflection`;
}

export const WRITTEN = "Written";
export const NOT_YET = "Not yet";
export const REFLECTIONS = "Reflections";

/** Beside a facilitator's own row, for the lead and admins: their own coursework, marked as theirs. */
export const FACILITATOR = "Facilitator";

/**
 * One person's reflections in a line (the phone board's): "Part 1 and part 2
 * written", "Part 1 written · part 2 not yet", "Not yet".
 */
export function reflectionsLineWords(parts: ReadonlyArray<{ number: number; written: boolean }>): string {
  if (parts.length === 0) return "";
  if (parts.every((part) => !part.written)) return NOT_YET;
  if (parts.every((part) => part.written)) {
    const names = parts.map((part, index) => `${index === 0 ? "Part" : "part"} ${part.number}`);
    return `${listWords(names)} written`;
  }
  return parts
    .map((part, index) => `${index === 0 ? "Part" : "part"} ${part.number} ${part.written ? "written" : "not yet"}`)
    .join(" · ");
}

/**
 * Under This week's work, to a facilitator, when the group's facilitators do
 * its coursework too: whose eyes that work is for.
 */
export function facilitatorsWorkLine(leadFirstName: string | null): string {
  const lead = leadFirstName?.trim();
  return lead
    ? `Facilitators’ own work is for ${lead} and admins to read, so it isn’t listed here.`
    : "Facilitators’ own work is for admins to read, so it isn’t listed here.";
}

/**
 * Under This week's work, to the lead and admins, when the group's
 * facilitators' own work is listed beside the fellows': whom every number on
 * the page counts. No board draws it: listed in the build notes for the
 * boards' designers to confirm.
 */
export function ownCountedApartLine(fellows: number): string {
  return `Every number here counts the group’s ${fellows} ${fellows === 1 ? "fellow" : "fellows"}. Facilitators’ own work is marked Facilitator and isn’t counted.`;
}

/** Before anybody in the group is listed. */
export const NOBODY_LISTED = "Nobody is in this group yet.";

// The pathway, written answer and case columns (wk-fac-group) ---------------

/** A written answer waiting for the reader's feedback, a link to it: the board's words. */
export const TO_GIVE_FEEDBACK = "To give feedback";

/** "Feedback sent · Rahul": the board's words, the first name of who sent it, or "Feedback sent" with none. */
export function feedbackSentByWords(byName: string | null): string {
  const name = byName?.trim();
  return name ? `${FEEDBACK_SENT} · ${name}` : FEEDBACK_SENT;
}

/** A pack the person chooses themselves, not chosen yet. No board draws it: listed for the boards' designers. */
export const NOT_CHOSEN_YET = "Not chosen yet";

// The boxes each person filled in (week 6's action plan) ---------------------
// No board draws a reader's view of somebody's boxes: these are listed in the
// build notes for the boards' designers to confirm.

/** What the boxes are called by somebody who did not write them: "My action plan" is "action plan". */
function boxesNameWords(title: string): string {
  const trimmed = title.trim();
  const own = /^my\s+(.+)$/i.exec(trimmed);
  if (own) return own[1];
  if (!trimmed) return "boxes";
  return /^[A-Z][a-z]/.test(trimmed) ? `${trimmed[0].toLowerCase()}${trimmed.slice(1)}` : trimmed;
}

/** The section's heading: "Each person’s action plan". */
export function eachPersonsBoxesWords(title: string): string {
  return `Each person’s ${boxesNameWords(title)}`;
}

/** The button's words. */
export const READ_IT = "Read it";
export const HIDE_IT = "Hide it";

/** The button's name for a screen reader, its words first: "Read it: Amara Okafor’s action plan". */
export function readPersonsBoxesWords(name: string, title: string): string {
  return `${READ_IT}: ${name}’s ${boxesNameWords(title)}`;
}

/** The same button, open: "Hide it: Amara Okafor’s action plan". */
export function hidePersonsBoxesWords(name: string, title: string): string {
  return `${HIDE_IT}: ${name}’s ${boxesNameWords(title)}`;
}

/** A box its writer has left empty. */
export const NOT_FILLED_IN = "Not filled in yet.";

// ---------------------------------------------------------------------------
// The review queue's reflections half
// ---------------------------------------------------------------------------

export const REVIEW_QUEUE = "Review queue";

/** "Part 1, 6 of 7 · Part 2, 5 of 7": how many of the group have written each part's reflection. */
export function queueCountsWords(counts: ReadonlyArray<{ number: number; written: number; of: number }>): string {
  return counts.map((count) => `Part ${count.number}, ${count.written} of ${count.of}`).join(" · ");
}

export const READ_THEM = "Read them";

// ---------------------------------------------------------------------------
// Who ticked each source (Q31) and the private notes (Q38)
// ---------------------------------------------------------------------------

export const READING_TICKS = "Reading ticks";

/** Over a source's title: "Part 2 · Read", or "Read" for a source outside the parts. */
export function sourcePlaceWords(partNumber: number | null, kindLabel: string): string {
  return partNumber === null ? kindLabel : `Part ${partNumber} · ${kindLabel}`;
}

/** "5 of 7": how many of the people shown ticked a source. Never a percentage. */
export function tickedWords(ticked: number, of: number): string {
  return `${ticked} of ${of}`;
}

export const SEE_WHO = "See who";
/** The names button, open: says what it hides, beside the notes button's own. */
export const HIDE_NAMES = "Hide names";
export const HIDE_NOTES = "Hide notes";

/** The names button's name for a screen reader, its words first: "See who ticked A keeper’s diary". */
export function seeWhoNameWords(title: string): string {
  return `${SEE_WHO} ticked ${title}`;
}

/** The same button, open: "Hide names for A keeper’s diary". */
export function hideWhoNameWords(title: string): string {
  return `${HIDE_NAMES} for ${title}`;
}

/** "1 private note", "2 private notes". */
export function privateNotesWords(n: number): string {
  return n === 1 ? "1 private note" : `${n} private notes`;
}

/** The notes button's name for a screen reader, its words first: "2 private notes on A keeper’s diary". */
export function privateNotesNameWords(n: number, title: string): string {
  return `${privateNotesWords(n)} on ${title}`;
}

/** The same button, open: "Hide notes for A keeper’s diary". */
export function hideNotesNameWords(title: string): string {
  return `${HIDE_NOTES} for ${title}`;
}

/** Who reads the private notes, under the ticks, to a facilitator and an admin. */
export function privateNotesWhoLine(groupName: string): string {
  return `Only ${groupName}’s facilitators and admins read private notes. They’re never read out.`;
}

/** A source ticked by nobody yet. */
export const NOBODY_TICKED = "Nobody yet";

/** A week with no source to tick. */
export const NO_SOURCES = "This week has no sources to tick.";

// ---------------------------------------------------------------------------
// Reading lines out (wk-reflections)
// ---------------------------------------------------------------------------

/** "Group B · Week 3 · Reflections", set in capitals by the stylesheet. */
export function readOutEyebrowWords(groupName: string, weekNumber: number): string {
  return `${groupName} · Week ${weekNumber} · ${REFLECTIONS}`;
}

/**
 * The page's heading: "Reflections before tonight" on the session's day from
 * 5pm, "Reflections before today’s session" earlier, "Reflections before Tue
 * 24 Nov" ahead of it, and "Week 3 reflections" for a week whose session is
 * over.
 */
export function readOutTitleWords(when: { kind: "tonight" } | { kind: "today" } | { kind: "day"; day: string } | { kind: "week"; weekNumber: number }): string {
  switch (when.kind) {
    case "tonight":
      return "Reflections before tonight";
    case "today":
      return "Reflections before today’s session";
    case "day":
      return `Reflections before ${when.day}`;
    case "week":
      return `Week ${when.weekNumber} reflections`;
  }
}

export const PROMPT = "Prompt";

/**
 * A prompt as the picker names it: "Part 1: Why alignment might be hard", and
 * "Part 1: Start with what you think (1 of 2)" where a part asks more than one.
 */
export function promptOptionWords(partNumber: number, partTitle: string, index: number, count: number): string {
  const title = partTitle.trim();
  const base = title ? `Part ${partNumber}: ${title}` : `Part ${partNumber}`;
  return count > 1 ? `${base} (${index + 1} of ${count})` : base;
}

/** "6 of 7 wrote one · Kofi hasn’t", "5 of 7 wrote one · Kofi and Farah haven’t", "7 of 7 wrote one". */
export function wroteWords(wrote: number, of: number, notYet: readonly string[]): string {
  const head = `${wrote} of ${of} wrote one`;
  if (notYet.length === 0) return head;
  return `${head} · ${listWords([...notYet])} ${notYet.length === 1 ? "hasn’t" : "haven’t"}`;
}

/** Over one answer, in place of a name: "Reflection 2", its place on the page and nothing else. */
export function reflectionPlaceWords(position: number): string {
  return `Reflection ${position}`;
}

export const READ_THIS_OUT = "Read this out";

/** The read-out button's name for a screen reader: "Read this out: reflection 2 of 6". Never a name. */
export function readThisOutLabelWords(position: number, of: number): string {
  return `${READ_THIS_OUT}: reflection ${position} of ${of}`;
}

/** The panel of picked lines: "To read out tonight", or "To read out" on another day. */
export function toReadOutWords(tonight: boolean): string {
  return tonight ? "To read out tonight" : "To read out";
}

export const PICK_LINES = "Pick lines that don’t show who wrote them.";
export const NOTHING_PICKED = "Nothing picked yet.";
export const READ_WITHOUT_NAMES = "Read them out without names. Fellows can’t see each other’s reflections.";
export const COPY_FOR_THE_SESSION = "Copy for the session";
export const COPIED = "Copied.";
export const COPY_FAILED = "Couldn’t copy. Select the lines above and copy them instead.";
export const NOBODY_WROTE = "Nobody has written one yet.";
export const NO_REFLECTIONS = "This week has no reflections.";

/** "PART 1" over a picked line, set in capitals by the stylesheet. */
export function pickedFromWords(partNumber: number): string {
  return `Part ${partNumber}`;
}

/**
 * What "Copy for the session" puts on the clipboard: each picked line under
 * the part it answers, in quotation marks, and nothing about who wrote it.
 */
export function copyForSessionText(picks: ReadonlyArray<{ partNumber: number; text: string }>): string {
  return picks.map((pick) => `${pickedFromWords(pick.partNumber)}\n“${pick.text}”`).join("\n\n");
}

/** The lead's and admins' own section: a facilitator's reflections, under their name, never read out. */
export const FACILITATORS_OWN = "Facilitators’ own reflections";

/** Who reads a facilitator's own reflections, to the lead ("you") and to an admin (the lead by name). */
export function facilitatorsOwnLine(lead: { firstName: string; isReader: boolean } | null): string {
  if (lead?.isReader) return "Only you and admins read these. They’re never read out.";
  const name = lead?.firstName.trim();
  return name ? `Only ${name} and admins read these. They’re never read out.` : "Only admins read these. They’re never read out.";
}

/** A facilitator who has not written in a box. */
export const NOT_WRITTEN = "Not written yet.";

// ---------------------------------------------------------------------------
// Reading reflections with names (Zach, Fri 30 Oct)
// ---------------------------------------------------------------------------
// The group's facilitators, the programme's lead and admins read reflections
// with the names of whoever wrote them. Only the page to read lines out has
// none. No board draws these: listed in the build notes for the boards'
// designers to confirm.

/** The way to the page that reads a group's reflections with names, from the group page and the page to read lines out. */
export const READ_WITH_NAMES = "Read them with names";

/** The way back from it to the page where lines are picked to read out. */
export const PICK_LINES_TO_READ_OUT = "Pick lines to read out";

/**
 * Under the heading of the facilitators' page that reads reflections with
 * names: who else reads them that way, and where lines are read out from.
 */
export function namedReadersLine(groupName: string, leadFirstName: string | null): string {
  const lead = leadFirstName?.trim();
  const who = lead ? `${groupName}’s facilitators, ${lead} and admins` : `${groupName}’s facilitators and admins`;
  return `${who} read reflections with names. Fellows can’t see each other’s. To read a line out in the session, pick it on the page without names.`;
}

/** When a reflection was last written: "Sun 15 Nov, 4:12pm". */
export function lastWrittenWords(at: Date): string {
  return dayAndClockWords(at);
}

// ---------------------------------------------------------------------------
// The lead's pages
// ---------------------------------------------------------------------------

/** The lead's page for one group's week: "Group B’s week". */
export function groupWeekTitleWords(groupName: string): string {
  return `${groupName}’s week`;
}

/** The Attendance tab's card: a line per group, its week, and the way in. */
export const GROUPS_WEEKS = "Each group’s week";
export const SEE_IT = "See it";

/** "Week 3": the week a group is getting ready for, or "No dates yet" for a group with no sessions to date. */
export function groupWeekLineWords(weekNumber: number | null): string {
  return weekNumber === null ? "No dates yet" : `Week ${weekNumber}`;
}

/** The way back from the lead's pages. */
export const ATTENDANCE = "Attendance";

/** The lead's pages, on a run with no group yet. */
export function noGroupsWords(programmeName: string): string {
  return `${programmeName} has no groups yet, so there’s no group’s week to show.`;
}

/** The lead's page for a group whose week is not written as blocks, or which has no dates. */
export const NO_WEEK_TO_SHOW = "This group’s week has no reflections or sources to show here.";

/** "A, B and C", "A and B", "A". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The head of This week's work's column for where each person's week stands: "Week 3". */
export function weekColumnWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}
