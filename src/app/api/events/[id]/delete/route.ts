import { NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import { canDraftEvent } from "@/lib/firestore/users";

type Ctx = RouteContext<"/api/events/[id]/delete">;

/**
 * Cascade-delete an event: its RSVPs, its Storage images, then the doc itself.
 *
 * Deletion is server-side, exactly like the task cascade and the account
 * cascade. `eventRsvps` rules lock client writes to `false`, so the attendee
 * rows cannot be removed from the client, and `events` allows no client
 * delete: a client that could delete just the doc would strand the rest. An
 * RSVP row holds an attendee's name, email and free-text answers (dietary
 * requirements among them), which must not outlive the event.
 *
 * Ordering mirrors deleteAccountCascade: the PII goes first and is FATAL on
 * failure (a surviving RSVP row is the whole point of this route), Storage is
 * best-effort (blobs are not personal data and a failure must not block the
 * teardown), and the event doc goes last so a mid-way failure leaves the event
 * visible and retryable rather than a dangling set of orphans with no parent.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const { id: eventId } = await ctx.params;

  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const eventRef = db.collection("events").doc(eventId);
  const snap = await eventRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = snap.data() ?? {};

  // Who may delete: admins always; otherwise the author, holding
  // `draftEvent`, on an event that is not published. A published event has
  // attendees who were told it exists — it gets cancelled, not deleted.
  const isAuthor = isNamedWithStanding(viewer, "events.authorUid", event.authorUid);
  const canDraft = canDraftEvent(viewer);
  const canDelete =
    viewer.role === "admin" || (canDraft && isAuthor && event.status !== "published");
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Attendee PII. FATAL on failure — this is the reason the route exists.
  let rsvpsDeleted = 0;
  try {
    const rsvps = await db.collection("eventRsvps").where("eventId", "==", eventId).get();
    // Firestore caps a WriteBatch at 500 operations; chunk rather than assume
    // an event never drew more attendees than that.
    for (let i = 0; i < rsvps.docs.length; i += 400) {
      const batch = db.batch();
      for (const d of rsvps.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
    rsvpsDeleted = rsvps.size;
  } catch (err) {
    console.error("[events/delete] RSVP delete failed:", eventId, err);
    return NextResponse.json(
      { error: "Couldn't remove this event's RSVPs; nothing else was deleted." },
      { status: 500 },
    );
  }

  // 2. Storage images. Best-effort. The prefix is derived from the event id
  //    here and never read from a stored field.
  let imagesDeleted = 0;
  let storageWarning: string | undefined;
  const storage = getAdminStorage();
  if (storage) {
    try {
      const [files] = await storage.bucket().getFiles({ prefix: `event-images/${eventId}/` });
      await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
      imagesDeleted = files.length;
    } catch (err) {
      console.error("[events/delete] image cleanup failed (best-effort):", eventId, err);
      storageWarning = "The event was deleted but its images could not be removed.";
    }
  }

  // 3. The event itself, last.
  try {
    await eventRef.delete();
  } catch (err) {
    console.error("[events/delete] event doc delete failed:", eventId, err);
    return NextResponse.json(
      { error: "The event's RSVPs were removed but the event itself could not be deleted." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    rsvpsDeleted,
    imagesDeleted,
    ...(storageWarning ? { warning: storageWarning } : {}),
  });
}
