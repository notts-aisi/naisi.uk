import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { checkInPhase, removeCheckIn } from "@/lib/events/checkIns";

export const dynamic = "force-dynamic";

/**
 * Undoes a check-in, for the people who run check-in:
 * `DELETE /api/events/<id>/check-ins/<checkInId>`.
 *
 * From the door opening until a week after the event, the same window in
 * which somebody can be added. Undoing removes the record: not coming is
 * recorded nowhere.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; checkInId: string }> }) {
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

  const { id, checkInId } = await ctx.params;
  const eventSnap = await db.collection("events").doc(id).get();
  if (!eventSnap.exists) return NextResponse.json({ error: "There is no such event." }, { status: 404 });
  const event = normalizeEvent(eventSnap.id, eventSnap.data() ?? {});
  const phase = checkInPhase(event, new Date());
  if (phase !== "door" && phase !== "later") {
    return NextResponse.json(
      { error: "Check-ins can be changed from the door opening until a week after the event." },
      { status: 409 },
    );
  }

  const removed = await removeCheckIn(db, event.id, checkInId);
  if (!removed) {
    return NextResponse.json({ error: "That check-in isn’t there any more." }, { status: 404 });
  }
  return NextResponse.json({ removed: removed.id }, { headers: { "Cache-Control": "no-store" } });
}
