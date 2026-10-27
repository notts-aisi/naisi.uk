import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { makeDoorCode } from "@/lib/events/doorCode";

export const dynamic = "force-dynamic";

/**
 * Makes an event's door code, or hands back the one it has:
 * `POST /api/events/<id>/door-code`.
 *
 * For the people who run check-in (`runsCheckIn`). The code is a short link
 * like any printed one, so once made it is never deleted: the transaction in
 * `makeDoorCode` makes at most one per event, from a slug nobody holds.
 * Only a published event has a door, so only a published event gets a code.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!runsCheckIn(user)) {
    return NextResponse.json(
      { error: "Only admins and SU-recognised committee members run check-in." },
      { status: 403 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "The database is not available." }, { status: 503 });

  const { id } = await ctx.params;
  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "There is no such event." }, { status: 404 });
  const event = normalizeEvent(snap.id, snap.data() ?? {});
  if (event.status === "cancelled") {
    return NextResponse.json(
      { error: "This event is cancelled, so there is no door to check people in at." },
      { status: 409 },
    );
  }
  if (event.status !== "published") {
    return NextResponse.json(
      { error: "Publish the event first. A door code is for an event people can come to." },
      { status: 409 },
    );
  }

  const { made, link } = await makeDoorCode(db, { id: event.id, title: event.title }, user.uid);
  return NextResponse.json(
    { made, slug: link.slug, active: link.active },
    { status: made ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
