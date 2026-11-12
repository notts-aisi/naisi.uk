/**
 * THE PLAN BEHIND `scripts/pin-met-sessions.mjs`: which weeks that met now
 * resolve to another time, and the override that puts each back. Pure: no
 * reads, no writes, no clock. The script reads the documents and writes the
 * plan; `tests/pin-met-sessions.test.mjs` runs this over stored shapes and
 * holds its dating to the site's own resolver (`resolveSessions`), so the two
 * cannot drift apart.
 *
 * WHY. A week has no stored date: every session is dated from the group's
 * standing slot plus that week's override. Changing a group's regular day by
 * hand re-dated weeks that had already met. A register that was taken keeps
 * the start its session had (`sessionAt`), so where the two disagree, the
 * register is right and the week is pinned back to it.
 *
 * WHAT A PIN IS. For each register that was taken (it exists and is finished,
 * marked, or says the session did not happen) and holds `sessionAt`, for a
 * week's first session: when the week now resolves to another start, the
 * week's override is given the weekday and the start of `sessionAt`, in
 * London time, keeping everything else the override carries. Not planned, and
 * reported instead, when the override already carries its own day or start
 * (a one-week change made through the site, which this must never undo), or
 * when `sessionAt` falls outside the week's own seven days (no override can
 * say that). Running the plan twice plans nothing the second time.
 */

const DAY_MS = 86_400_000;
const WEEK_ID = /^w\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A civil date's midnight in UTC milliseconds, or NaN. */
function dateKeyMs(key) {
  const match = DATE_KEY.exec(typeof key === "string" ? key : "");
  if (!match) return Number.NaN;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const back = new Date(ms);
  return back.getUTCFullYear() === Number(match[1]) && back.getUTCMonth() === Number(match[2]) - 1 && back.getUTCDate() === Number(match[3])
    ? ms
    : Number.NaN;
}

function keyOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The London wall clock at an instant, read as if it were UTC, in milliseconds. */
function londonWallAsUtcMs(instant) {
  const parts = Object.fromEntries(LONDON.formatToParts(instant).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

/** The instant a London wall clock names on a civil date: the site's own two-probe rule. */
export function londonWallClockToInstant(dateKey, hhmm) {
  const day = dateKeyMs(dateKey);
  const time = CLOCK.exec(hhmm ?? "");
  if (Number.isNaN(day) || !time) return null;
  const target = day + Number(time[1]) * 3_600_000 + Number(time[2]) * 60_000;
  const candidate = target - (londonWallAsUtcMs(new Date(target)) - target);
  const wall = londonWallAsUtcMs(new Date(candidate));
  return wall === target ? new Date(candidate) : new Date(target - (wall - candidate));
}

/** An instant as London reads it: its civil date, its "HH:MM" and its weekday (0 = Sunday). */
export function londonPartsOf(instant) {
  const wall = londonWallAsUtcMs(instant);
  const at = new Date(wall);
  return {
    dateKey: keyOf(wall),
    hhmm: `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`,
    weekday: at.getUTCDay(),
  };
}

/** Has this register been taken? The site's own rule (`registerIsTaken`). */
export function registerIsTaken(data) {
  if (!data || typeof data !== "object") return false;
  if (data.pushedAt !== undefined && data.pushedAt !== null) return true;
  if (typeof data.markedByUid === "string" && data.markedByUid !== "") return true;
  return data.held === false;
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return typeof value.toDate === "function" ? value.toDate() : null;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** The plan the group follows: its own when it set one (`resolveCalendar`), field by field. */
function calendarOf(run, group) {
  const paceStart = typeof group.paceStartDate === "string" && !Number.isNaN(dateKeyMs(group.paceStartDate)) ? group.paceStartDate : null;
  const pacePlan = Array.isArray(group.paceWeekPlan) ? group.paceWeekPlan : null;
  return {
    startDate: paceStart ?? run.startDate,
    weekPlan: pacePlan ?? (Array.isArray(run.weekPlan) ? run.weekPlan : []),
  };
}

/** A stored weekday as the site's normaliser reads it: a number, rounded into 0 to 6; anything else is 0. */
function asWeekday(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(6, Math.max(0, Math.round(value)));
}

/** A stored start as the normaliser reads it: "HH:MM", or "" for anything else. */
function asClock(value) {
  return typeof value === "string" && CLOCK.test(value) ? value : "";
}

function weekId(n) {
  return `w${String(n).padStart(2, "0")}`;
}

/**
 * Each taught week's first session, as the site dates it today: the week
 * number, its id, its slot's first day, its date and start, and the instant.
 * Weeks in plan order; a week number out of range or seen before is skipped,
 * as the site's resolver skips it.
 */
export function resolveWeekStarts(run, group) {
  const { startDate, weekPlan } = calendarOf(run, group);
  const start = dateKeyMs(startDate);
  const session = plainObject(group.session);
  const overrides = plainObject(group.sessionOverrides);
  const seen = new Set();
  const out = [];
  weekPlan.forEach((entry, index) => {
    if (!entry || entry.kind !== "week") return;
    const n = entry.weekNumber;
    if (!Number.isInteger(n) || n < 1 || n > 60 || seen.has(n)) return;
    seen.add(n);
    const id = weekId(n);
    const own = plainObject(overrides[id]);
    const weekday = asWeekday(own.weekday !== undefined ? own.weekday : session.weekday);
    const hhmm = asClock(own.startTimeLocal !== undefined ? own.startTimeLocal : session.startTimeLocal);
    const slotStartMs = Number.isNaN(start) ? Number.NaN : start + index * 7 * DAY_MS;
    let dateKey = "";
    if (!Number.isNaN(slotStartMs) && hhmm) {
      const slotWeekday = new Date(slotStartMs).getUTCDay();
      dateKey = keyOf(slotStartMs + ((weekday - slotWeekday + 7) % 7) * DAY_MS);
    }
    out.push({
      weekNumber: n,
      weekId: id,
      slotStartKey: Number.isNaN(slotStartMs) ? "" : keyOf(slotStartMs),
      dateKey,
      startTimeLocal: dateKey ? hhmm : "",
      startsAt: dateKey ? londonWallClockToInstant(dateKey, hhmm) : null,
    });
  });
  return out;
}

/** The week number a register's id names for its first session ("...__w03"), or null. */
function weekOfRegisterId(id) {
  const match = /__w(\d{2})$/.exec(id);
  return match ? Number(match[1]) : null;
}

/**
 * THE PLAN FOR ONE GROUP. `registers` are the group's registers as stored,
 * `{ id, data }`. Returns what to write and what to leave for a person to
 * look at, each naming the week and the two times.
 */
export function planGroupPins({ run, group, registers }) {
  const weeks = resolveWeekStarts(run, group);
  const overrides = plainObject(group.sessionOverrides);
  const pins = [];
  const skipped = [];
  for (const register of registers) {
    const data = plainObject(register.data);
    if (!registerIsTaken(data)) continue;
    if (data.occurrence !== undefined && data.occurrence !== 1) continue;
    const met = asDate(data.sessionAt);
    if (!met) continue;
    const weekNumber = Number.isInteger(data.weekNumber) ? data.weekNumber : weekOfRegisterId(register.id);
    const week = weeks.find((each) => each.weekNumber === weekNumber);
    if (!week) continue;
    if (week.startsAt && week.startsAt.getTime() === met.getTime()) continue;
    const at = londonPartsOf(met);
    const own = plainObject(overrides[week.weekId]);
    const report = { weekNumber: week.weekNumber, weekId: week.weekId, met, resolvedAt: week.startsAt };
    if (Object.hasOwn(own, "weekday") || Object.hasOwn(own, "startTimeLocal")) {
      skipped.push({ ...report, why: "the week already has its own day or start" });
      continue;
    }
    const slotStart = dateKeyMs(week.slotStartKey);
    const metDay = dateKeyMs(at.dateKey);
    if (Number.isNaN(slotStart) || metDay < slotStart || metDay > slotStart + 6 * DAY_MS) {
      skipped.push({ ...report, why: "it met outside its own week" });
      continue;
    }
    pins.push({ ...report, override: { ...own, weekday: at.weekday, startTimeLocal: at.hhmm } });
  }
  pins.sort((a, b) => a.weekNumber - b.weekNumber);
  skipped.sort((a, b) => a.weekNumber - b.weekNumber);
  return { pins, skipped };
}

/** Whether a stored override key names a week the site reads. */
export function isWeekId(id) {
  return WEEK_ID.test(id);
}
