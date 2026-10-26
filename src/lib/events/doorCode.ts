import "server-only";
import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { isPrintedSlug } from "@/lib/campaign/printedLinks";
import { TRACKED_LINKS_COLLECTION } from "@/lib/campaign/trackedLinkStore";
import {
  TRACKED_LINK_LIMITS,
  normalizeTrackedLink,
  validateNewSlug,
  type TrackedLinkDoc,
} from "@/lib/firestore/trackedLinks";

/**
 * AN EVENT'S DOOR CODE: one short link per event, `naisi.uk/q/<slug>`, that
 * goes to the event's check-in page. It is printed on a sign at the door, so
 * it is a short link like any other (docs/tracked-links.md): permanent, never
 * deleted, switched off rather than removed, repointable in the console.
 *
 * WHICH LINK IS THE DOOR CODE is not a field: it is the `trackedLinks` record
 * whose destination is the event's check-in page, found by one equality on
 * `destination`. So the record has exactly the fields every other link has,
 * and an admin can still change it in the console, whose rule allows those
 * fields and no others. Repointing it elsewhere there makes it an ordinary
 * link, and the event can have a new door code made.
 *
 * MADE ON DEMAND, by the people who run check-in, in one transaction that
 * hands back the event's code if it has one and otherwise takes the first
 * free slug from the event's name: "VR games night" is `vr-in`, then
 * `vr-in-2`. Never a code that is on paper, never a slug already taken.
 */

/** The campaign every door code is filed under in the console. */
export const DOOR_CODE_CAMPAIGN = "Check-in";

/** What the sign and the event page say under a door code. */
export { DOOR_CODE_LINE } from "./checkInView";

/** The event's check-in page: where its door code goes. */
export function checkInPath(eventId: string): string {
  return `/events/${eventId}/check-in`;
}

/** The event id a check-in page's path names, or null. */
export function eventOfCheckInPath(destination: string): string | null {
  const match = /^\/events\/([A-Za-z0-9_-]{1,128})\/check-in$/.exec(destination);
  return match ? match[1] : null;
}

// Words that would make a door code read as nothing: every code is on naisi.uk.
const SKIP = new Set(["the", "a", "an", "naisi", "our"]);

/** The word a door code is made from: the first one of the event's name that says something. */
export function doorCodeWord(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const word = words.find((w) => !SKIP.has(w)) ?? "";
  return word.slice(0, 10) || "event";
}

/** The slugs a door code tries, in order. */
export function doorCodeCandidates(title: string): string[] {
  const word = doorCodeWord(title);
  const tries = [`${word}-in`];
  for (let n = 2; n <= 9; n += 1) tries.push(`${word}-in-${n}`);
  return tries;
}

/** A slug nobody would pick, for an event whose every candidate is taken. */
function fallbackSlug(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(6);
  let out = "in-";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/** The earliest-made link that goes to the event's check-in page, or null. */
function earliest(docs: { id: string; data: () => Record<string, unknown> | undefined }[]) {
  const links = docs.map((doc) => normalizeTrackedLink(doc.id, doc.data() ?? {}));
  links.sort(
    (a, b) =>
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.slug.localeCompare(b.slug),
  );
  return links[0] ?? null;
}

/** The event's door code, or null when nobody has made one. */
export async function findDoorCode(db: Firestore, eventId: string): Promise<TrackedLinkDoc | null> {
  const snap = await db
    .collection(TRACKED_LINKS_COLLECTION)
    .where("destination", "==", checkInPath(eventId))
    .get();
  return earliest(snap.docs);
}

export type MadeDoorCode = { made: boolean; link: TrackedLinkDoc };

/**
 * The event's door code, made now if it has none. One transaction: the read
 * of the event's existing code and of each candidate slug come before the one
 * write, and a slug somebody took meanwhile makes the transaction run again.
 */
export async function makeDoorCode(
  db: Firestore,
  event: { id: string; title: string },
  byUid: string,
): Promise<MadeDoorCode> {
  const destination = checkInPath(event.id);
  const label = `${event.title.trim() || "Untitled event"}: door code`.slice(0, TRACKED_LINK_LIMITS.label);
  const candidates = [...doorCodeCandidates(event.title), fallbackSlug(), fallbackSlug()];

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(
      db.collection(TRACKED_LINKS_COLLECTION).where("destination", "==", destination),
    );
    const found = earliest(existing.docs);
    if (found) return { made: false, link: found };

    for (const slug of candidates) {
      if (validateNewSlug(slug) !== null || isPrintedSlug(slug)) continue;
      const ref = db.collection(TRACKED_LINKS_COLLECTION).doc(slug);
      const taken = await tx.get(ref);
      if (taken.exists) continue;
      // Exactly the fields the console's rule allows, so an admin can change
      // this link there like any other.
      const fields = {
        slug,
        label,
        destination,
        type: "qr",
        campaign: DOOR_CODE_CAMPAIGN,
        active: true,
        countOffsite: false,
        createdByUid: byUid,
        updatedByUid: byUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, fields);
      return {
        made: true,
        link: normalizeTrackedLink(slug, { ...fields, createdAt: new Date(), updatedAt: new Date() }),
      };
    }
    throw new Error("Every door code this event's name gives is taken.");
  });
}
