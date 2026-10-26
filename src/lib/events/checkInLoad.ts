import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeEvent, normalizeRsvp, type EventDoc, type RsvpDoc } from "@/lib/firestore/events";
import type { EventCheckInDoc } from "@/lib/firestore/eventCheckIns";
import { loadEventCheckIns } from "./checkIns";

/**
 * One event, its sign-ups and its check-ins, read once: what the door list
 * and the Check-in tab draw from. Three reads, each one equality or one
 * document, so a phone at the door with poor signal waits for one page and
 * nothing after it.
 *
 * Callers gate first: anything built from `signups` or `checkIns` names
 * people, so it is for `runsCheckIn` only.
 */
export type EventAtTheDoor = {
  event: EventDoc;
  signups: RsvpDoc[];
  checkIns: EventCheckInDoc[];
};

export async function loadEventAtTheDoor(db: Firestore, eventId: string): Promise<EventAtTheDoor | null> {
  const snap = await db.collection("events").doc(eventId).get();
  if (!snap.exists) return null;
  const event = normalizeEvent(snap.id, snap.data() ?? {});
  const [rsvps, checkIns] = await Promise.all([
    db.collection("eventRsvps").where("eventId", "==", eventId).get(),
    loadEventCheckIns(db, eventId),
  ]);
  return {
    event,
    signups: rsvps.docs.map((doc) => normalizeRsvp(doc.id, doc.data() ?? {})),
    checkIns,
  };
}
