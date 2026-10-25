import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { holdsStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { readCalendarFeed } from "@/lib/courses/calendarFeed";
import { calendarTargets, openCalendarLink, readCalendarLink, siteAddress } from "@/lib/courses/calendarLink";
import { REFUSAL, sessionsLine } from "@/lib/courses/calendarWords";

/**
 * THE CALLER'S OWN CALENDAR LINK (board st-calendar-phone), for the dialog
 * behind "Add to calendar".
 *
 * POST `{ action: "open" }`: the link they have, made the first time they ask
 * and the same every time after. POST `{ action: "replace" }`: a new link in
 * its place, after which the old one opens nothing. Both answer where the
 * dialog's four buttons go and its line counting the sessions, worked out from
 * the very sessions the link's calendar holds (`readCalendarFeed`), so the two
 * cannot disagree.
 *
 * Only ever the caller's own: there is no uid in the request. A POST because
 * the first ask writes the link.
 *
 * ORDER: view-as first (an admin viewing the site as somebody else is not
 * handed their secret, nor makes one in their name), then the session, then
 * the body (so every signed-in caller meets the same 400 on an empty one),
 * then the account's standing, and only then a read. A person with no group
 * Publish has told them about, and no link already, is told so and nothing is
 * made.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const action = body && typeof body === "object" ? (body as { action?: unknown }).action : undefined;
  if (action !== "open" && action !== "replace") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  if (!holdsStanding(actor, "courseEnrolments.uid")) {
    return NextResponse.json({ error: REFUSAL.standing }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  if (!siteAddress()) return NextResponse.json({ error: REFUSAL.noAddress }, { status: 503 });

  const [feed, stored] = await Promise.all([readCalendarFeed(db, actor), readCalendarLink(db, actor.uid)]);
  if (feed.groups.length === 0 && !stored) {
    return NextResponse.json({ error: REFUSAL.nothing }, { status: 404 });
  }

  const token = await openCalendarLink(db, actor.uid, { replace: action === "replace" });
  const targets = calendarTargets(token);
  if (!targets) return NextResponse.json({ error: REFUSAL.noAddress }, { status: 503 });

  return NextResponse.json({
    url: targets.url,
    apple: targets.apple,
    google: targets.google,
    outlook: targets.outlook,
    line: sessionsLine(feed.groups),
  });
}
