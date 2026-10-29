/**
 * IS SOMEBODY PLACED OUTSIDE THE TIMES THEY GAVE? One answer, asked by every
 * screen and every press that has to know.
 *
 * Three places ask it, and they must never disagree about anybody:
 *
 *  - THE BOARD'S CARD, "Not free Thu 6pm" (`cardFit` in
 *    `src/features/courses/allocationFit.ts`, which People in groups and the
 *    allocation board both draw from).
 *  - PUBLISH'S READINESS CHECK, "Joel Adeyemi is in Group A on Thursdays at
 *    6pm, but said they're not free then" (`readGetReady` in
 *    `src/lib/courses/getReady/read.ts`).
 *  - PUBLISH ITSELF (`loadPublishPlan` in `src/lib/courses/allocationPublish.ts`),
 *    which waits until each such person has a note, or "Send without a note",
 *    before it tells them their group.
 *
 * `tests/course-publish-outside-notes.test.mjs` holds that all three call
 * this function and that nothing else decides it.
 *
 * ## What it reads
 *
 * Somebody the term's application form placed on the run painted a week on
 * that form; the server works out which groups' WHOLE weekly session that
 * week covers (`canMakeGroupIds`, `formPlaceFactsFor` in
 * `src/lib/applications/handover/board.ts`) and the week itself never leaves
 * the server. Somebody who applied to the run itself ticked the run's own
 * sessions, by label. So:
 *
 *  - from the form, with a week painted: outside when the group they sit in
 *    is not one their week covers. A session their week covers only in part
 *    is outside: they cannot make all of it.
 *  - from the form, with nothing painted or nothing on file: never outside.
 *    Not having said is not a clash.
 *  - applied to the run: outside when they ticked something and not this
 *    group's session. Ticking nothing is silence.
 *  - a group with no day and time yet, or no group: never outside. There is
 *    no session to miss.
 *
 * Pure, with no import, so a page in the browser, a route and a test ask the
 * same function.
 */

/** What is known about when somebody is free, as the board's row carries it. */
export type TimesGiven = {
  /** Session labels ticked on the run's own form. Empty for somebody from the application form. */
  availability: readonly string[];
  /** Set for somebody the application form placed on the run. */
  fromForm: {
    availability: "given" | "none-given" | "not-on-file";
    /** Each group whose whole weekly session their painted week covers. */
    canMakeGroupIds: readonly string[];
  } | null;
};

/** A group, as far as this needs it: its id and its session's label ("" with no day and time). */
export type TimedGroup = { id: string; sessionLabel: string };

/** True when they sit in a group whose weekly session they said they cannot make. */
export function placedOutsideTheirTimes(given: TimesGiven, group: TimedGroup | null): boolean {
  if (group === null || group.sessionLabel === "") return false;
  if (given.fromForm === null) {
    return given.availability.length > 0 && !given.availability.includes(group.sessionLabel);
  }
  if (given.fromForm.availability !== "given") return false;
  return !given.fromForm.canMakeGroupIds.includes(group.id);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The separator in a session's label. The labels people ticked on a run's
 * own form were stored with it, so it is part of the stored format, not copy:
 * a label written another way would never equal one somebody ticked.
 */
const RANGE = "–";

function endClock(start: string, minutes: number): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start);
  if (!m || minutes <= 0) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A group's weekly session as a label ("Tuesdays 18:00" then the range mark
 * and "19:30"), byte for byte the label the run's own apply page offers as a
 * chip and stores when ticked, so a row's `availability` and a group's label
 * compare equal. Empty while the group has no day and time. The allocation
 * board and Publish both label groups with this.
 */
export function sessionLabelOf(session: { weekday: number; startTimeLocal: string; durationMinutes: number }): string {
  const day = WEEKDAY_NAMES[session.weekday];
  if (!day || !session.startTimeLocal) return "";
  const end = endClock(session.startTimeLocal, session.durationMinutes);
  return `${day}s ${session.startTimeLocal}${end ? `${RANGE}${end}` : ""}`;
}
