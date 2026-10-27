/**
 * AN INSTANT AS THE SITE SAYS IT, in London: "Sun 22 Nov", "6pm", "7:58pm",
 * "Sun 22 Nov at 6pm", "Tue 17 Nov · 6pm · Room C20", and one session of a
 * group from its date and wall clock: "Tue 10 Nov, 6pm to 8pm".
 *
 * No imports, so a page can format a time the same way the server words a
 * schedule (the register's "Saved 7:58pm" and its "Next week's email goes to
 * Group B on Sun 22 Nov at 6pm" read alike). `Intl` with the zone named,
 * never the machine's own clock: a server runs in UTC, and an unqualified
 * format would be an hour out for half the year.
 */

const COURSE_TZ = "Europe/London";

const DAY_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: COURSE_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const CLOCK_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: COURSE_TZ,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Sun 22 Nov", the house date, read in London. */
export function londonDayLabel(at: Date): string {
  const parts = DAY_PARTS.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/**
 * "6pm", "7:58pm", "12pm", "12:30am": the house clock, read in London. The
 * minutes are left out on the hour, and there is no space before am or pm.
 */
export function londonClockLabel(at: Date): string {
  const parts = CLOCK_PARTS.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === "00" ? `${twelve}${suffix}` : `${twelve}:${minute}${suffix}`;
}

/** "Sun 22 Nov at 6pm". */
export function londonDayAndClock(at: Date): string {
  return `${londonDayLabel(at)} at ${londonClockLabel(at)}`;
}

/** Index = `GroupSession.weekday` (`Date.getDay()`, 0 = Sunday). */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const WALL_CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "6pm", "7:30pm", "12am" for a stored "HH:MM" wall clock. Null for anything that is not one. */
function wallClockLabel(clock: string): string | null {
  const match = WALL_CLOCK.exec(clock);
  if (!match) return null;
  const hour = Number(match[1]);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return match[2] === "00" ? `${twelve}${suffix}` : `${twelve}:${match[2]}${suffix}`;
}

/** The wall clock `minutes` after "HH:MM", round midnight. Null without a usable start or length. */
function wallClockAfter(clock: string, minutes: number): string | null {
  const match = WALL_CLOCK.exec(clock);
  if (!match || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = (Number(match[1]) * 60 + Number(match[2]) + Math.floor(minutes)) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * ONE SESSION OF A GROUP, AS THE SITE WRITES IT: "Tue 10 Nov, 6pm to 8pm".
 * A date, a comma and the hours it runs between: the placement email's first
 * session ("Tue 3 Nov, 6pm") with its end added, and no dash of either kind.
 * The weekly email's `{sessionWhen}` and the session card on a programme's
 * page both say a session this way, so a person never meets two spellings of
 * one evening.
 *
 * `dateKey` is the civil date the session falls on ("YYYY-MM-DD"). Without a
 * usable one it is the weekly habit instead: "Tuesdays, 6pm to 8pm". The
 * shape stays a day, a comma and a time either way, so wording saved around
 * the token in Email designs ("Your group meets {sessionWhen}.") still reads
 * as a sentence. "" when the session has no time of day: nothing is said
 * rather than half of it.
 */
export function sessionWhenLabel(
  session: { weekday: number; startTimeLocal: string; durationMinutes: number },
  dateKey?: string | null,
): string {
  const start = wallClockLabel(session.startTimeLocal);
  if (!start) return "";
  const endsAt = wallClockAfter(session.startTimeLocal, session.durationMinutes);
  const end = endsAt ? wallClockLabel(endsAt) : null;
  const hours = end ? `${start} to ${end}` : start;
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    // Noon UTC: no London offset can move the civil date this names.
    const at = new Date(`${dateKey}T12:00:00Z`);
    if (!Number.isNaN(at.getTime())) return `${londonDayLabel(at)}, ${hours}`;
  }
  const day = WEEKDAYS[session.weekday];
  return day ? `${day}s, ${hours}` : hours;
}

/**
 * "Tue 17 Nov · 6pm · Room C20", the line the board draws over a register.
 * The room is left off when there is none to print, rather than leaving a
 * dangling separator.
 */
export function sessionLine(startsAt: Date, room: string): string {
  const parts = [londonDayLabel(startsAt), londonClockLabel(startsAt)];
  const where = room.trim();
  if (where) parts.push(where);
  return parts.join(" · ");
}
