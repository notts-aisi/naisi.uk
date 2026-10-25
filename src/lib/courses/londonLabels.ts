/**
 * AN INSTANT AS THE SITE SAYS IT, in London: "Sun 22 Nov", "6pm", "7:58pm",
 * "Sun 22 Nov at 6pm", "Tue 17 Nov · 6pm · Room C20".
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
