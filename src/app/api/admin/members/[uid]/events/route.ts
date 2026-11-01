import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { eventsOfPerson } from "@/lib/events/missedEvents";

/**
 * ONE PERSON'S EVENTS, for the Events card on an admin's page about them
 * (privacy v15, "Attendance": "Admins can see which events you signed up for
 * and whether you came."): whether they did not come to the last two events
 * they had a place at, and this academic year's events with where they stood,
 * worked out now and stored nowhere (`src/lib/events/missedEvents.ts`).
 * Nothing is listed or counted for somebody who has not agreed to privacy
 * version 15.
 *
 * An admin's alone, decided on the session before anything is read; an id
 * with no account is answered as missing. A GET, and it writes nothing.
 */

type Ctx = { params: Promise<{ uid: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (viewer.role !== "admin") {
    return NextResponse.json({ error: "Only an admin can see one person’s events." }, { status: 403 });
  }

  const { uid } = await ctx.params;
  if (!isAddressableId(uid)) return NextResponse.json({ error: "Nobody has this account." }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const view = await eventsOfPerson(db, uid, new Date());
  if (!view) return NextResponse.json({ error: "Nobody has this account." }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
