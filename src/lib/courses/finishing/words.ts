/**
 * THE WORDS OF WHO FINISHED, in one place: the lead's section on the
 * programme's Overview (board en-finish), the rule's card on Settings, the
 * routes' refusals, and what a member's own pages say once a programme is
 * over (C43).
 *
 * Every number and date comes in from a record; nothing here knows a term.
 * The board's own words are kept exactly, apostrophes included. Words the
 * board does not draw are in its voice, and are listed in the job's notes for
 * the boards' designers to confirm.
 *
 * NEVER A TARGET NUMBER TO A MEMBER. The rule's number appears only in the
 * sentences built for the programme's lead and admins (`ruleSentence`,
 * `ruleSlot`, the Settings card). A member is told they finished, or that the
 * programme has ended, and nothing else.
 *
 * Pure: no reads, nothing server-only.
 */

/** "A", "A and B", "A, B and C". */
export function inWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "at least 4 of 6": the board's slot, filled from the rule and the run. */
export function ruleSlot(atLeast: number, of: number): string {
  return of > 0 ? `at least ${atLeast} of ${of}` : `at least ${atLeast}`;
}

/** The board's sentence over the list, for the lead and admins only. */
export function ruleSentence(atLeast: number, of: number): string {
  return `We’ve ticked everyone who came to ${ruleSlot(atLeast, of)} sessions. Change any you disagree with. Only you and admins see this rule.`;
}

/**
 * Over the list while the run has no rule: nobody is ticked by the site.
 * "Settings" is a link to the rule's card on the programme's Settings tab, as
 * "Set who counts as finished" is before the end, so the sentence comes in its
 * three parts as well as whole.
 */
export const NO_RULE_BEFORE = "There’s no rule for who finished yet, so we haven’t ticked anybody. Set one in ";
export const NO_RULE_LINK = "Settings";
export const NO_RULE_AFTER = ", or tick people yourself. Only you and admins see this.";
export const NO_RULE_SENTENCE = `${NO_RULE_BEFORE}${NO_RULE_LINK}${NO_RULE_AFTER}`;

/** "28 finished · 3 not": upper case on the page, by its stylesheet. */
export function countsLine(finished: number, not: number): string {
  return `${finished} finished · ${not} not`;
}

/** "2 of 6". */
export function ofLine(count: number, of: number): string {
  return `${count} of ${of}`;
}

/** "week 2", "weeks 4, 5 and 6". */
function weeksWords(weeks: readonly number[]): string {
  return weeks.length === 1 ? `week ${weeks[0]}` : `weeks ${inWords(weeks.map(String))}`;
}

/**
 * The line under a person's name: the weeks they were excused, then the
 * weeks they missed, as the board writes them. One part stands alone with no
 * full stop ("Missed weeks 2, 3 and 5"); two are two sentences ("Excused in
 * week 2. Missed weeks 4, 5 and 6."). Null when there is nothing to say.
 */
export function missedLine(excused: readonly number[], missed: readonly number[]): string | null {
  const parts: string[] = [];
  if (excused.length > 0) parts.push(`Excused in ${weeksWords(excused)}`);
  if (missed.length > 0) parts.push(`Missed ${weeksWords(missed)}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return parts.map((part) => `${part}.`).join(" ");
}

/**
 * Under the list, for a group a session of which did not happen: "Group B met
 * 5 times. Its session on Tue 24 Nov was cancelled, and it doesn’t count
 * against anyone." `days` are the sessions that did not happen, as "Tue 24
 * Nov", in the order they fell.
 */
export function cancelledNote(groupName: string, met: number, days: readonly string[]): string {
  const times = met === 1 ? "once" : `${met} times`;
  const one = days.length === 1;
  return one
    ? `${groupName} met ${times}. Its session on ${days[0]} was cancelled, and it doesn’t count against anyone.`
    : `${groupName} met ${times}. Its sessions on ${inWords(days)} were cancelled, and they don’t count against anyone.`;
}

/**
 * Beside a switch the lead or an admin changed: "Changed by you" for whoever
 * is looking, the name of whoever else did it, or "Changed" once their
 * account is gone.
 */
export function changedByLine(byUid: string | null, viewerUid: string, byName: string | null): string {
  if (byUid !== null && byUid === viewerUid) return "Changed by you";
  if (byUid !== null && byName) return `Changed by ${byName}`;
  return "Changed";
}

/** "Left Fri 13 Nov", or "Left" when the day is not on record. */
export function leftLine(day: string | null): string {
  return day ? `Left ${day}` : "Left";
}

/** On the Overview before the last session is over: when who finished can be said. */
export function notYetLine(lastDay: string | null): string {
  return lastDay
    ? `You can say who finished once the last session is over, on ${lastDay}.`
    : "You can say who finished once the last session is over.";
}

/** Beside that line while the run has no rule: the way to the Settings card. */
export const SET_THE_RULE = "Set who counts as finished";

// ---------------------------------------------------------------------------
// The routes' refusals
// ---------------------------------------------------------------------------

export const NO_PROGRAMME = "That programme is not on this form.";
export const LEADS_AND_ADMINS = "Only the programme’s lead and admins can say who finished.";
export const NO_RUN = "This programme doesn’t name a course run yet, so nobody can have finished it.";
export const RUN_GONE = "The course run this programme names is no longer on the site.";

/** Before the run's last session is over. */
export function notOverYet(lastDay: string | null): string {
  return lastDay
    ? `Who finished can be said once the last session is over, on ${lastDay}.`
    : "Who finished can be said once the last session is over, and this programme’s sessions have no dates yet.";
}

/** A uid that is nobody on the lead's list. */
export const NOT_ON_THE_LIST = "That person isn’t taking part in this programme.";

/** Somebody who left: never on the list of who finished. */
export function leftTheProgramme(name: string): string {
  return `${name} left the programme, so they aren’t on the list of who finished.`;
}

/** A rule asking for more sessions than anybody can have come to. */
export function moreThanItHolds(sessions: number): string {
  return `This programme’s groups meet ${sessions} ${sessions === 1 ? "time" : "times"}, so nobody can come to more sessions than that.`;
}

// ---------------------------------------------------------------------------
// The Settings card
// ---------------------------------------------------------------------------

export const RULE_CARD_TITLE = "Who finished";
export const RULE_LABEL = "Came to at least";
export const RULE_UNIT = "sessions";

/** Under the box: what the number does, and who sees it. */
export const RULE_HINT =
  "Of the sessions their group held: a cancelled session doesn’t count against anyone. After the last session, we tick everyone who came to this many, and you can change any. Only you and admins see this.";

// ---------------------------------------------------------------------------
// A member's own pages, once the programme is over (C43)
// ---------------------------------------------------------------------------

/** The run home's heading for somebody whose record says they finished. */
export function youFinished(name: string): string {
  return `You finished ${name}.`;
}

/** The run home's heading for everybody else: the programme has ended, and nothing more. */
export function hasEnded(name: string): string {
  return `${name} has ended.`;
}

/** Under the heading for somebody who finished. */
export const FINISHED_SUB = "Every week stays open, so you can go back to any of them.";

/** Under the heading for everybody else. The board's words, then the weeks. */
export const ENDED_SUB = "Thanks for being part of it. Every week stays open, so you can go back to any of them.";

/** A run's one-word state on a card or a list, once it is over. */
export function endedWord(finished: boolean): "Finished" | "Ended" {
  return finished ? "Finished" : "Ended";
}

/** The same, inside a line: "AGI Strategy Fellowship · Group A · finished". */
export function endedPart(finished: boolean): "finished" | "ended" {
  return finished ? "finished" : "ended";
}
