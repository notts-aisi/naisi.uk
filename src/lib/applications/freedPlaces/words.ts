import {
  decodeMask,
  isUsableGrid,
  minutesFromTimeLocal,
  type AvailabilityGrid,
  type AvailabilityMask,
} from "@/lib/admissions/availability";
import { formatRoundDate } from "@/lib/admissions/window";
import { COURSE_TZ, daysBetween, londonDateKey } from "@/lib/courses/weekPlan";
import { placeNextWords, type DecisionEmail } from "../decisionDay/emailCopy";
import type { ProgrammeKind } from "../model";
import { clockLabel } from "../review/availabilityView";
import type { OfferReport } from "./views";

/**
 * THE WORDS OF A FREED PLACE: the email that offers one, and the slots the
 * page fills, every one from a record.
 *
 * The email is the board's ("A place has come up on AGI Strategy"), and it
 * names when the group meets, so it goes out WHOLE OR NOT AT ALL:
 * {@link composeFreedPlaceEmail} answers null when any slot it cannot do
 * without is empty, and nothing that answers null is sent. "You told us
 * you’re free on Wednesday afternoons." is the one sentence that can go: it
 * is said from the person's own painted week, and only when that week says
 * it ({@link freeOnInTheirWeek}). It never carries the group's name, its
 * room or a meeting link: "Once you accept, we’ll email you your group and
 * room", and Publish is what does.
 *
 * Pure, with no server import: the page composes its preview with the same
 * function the send composes the email with, so what the admin reads and what
 * arrives are one text.
 */

// ---------------------------------------------------------------------------
// Days and times
// ---------------------------------------------------------------------------

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, as the week is read. A painted week is indexed from Sunday. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WORKING_WEEK = "1,2,3,4,5";

/** The three parts of a day a time falls in, by the London wall clock. */
const PARTS = [
  { one: "morning", many: "mornings", from: 0, to: 12 * 60 },
  { one: "afternoon", many: "afternoons", from: 12 * 60, to: 17 * 60 },
  { one: "evening", many: "evenings", from: 17 * 60, to: 24 * 60 },
] as const;

function partOf(minute: number) {
  return PARTS.find((part) => minute >= part.from && minute < part.to) ?? PARTS[2];
}

const isWeekday = (day: number) => Number.isInteger(day) && day >= 0 && day <= 6;

/** "A", "A and B", "A, B and C". */
export function listInWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A group's weekly session, as much of it as its words need. */
export type SlotSession = { weekday: number; startTimeLocal: string };

/** "Wednesdays at 1pm": when a group meets, every week. Null for a slot with no day or time. */
export function meetsWords(session: SlotSession): string | null {
  const minute = minutesFromTimeLocal(session.startTimeLocal);
  if (minute === null || !isWeekday(session.weekday)) return null;
  return `${WEEKDAY[session.weekday]}s at ${clockLabel(minute)}`;
}


/**
 * The day somebody was told "No offer this time", as the email says it: the
 * day's name within the week after ("On Monday"), and the date from then on,
 * when a day's name alone could mean two days ("On Mon 26 Oct").
 */
export function toldOnWords(toldAt: Date, now: Date): string {
  const days = daysBetween(londonDateKey(toldAt), londonDateKey(now));
  if (days >= 1 && days <= 6) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: COURSE_TZ, weekday: "long" }).format(toldAt);
  }
  return formatRoundDate(toldAt);
}

/** How long a part of a day has to be painted to be called free then. */
const FREE_FOR_MINUTES = 60;

/**
 * The grid a painted week was drawn on: its own, or the form's for a week
 * stored before weeks carried their own. Null when neither can be read.
 */
function gridOf(mask: AvailabilityMask, fallback: AvailabilityGrid): AvailabilityGrid | null {
  const own: AvailabilityGrid = {
    version: mask.version,
    startMinute: mask.startMinute,
    endMinute: mask.endMinute,
    slotMinutes: mask.slotMinutes,
  };
  const grid = isUsableGrid(own) ? own : fallback;
  return isUsableGrid(grid) ? grid : null;
}

/** How many minutes of one part of a day one day's painted slots cover. */
function paintedMinutesIn(column: readonly boolean[], grid: AvailabilityGrid, part: (typeof PARTS)[number]): number {
  let minutes = 0;
  column.forEach((painted, at) => {
    if (!painted) return;
    const start = grid.startMinute + at * grid.slotMinutes;
    const end = start + grid.slotMinutes;
    minutes += Math.max(0, Math.min(end, part.to) - Math.max(start, part.from));
  });
  return minutes;
}

/**
 * WHEN SOMEBODY IS FREE, IN A FEW WORDS: "Free Wed afternoons", "Free Mon and
 * Thu evenings", "Free every evening", "Free weekday mornings". A part of a
 * day counts when they painted at least an hour of it. Null when nothing
 * does, and for a week painted on a grid that cannot be read: the fit chips
 * say the rest. Read against the grid the week was drawn on.
 */
export function freeInWords(mask: AvailabilityMask, fallback: AvailabilityGrid): string | null {
  const grid = gridOf(mask, fallback);
  if (!grid) return null;
  const columns = decodeMask(mask.days, grid);
  const phrases: string[] = [];
  for (const part of PARTS) {
    const days: number[] = [];
    for (const day of WEEK_ORDER) {
      if (paintedMinutesIn(columns[day] ?? [], grid, part) >= FREE_FOR_MINUTES) days.push(day);
    }
    if (days.length === 0) continue;
    if (days.length === 7) phrases.push(`every ${part.one}`);
    else if (days.join(",") === WORKING_WEEK) phrases.push(`weekday ${part.many}`);
    else phrases.push(`${listInWords(days.map((day) => WEEKDAY_SHORT[day]))} ${part.many}`);
  }
  return phrases.length === 0 ? null : `Free ${listInWords(phrases)}`;
}

/**
 * "Wednesday afternoons": the part of the week a group's time falls in, said
 * only when the person's OWN painted week says they are free then, by the
 * rule `freeInWords` reads a week by: at least an hour painted in that part
 * of that day, read against the grid the week was drawn on. The email's "You
 * told us you’re free on ..." is this or nothing. Null when the week does not
 * say it, cannot be read, or there is none, and when the group's time is not
 * a day and a time.
 */
export function freeOnInTheirWeek(
  session: SlotSession,
  mask: AvailabilityMask | null | undefined,
  fallback: AvailabilityGrid,
): string | null {
  const minute = minutesFromTimeLocal(session.startTimeLocal);
  if (minute === null || !isWeekday(session.weekday) || !mask) return null;
  const grid = gridOf(mask, fallback);
  if (!grid) return null;
  const part = partOf(minute);
  const painted = paintedMinutesIn(decodeMask(mask.days, grid)[session.weekday] ?? [], grid, part);
  return painted >= FREE_FOR_MINUTES ? `${WEEKDAY[session.weekday]} ${part.many}` : null;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** The page's heading: "Offer 2 freed places". */
export function offerHeading(free: number): string {
  if (free <= 0) return "No freed places to offer";
  return `Offer ${free} freed ${free === 1 ? "place" : "places"}`;
}

/**
 * "Ella Robinson and Marcus Obi gave theirs back." Up to three by name; more
 * than that are counted. Null when nobody has: the places may never have been
 * filled, and the page then says only when the window closes.
 */
export function gaveBackSentence(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length <= 3) return `${listInWords(names)} gave theirs back.`;
  const others = names.length - 2;
  return `${names.slice(0, 2).join(", ")} and ${others} others gave theirs back.`;
}

/** Said in place of the list when no place is free. */
export function noFreePlaceSentence(shortName: string): string {
  return `Every place on ${shortName} is held, or kept for an invitation nobody has answered yet.`;
}

/** The list's heading: the board's. */
export function poolHeading(shortName: string): string {
  return `Pooled applicants who ranked ${shortName}`;
}

/**
 * "All of them read No offer this time on Mon 26 Oct." The send can run over
 * more than one day, and people told on different days are told "on decision
 * day" instead.
 */
export function toldSentence(days: readonly string[]): string {
  const distinct = [...new Set(days)];
  return distinct.length === 1
    ? `All of them read No offer this time on ${distinct[0]}.`
    : "All of them read No offer this time on decision day.";
}

export const NO_AVAILABILITY_GIVEN = "No availability given";

/** A fit chip: "Fits Group C". */
export function fitsWords(groupName: string): string {
  return `Fits ${groupName}`;
}

/** The chip for somebody whose painted week covers none of the run's group times. */
export function fitsNoneWords(times: number): string {
  return `Fits none of the ${times === 1 ? "1 time" : `${times} times`}`;
}

/** The send button: "Send 2 invitations". It says how many people it emails. */
export function sendLabel(people: number): string {
  return `Send ${people} ${people === 1 ? "invitation" : "invitations"}`;
}

/** The line under the button: who it emails. The board's. */
export function emailsLine(firstNames: readonly string[]): string {
  if (firstNames.length === 0) return "Pick who to offer a place to. Each is emailed once you send.";
  return `Emails ${listInWords(firstNames)}. They accept on their application page, as on decision day.`;
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/** Every slot the email fills, each from a record. */
export type FreedPlaceEmailInput = {
  /** What to call them. Falls back to "there". */
  firstName: string;
  programme: { shortName: string; kind: ProgrammeKind };
  /** The lead's first name, or "" for a programme with no lead named: it is then signed NAISI. */
  leadName: string;
  /** "Monday", or "Mon 26 Oct" ({@link toldOnWords}). */
  toldOn: string;
  /** "Wednesdays at 1pm" ({@link meetsWords}). */
  meets: string;
  /** "Wed 4 Nov": the group's next session. */
  startsOn: string;
  /**
   * "Wednesday afternoons" ({@link freeOnInTheirWeek}): when their own
   * painted week says they are free at the group's time. Null leaves "You
   * told us you’re free on ..." out, and the rest of the email goes.
   */
  freeOn: string | null;
  /** "Thu 29 Oct": the day to accept by, chosen by whoever offers it. */
  replyBy: string;
  /** The person's own application page, where both buttons lead. */
  link: string;
};

/** The sentence after when it meets, for a fellowship: the board's. */
const FELLOWSHIP_NEXT = "Once you accept, we’ll email you your group and room.";

/**
 * "A place has come up on AGI Strategy": the email that offers a freed place,
 * in the board's words. NULL WHEN ANY SLOT IT CANNOT DO WITHOUT IS EMPTY: it
 * names a time, so it goes whole or not at all, and the send refuses rather
 * than drop a sentence. The one sentence that can go is when they told us
 * they are free, which is said only when their own week says it.
 *
 * An incubator is not a group with a facilitator, and its people are never
 * told about a group: the sentence after when it meets is the incubator's own
 * (`placeNextWords`), as decision day's email says it.
 */
export function composeFreedPlaceEmail(input: FreedPlaceEmailInput): DecisionEmail | null {
  const short = input.programme.shortName.trim();
  const slots = [short, input.toldOn, input.meets, input.startsOn, input.replyBy, input.link];
  if (slots.some((slot) => slot.trim() === "")) return null;
  const next = input.programme.kind === "fellowship" ? FELLOWSHIP_NEXT : placeNextWords(input.programme.kind).email;
  const free = (input.freeOn ?? "").trim();
  const told = free ? ` You told us you’re free on ${free}.` : "";
  const lead = input.leadName.trim();
  return {
    kind: "invitation",
    subject: `A place has come up on ${short}`,
    greeting: `Hi ${input.firstName.trim() || "there"},`,
    paragraphs: [
      `On ${input.toldOn} we couldn’t offer you a place this term. Someone has given theirs back, and we’d love you to have it.`,
      `It meets on ${input.meets}, starting ${input.startsOn}.${told} ${next}`,
      `Please accept by ${input.replyBy}. If you can’t take it, just press No thanks.`,
    ],
    buttons: [
      { label: "Accept your invitation", href: input.link, look: "primary" },
      { label: "No thanks", href: input.link, look: "quiet" },
    ],
    // As decision day signs: the programme's lead, or NAISI when none is named.
    signOff: lead ? { name: lead, role: `${short} lead, NAISI` } : { name: "NAISI", role: "" },
  };
}

// ---------------------------------------------------------------------------
// What a press did
// ---------------------------------------------------------------------------

/**
 * What one press of "Send N invitations", or of the smaller press for the
 * emails still to go, did, in words that say what happened to each email.
 * Nobody whose email did not go is left out: each of them is named.
 */
export function reportWords(report: OfferReport): string {
  const parts: string[] = [];
  if (report.offered > 0) {
    parts.push(`Offered ${report.offered === 1 ? "1 place" : `${report.offered} places`}.`);
  }
  if (report.emailed > 0) parts.push(`${report.emailed === 1 ? "1 email" : `${report.emailed} emails`} went.`);
  if (report.held > 0) {
    parts.push(`${report.held} held: this copy of the site doesn’t write to ${report.held === 1 ? "that address" : "those addresses"}.`);
  }
  if (report.suppressed > 0) {
    parts.push(`${report.suppressed} not sent: on the do-not-email list.`);
  }
  if (report.failed.length > 0) parts.push(`Still to go: ${listInWords(report.failed)}.`);
  if (report.unconfirmed.length > 0) {
    parts.push(
      `Nobody can say whether the email to ${listInWords(report.unconfirmed)} went, so it won’t be sent again.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : "Nothing was sent.";
}

/** What a test did. Only one that reached the person offering counts. */
export function testWords(delivery: "sent" | "held" | "suppressed", replyByLabel: string): string {
  if (delivery === "held") {
    return "The test was held, not sent: this copy of the site doesn’t email your address. A held test doesn’t count.";
  }
  if (delivery === "suppressed") {
    return "Your address is on the do-not-email list, so the test was not sent. It doesn’t count as a test.";
  }
  return `A test went to you. Invitations accepted by ${replyByLabel} can go now.`;
}

/** The button for the emails still to go: it says how many it sends. */
export function owedLabel(emails: number): string {
  return `Send ${emails === 1 ? "the 1 email" : `the ${emails} emails`} still to go`;
}
