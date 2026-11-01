import "server-only";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { mayOpenFor } from "@/lib/events/opening";
import { REACH_WORDS, isForChosenPeople, isListed } from "@/lib/events/reach";
import { normalizeEvent, normalizeRsvp, type EventDoc } from "@/lib/firestore/events";

/**
 * Server-only fetchers for the public events pages. Runs with the admin SDK
 * so Firestore rules don't gate visibility — we filter by status ourselves.
 *
 * WHO AN EVENT IS FOR is `src/lib/events/reach.ts`'s to decide, and these are
 * the two doors the public pages read through: the list leaves out every
 * event for chosen people, and one event is handed to a page only for
 * somebody who may open it.
 */

/**
 * Every LISTED published event: /events, Home, the landing page and /links.
 * An event for chosen people is never on it, so no list can show one.
 */
export async function listPublishedEvents(): Promise<EventDoc[]> {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db
    .collection("events")
    .where("status", "==", "published")
    .limit(100)
    .get();
  const rows = snap.docs.map((d) => normalizeEvent(d.id, d.data())).filter(isListed);
  // Sort upcoming first (by startAt), then undated fall through by updatedAt desc.
  const now = Date.now();
  rows.sort((a, b) => {
    const av = a.startAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bv = b.startAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (av !== bv) return (av < now ? 1 : 0) - (bv < now ? 1 : 0) || av - bv;
    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  });
  return rows;
}

/** A published or cancelled event, whoever is asking. Not exported: see `getEventForViewer`. */
async function getPublishedEvent(id: string): Promise<EventDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  const doc = await db.collection("events").doc(id).get();
  if (!doc.exists) return null;
  const event = normalizeEvent(doc.id, doc.data() ?? {});
  if (event.status !== "published" && event.status !== "cancelled") return null;
  return event;
}

/**
 * One event, for the person asking.
 *
 *  - `open`: a published or cancelled event this person may open. Every listed
 *    one, and an event for chosen people for the people invited to it and the
 *    people who run events.
 *  - `invited-only`: an event for chosen people this person may not open. The
 *    page says so, calmly, and names nothing of it: not its title, not its
 *    day, not its place.
 *  - null: there is no published event here.
 */
export type EventForViewer =
  | { kind: "open"; event: EventDoc }
  | { kind: "invited-only"; signedIn: boolean }
  | null;

export async function getEventForViewer(id: string): Promise<EventForViewer> {
  const event = await getPublishedEvent(id);
  if (!event) return null;
  if (!isForChosenPeople(event)) return { kind: "open", event };
  const viewer = await getCurrentUser();
  const db = getAdminDb();
  if (db && viewer && (await mayOpenFor(db, event.id, event, viewer))) return { kind: "open", event };
  return { kind: "invited-only", signedIn: viewer !== null };
}

/** The place the person asking holds at an event: their own confirmed sign-up. */
export type HeldPlace = { rsvpId: string };

/**
 * WHETHER THE PERSON ASKING HOLDS A PLACE at this event: their own confirmed
 * sign-up, found by their account, which the event page offers to give back
 * ("Can't make it"). Null signed out, for anybody without one, and for a test
 * sign-up. Read by the session's own uid on this one event, so it says
 * nothing about anybody else; the cancel route checks the sign-up is theirs
 * again before it gives anything back.
 */
export async function heldPlaceAt(event: Pick<EventDoc, "id">): Promise<HeldPlace | null> {
  const viewer = await getCurrentUser();
  const db = getAdminDb();
  if (!viewer || !db) return null;
  const own = await db.collection("eventRsvps").where("eventId", "==", event.id).where("uid", "==", viewer.uid).get();
  const held = own.docs
    .map((doc) => normalizeRsvp(doc.id, doc.data() ?? {}))
    .find((row) => row.uid === viewer.uid && row.eventId === event.id && row.status === "confirmed" && !row.synthetic);
  return held ? { rsvpId: held.id } : null;
}

/**
 * What a link preview and the browser tab say about an event, read with no
 * session: crawlers have none. An event for chosen people gets a plain title
 * and nothing of its own, whoever shares its address; a listed one its title
 * and day, as always. Null: there is no published event here.
 */
export async function eventMetaFor(id: string): Promise<{ title: string; description: string; chosen: boolean } | null> {
  const event = await getPublishedEvent(id);
  if (!event) return null;
  if (isForChosenPeople(event)) {
    return { title: REACH_WORDS.plainTitle, description: REACH_WORDS.plainDescription, chosen: true };
  }
  // The day in London, by the house clock: the container's own zone is UTC.
  const day = event.startAt
    ? formatSiteDate(event.startAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "a date to be confirmed";
  return { title: event.title, description: `NAISI event on ${day}.`, chosen: false };
}

/**
 * Like getPublishedEvent but without the status filter. Callers are
 * responsible for gating access (drafters/approvers/admins only).
 */
export async function getEventForPreview(id: string): Promise<EventDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  const doc = await db.collection("events").doc(id).get();
  if (!doc.exists) return null;
  return normalizeEvent(doc.id, doc.data() ?? {});
}
