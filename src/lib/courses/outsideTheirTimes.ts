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
 * Pure, importing only the house's clock (itself pure, with no import), so a
 * page in the browser, a route and a test ask the same function.
 */
import { slotRangeWords } from "./sessionChange/words";

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
 * board and Publish both label groups with this. A person never reads it in
 * this form: a screen prints it through `sessionLabelWords`.
 */
export function sessionLabelOf(session: { weekday: number; startTimeLocal: string; durationMinutes: number }): string {
  const day = WEEKDAY_NAMES[session.weekday];
  if (!day || !session.startTimeLocal) return "";
  const end = endClock(session.startTimeLocal, session.durationMinutes);
  return `${day}s ${session.startTimeLocal}${end ? `${RANGE}${end}` : ""}`;
}

/** A label in the stored form, as `sessionLabelOf` writes it: a day, its start and, when it has a length, its end. */
const STORED_LABEL = new RegExp(
  `^(${WEEKDAY_NAMES.join("|")})s ((?:[01]\\d|2[0-3]):[0-5]\\d)(?:${RANGE}((?:[01]\\d|2[0-3]):[0-5]\\d))?$`,
);

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
}

/**
 * A stored session label as a person reads it, in the house's clock: the
 * label for Tuesdays from 18:00 to 19:30 prints "Tuesdays 6pm to 7:30pm",
 * through `slotRangeWords`, as every other weekly slot on the site does.
 *
 * FOR PRINTING ONLY. The stored label is what a chip posts, what an
 * application keeps and what `placedOutsideTheirTimes` compares, so a screen
 * keeps the label as its value and its key and draws this in its place.
 * Anything that is not a label in the stored form comes back as it is.
 */
export function sessionLabelWords(label: string): string {
  const match = STORED_LABEL.exec(label);
  if (!match) return label;
  const [, day, start, end] = match;
  // The label holds when the session ends on the wall clock, so its length
  // is the time from the start to then, past midnight if it runs there.
  const minutes = end ? (minutesOf(end) - minutesOf(start) + 1440) % 1440 || 1440 : 0;
  return slotRangeWords(WEEKDAY_NAMES.indexOf(day), start, minutes);
}

/**
 * An application's stored availability line, the labels its applicant ticked
 * as the apply route joins them (with ", "), as a person reads it: each label
 * in the house's clock, and anything else in the line as it is.
 */
export function availabilityLineWords(line: string): string {
  return line.split(", ").map(sessionLabelWords).join(", ");
}
