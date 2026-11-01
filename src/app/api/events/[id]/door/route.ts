import { NextResponse } from "next/server";
import { clockWords, dayWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { doorWindow, openDoor } from "@/lib/events/checkIns";
import { normalizeEvent } from "@/lib/firestore/events";

export const dynamic = "force-dynamic";

/**
 * "Open the door": `POST /api/events/<id>/door`, pressed on the event's
 * Check-in tab. Until the door is open the door list takes no tick and nobody
 * checks themselves in; adding somebody who came from the event's page works
 * either way. The body is empty.
 *
 * WHO MAY PRESS: the event's author, while they still hold an approved account
 * (`events.authorUid` in `lib/firebase/eligibility.ts`, the bar the broadcast
 * route chose), and admins. Not a collaborator, and not SU-recognised
 * committee for that alone: opening the door is the organiser's decision that
 * the evening has started. Who checks people in once it is open is unchanged
 * (`runsCheckIn`), so an author the Students' Union does not recognise opens
 * the door and still sees no name.
 *
 * AUTHORIZATION BEFORE EXISTENCE, as the broadcast route orders it: the event
 * is read first because the gate reads its author, and a caller who is
 * neither gets one indistinguishable 403 whether or not the id names an event.
 *
 * ONCE, AND ONLY IN THE DOOR'S HOURS: a published event, from an hour before
 * the start to an hour after the end (`doorWindow`). `openDoor` writes
 * `doorOpenedAt` and `doorOpenedBy` in a transaction, the only writer of the
 * two (`firestore.rules` pins them against every client), and pressing again
 * answers with the first opening. Refused during a view-as session, because
 * the opening would be recorded as the member's.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "The database is not available." }, { status: 503 });

  const { id } = await ctx.params;
  // AUTHORIZATION BEFORE EXISTENCE. The event is read first because the gate
  // reads its author; a caller who is neither its author nor an admin is
  // refused the same way whether or not the id names anything.
  const snap = /^[A-Za-z0-9_-]{1,128}$/.test(id) ? await db.collection("events").doc(id).get() : null;
  const raw = snap && snap.exists ? (snap.data() ?? {}) : null;
  const authorUid = typeof raw?.authorUid === "string" ? raw.authorUid : "";
  const mayOpen = viewer.role === "admin" || (raw !== null && isNamedWithStanding(viewer, "events.authorUid", authorUid));
  if (!mayOpen) {
    return NextResponse.json({ error: "Only the event’s author or an admin opens the door." }, { status: 403 });
  }
  if (!snap || !raw) return NextResponse.json({ error: "There is no such event." }, { status: 404 });

  const now = new Date();
  const result = await openDoor(db, snap.id, viewer.uid, now);
  if (result.kind === "gone") return NextResponse.json({ error: "There is no such event." }, { status: 404 });
  if (result.kind === "not-published") {
    return NextResponse.json({ error: "Only a published event has a door to open." }, { status: 409 });
  }
  if (result.kind === "outside") {
    const window = doorWindow(normalizeEvent(snap.id, raw));
    const error =
      result.phase === "before" && window
        ? `You can open the door from ${clockWords(window.opensAt)} on ${dayWords(window.opensAt)}, an hour before the start.`
        : result.phase === "undated" || !window
          ? "This event has no date yet, so it has no door to open."
          : `The door closed at ${clockWords(window.closesAt)}, an hour after the end.`;
    return NextResponse.json({ error }, { status: 409 });
  }
  return NextResponse.json(
    { created: result.created, openedAt: result.opening.at.toISOString() },
    { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
