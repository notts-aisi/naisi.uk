import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { holdsStanding } from "@/lib/firebase/eligibility";
import { buildCalendarIcs, type IcsEvent } from "@/lib/events/ics";
import { readCalendarFeed } from "@/lib/courses/calendarFeed";
import { calendarLinkOwner } from "@/lib/courses/calendarLink";
import { isCalendarToken } from "@/lib/firestore/calendarLinks";
import { CALENDAR_NAME } from "@/lib/courses/calendarWords";
import { standingUserOf } from "@/lib/courses/programmeLead";

export const dynamic = "force-dynamic";

/**
 * A PERSON'S SESSIONS, AS A CALENDAR THEIR CALENDAR APP SUBSCRIBES TO (board
 * st-calendar-phone). The address carries their link's secret; nothing else
 * says who is asking, so there is no sign-in, and nothing is written.
 *
 * ── ONE ANSWER FOR EVERY LINK THAT OPENS NOTHING ────────────────────────────
 * A token of the wrong shape, an unknown one, a replaced one, the link of an
 * account that was deleted or no longer stands, and a live link with nothing
 * in it are all answered with the SAME empty calendar: the same status, the
 * same headers, the same bytes. Nothing tells a link that never was from one
 * that was replaced. Empty rather than a 404 because a calendar app that
 * already holds a replaced link keeps its last copy when the link stops
 * answering, and somebody replaces their link because somebody else has it:
 * an empty answer empties that copy on its next fetch.
 *
 * Our own failure (no database, a read that throws) is a 503 with a
 * Retry-After, so a calendar keeps what it had rather than emptying; it is
 * the same for every token. The log line carries the error's code and never
 * the token or the address.
 *
 * ── HEADERS FOR A CALENDAR THAT POLLS ───────────────────────────────────────
 * `private, no-store`: no shared cache may hold one person's rooms, and a
 * replaced link stops at once rather than when a cache lets go of it. The
 * file itself asks to be fetched again every hour (`REFRESH_MINUTES`).
 * `inline` with a file name, so an app reads it and a browser that opens it
 * names it. `noindex`, so an address that leaks is not listed anywhere.
 */

/** How often a subscribed calendar is asked to fetch the file again. */
const REFRESH_MINUTES = 60;

const CALENDAR_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": 'inline; filename="naisi-sessions.ics"',
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function calendar(events: IcsEvent[]): NextResponse {
  const body = buildCalendarIcs({ name: CALENDAR_NAME, refreshMinutes: REFRESH_MINUTES, events });
  return new NextResponse(body, { status: 200, headers: CALENDAR_HEADERS });
}

function unavailable(): NextResponse {
  return new NextResponse("Try again later.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "600" },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isCalendarToken(token)) return calendar([]);

  const db = getAdminDb();
  if (!db) return unavailable();

  try {
    const uid = await calendarLinkOwner(db, token);
    if (!uid) return calendar([]);
    const account = await db.collection("users").doc(uid).get();
    if (!account.exists) return calendar([]);
    const owner = standingUserOf(uid, account.data() ?? {});
    if (!holdsStanding(owner, "courseEnrolments.uid")) return calendar([]);
    const feed = await readCalendarFeed(db, owner);
    return calendar(feed.events);
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    console.error("[calendar-feed] reading a calendar failed:", typeof code === "string" || typeof code === "number" ? code : "unknown");
    return unavailable();
  }
}
