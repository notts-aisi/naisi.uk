/**
 * THE WORDS OF "CAN'T MAKE IT", for one session: the button on the ticket of
 * a person's next session on their programme page, what it says once they
 * have pressed it, the route's refusals, and the line the group's register
 * shows its facilitators.
 *
 * The privacy policy's sentence (v15, Registers): "We may let you tell us in
 * advance that you can't make a session, which records you as excused." So
 * the words say it records them as excused and who sees it, and ask nothing
 * else: no reason, no message. Words a member reads never say "mark".
 *
 * Every name and day is a slot filled from a record. No dash of either kind.
 * Pure, with no import, so the ticket in the browser, the route on the server,
 * the register and the tests read the same sentences.
 */

/** The button on the ticket. */
export const CANT_MAKE_IT = "Can’t make it";

/** Its name for a screen reader: "Can’t make it on Tue 17 Nov". */
export function cantMakeItLabel(day: string): string {
  return day ? `${CANT_MAKE_IT} on ${day}` : CANT_MAKE_IT;
}

/** Once they have said so. */
export const TOLD_US =
  "You’ve told us you can’t make this session, so the register records you as excused. Your facilitators see it there.";

/** Taking it back, while the session has not started. */
export const CAN_MAKE_IT_AFTER_ALL = "I can make it after all";

/** What the press says while it is on its way. */
export const SAVING = "Saving…";

/** The route's answers, each a sentence the ticket shows as it is. */
export const CANT_MAKE_IT_REFUSAL = {
  /** Not one of this group's people, told their group: says nothing of a group they were not told about. */
  notYours: "This isn’t a session of a group you’re in.",
  /** No such session of the group, or one with no day and time. */
  noSession: "That isn’t one of your group’s sessions.",
  started: "That session has already started, so tell your facilitators yourself.",
  cancelled: "That session isn’t happening, so there’s nothing to tell.",
  finished: "That session’s register is already finished.",
  notHeld: "Your facilitators have said that session didn’t happen.",
  /** A facilitator has put them on the register already: theirs to change, not the person's. */
  marked: "Your facilitators have already filled in that session’s register for you, so tell them yourself.",
  full: "That session’s register is full. Tell your facilitators yourself.",
  failed: "That didn’t save. Try again.",
} as const;

/** What the route answers once it has saved. */
export function savedWords(cantMakeIt: boolean): string {
  return cantMakeIt ? TOLD_US : "You’ve told us you can make it after all.";
}

/**
 * The register's line for one session still to come or under way: "Tue 17
 * Nov: Kofi Asante can’t make it.", "Tue 17 Nov: Kofi Asante and Sam Okoro
 * can’t make it." Names as the register names its rows for its reader.
 */
export function registerCantMakeItLine(day: string, names: readonly string[]): string {
  const who =
    names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${day ? `${day}: ` : ""}${who} can’t make it.`;
}

/** Said to a screen reader after a cell's mark: the mark is the person's own word, given in advance. */
export const TOLD_IN_ADVANCE = "They told us in advance they can’t make it.";
