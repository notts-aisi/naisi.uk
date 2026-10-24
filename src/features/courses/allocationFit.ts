/**
 * WHAT A CARD ON THE ALLOCATION BOARD SAYS ABOUT WHEN SOMEBODY IS FREE.
 *
 * Two kinds of people sit on the board, and each told us when they are free
 * in a different way.
 *
 *  - SOMEBODY WHO APPLIED TO THE RUN ITSELF ticked the run's own sessions on
 *    its form. Their row carries those session labels, and a card says they
 *    cannot make a group when they ticked something and not that group's
 *    session. Ticking nothing is silence, and silence is not a clash.
 *  - SOMEBODY THE TERM'S APPLICATION FORM PLACED HERE painted a week on that
 *    form. Their row carries no labels. It carries `fromForm`, which the
 *    server works out when the board is read: whether they painted anything,
 *    and the ids of the groups whose WHOLE weekly session their week covers.
 *    The week itself is never sent to a browser.
 *
 * `cardFit` turns either into the same four things a card draws, so the card
 * has one way of saying it and the two kinds of person cannot come to be
 * drawn by different rules.
 *
 * SAID PLAINLY WHEN THERE IS NOTHING TO GO ON. For somebody from the form,
 * "painted nothing" and "painted a week that covers none of these sessions"
 * are different facts, and neither is silence: the first is drawn as a plain
 * line, the second as a warning. A group whose session has no time yet is
 * left out of all of it, because there is no session to make or miss.
 *
 * Pure, with no import, so the board and a test ask the same function.
 */

/** What the server says about somebody the application form placed on the run. */
export type FormPlace = {
  availability: "given" | "none-given" | "not-on-file";
  /** Each group whose whole weekly session their painted week covers. */
  canMakeGroupIds: string[];
  /** False once they have given the place back on the form. */
  holdsPlace: boolean;
};

/** The fields of a row this reads. */
export type FitRow = {
  /** Session labels ticked on the run's own form. Empty for somebody from the application form. */
  availability: string[];
  fromForm: FormPlace | null;
};

/** The fields of a column this reads. */
export type FitGroup = { id: string; sessionLabel: string };

export type CardFit = {
  /** The sessions they can make, as labels, in the board's order. Drawn as chips. */
  slots: string[];
  /** One line drawn where the chips would be, when no chip says it. Null when there is nothing to add. */
  note: string | null;
  /** True when `note` is something to act on, and not just a fact. */
  noteWarns: boolean;
  /** They are sitting in a group whose session they cannot make. */
  conflict: boolean;
  /** They gave their place back on the application form after they were put on this board. */
  gaveBack: boolean;
};

export const NO_AVAILABILITY_GIVEN = "No availability given";
export const AVAILABILITY_NOT_ON_FILE = "Availability no longer on file";
export const CAN_MAKE_NO_SESSION = "Can’t make any of these sessions";
export const GAVE_PLACE_BACK = "Gave their place back";

/**
 * `group` is the column the card sits in, or null for the unallocated pool.
 * `groups` is every column of the board, in the order they are drawn.
 */
export function cardFit(row: FitRow, group: FitGroup | null, groups: readonly FitGroup[]): CardFit {
  const inASession = group !== null && group.sessionLabel !== "";

  if (row.fromForm === null) {
    return {
      slots: row.availability,
      note: null,
      noteWarns: false,
      // They ticked something, and this group's session is not among it.
      conflict: inASession && row.availability.length > 0 && !row.availability.includes(group.sessionLabel),
      gaveBack: false,
    };
  }

  const gaveBack = !row.fromForm.holdsPlace;
  if (row.fromForm.availability !== "given") {
    return {
      slots: [],
      note: row.fromForm.availability === "none-given" ? NO_AVAILABILITY_GIVEN : AVAILABILITY_NOT_ON_FILE,
      noteWarns: false,
      // Nothing to go on is not a clash.
      conflict: false,
      gaveBack,
    };
  }

  const canMake = new Set(row.fromForm.canMakeGroupIds);
  const timed = groups.filter((each) => each.sessionLabel !== "");
  const slots: string[] = [];
  for (const each of timed) {
    if (canMake.has(each.id) && !slots.includes(each.sessionLabel)) slots.push(each.sessionLabel);
  }
  // They painted a week, there are sessions to make, and it covers none.
  const none = timed.length > 0 && slots.length === 0;
  return {
    slots,
    note: none ? CAN_MAKE_NO_SESSION : null,
    noteWarns: none,
    conflict: inASession && !canMake.has(group.id),
    gaveBack,
  };
}
