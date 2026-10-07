import { formatSiteDate } from "@/lib/datetime/siteTime";

/**
 * The small pieces of wording Home's cards share.
 *
 * No server import, so the server parts of the page and the client parts read
 * a date the same way. Every instant goes through `formatSiteDate`, which names
 * the site's zone: a session at 6pm in Nottingham says 6pm to a reader anywhere.
 */

const WALL_CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "6pm", "6:30pm", "12pm", from a 24-hour "HH:MM". Null when it is not one. */
export function clockLabel(hhmm: string): string | null {
  const m = WALL_CLOCK.exec(hhmm);
  if (!m) return null;
  const hour24 = Number(m[1]);
  const minutes = Number(m[2]);
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/** The time of an instant, in the site's zone: "6pm". */
export function instantClock(at: Date): string {
  const hhmm = formatSiteDate(at, { hour: "2-digit", minute: "2-digit" });
  return clockLabel(hhmm) ?? hhmm;
}

/** The three lines of a date tile. Capitals are the tile's stylesheet's job. */
export type TileParts = { weekday: string; day: string; month: string };

export function tilePartsOf(at: Date): TileParts {
  return {
    weekday: formatSiteDate(at, { weekday: "short" }),
    day: formatSiteDate(at, { day: "numeric" }),
    month: formatSiteDate(at, { month: "short" }),
  };
}

/**
 * A civil date ("2026-11-10") has no zone to convert from: it is read at UTC
 * midnight and written back in UTC, so it can only come out as the day it is.
 */
function civil(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function tilePartsOfDay(dateKey: string): TileParts | null {
  const at = civil(dateKey);
  if (!at) return null;
  return {
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(at),
    day: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric" }).format(at),
    month: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(at),
  };
}

/** "Tue 10 Nov". */
export function dayLabel(dateKey: string): string | null {
  const parts = tilePartsOfDay(dateKey);
  return parts ? `${parts.weekday} ${parts.day} ${parts.month}` : null;
}

/** "12 to 18 Oct", or "28 Sep to 4 Oct" across a month end. */
export function dayRange(fromKey: string, toKey: string): string | null {
  const from = tilePartsOfDay(fromKey);
  const to = tilePartsOfDay(toKey);
  if (!from || !to) return null;
  return from.month === to.month
    ? `${from.day} to ${to.day} ${to.month}`
    : `${from.day} ${from.month} to ${to.day} ${to.month}`;
}

/** The first word of a name, for "Hi Ben." */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Rahul", "Rahul and Sofia", "Rahul, Sofia and Tom". */
export function nameList(names: readonly string[]): string {
  const given = names.map((n) => firstName(n)).filter(Boolean);
  if (given.length <= 1) return given[0] ?? "";
  return `${given.slice(0, -1).join(", ")} and ${given[given.length - 1]}`;
}

/** "about 30 min", "about 1 hr 15 min". Empty when nothing is estimated. */
export function aboutMinutes(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "";
  if (total < 60) return `about ${Math.round(total)} min`;
  const hours = Math.floor(total / 60);
  const rest = Math.round(total % 60);
  return rest === 0 ? `about ${hours} hr` : `about ${hours} hr ${rest} min`;
}

/**
 * A stored address, as something safe to put behind a link, or null.
 *
 * The people who write a week's reading are trusted, but a link is the one
 * place a bad string becomes something that runs, so an address is checked
 * again where it is drawn: only one that parses as http or https is a link.
 * The week's own page makes the same check.
 */
export function safeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
