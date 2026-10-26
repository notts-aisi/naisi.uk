import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isPrintedSlug } from "@/lib/campaign/printedLinks";
import { TRACKED_LINKS_COLLECTION } from "@/lib/campaign/trackedLinkStore";
import { doorCodeWord } from "@/lib/events/doorCode";
import { TRACKED_LINK_LIMITS, normalizeTrackedLink, validateNewSlug, type TrackedLinkDoc } from "@/lib/firestore/trackedLinks";

/**
 * A SURVEY'S QR CODE AT ITS EVENT: one short link per event's survey,
 * `naisi.uk/q/<slug>`, that goes to the event's survey page
 * (`/events/<id>/survey`). Shown full screen at the end of the event and
 * downloadable as a PNG, so it is a short link like any printed one
 * (docs/tracked-links.md): permanent, never deleted, switched off rather than
 * removed, repointable in the console. Each event gets its own; a code is
 * never made for one person.
 *
 * WHICH LINK IS THE SURVEY'S CODE is not a field, as for the door code: it is
 * the `trackedLinks` record whose destination is the event's survey page,
 * found by one equality on `destination`, with exactly the fields every other
 * link has.
 *
 * MADE WITH THE SURVEY, and again by opening it should that have failed, in
 * one transaction that hands back the event's code if it has one and
 * otherwise takes the first free slug from the event's name: "VR games
 * night" is `vr-survey`, then `vr-survey-2`. Never a code that is on paper,
 * never a slug already taken.
 */

/** The campaign every survey's code is filed under in the console. */
export const SURVEY_CODE_CAMPAIGN = "Surveys";

/** The event's survey page: where its survey's code goes. */
export function surveyCodePath(eventId: string): string {
  return `/events/${eventId}/survey`;
}

/** The slugs a survey's code tries, in order. */
export function surveyCodeCandidates(title: string): string[] {
  const word = doorCodeWord(title);
  const tries = [`${word}-survey`];
  for (let n = 2; n <= 9; n += 1) tries.push(`${word}-survey-${n}`);
  return tries;
}

/** A slug nobody would pick, for an event whose every candidate is taken. */
function fallbackSlug(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "survey-";
  for (const byte of randomBytes(6)) out += alphabet[byte % alphabet.length];
  return out;
}

function earliest(docs: { id: string; data: () => Record<string, unknown> | undefined }[]): TrackedLinkDoc | null {
  const links = docs.map((doc) => normalizeTrackedLink(doc.id, doc.data() ?? {}));
  links.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.slug.localeCompare(b.slug));
  return links[0] ?? null;
}

/** The event's survey code, or null when none has been made. */
export async function findSurveyCode(db: Firestore, eventId: string): Promise<TrackedLinkDoc | null> {
  const snap = await db.collection(TRACKED_LINKS_COLLECTION).where("destination", "==", surveyCodePath(eventId)).get();
  return earliest(snap.docs);
}

/**
 * The event's survey code, made now if it has none. One transaction: the read
 * of the event's existing code and of each candidate slug come before the one
 * write, and a slug somebody took meanwhile makes the transaction run again.
 */
export async function makeSurveyCode(db: Firestore, event: { id: string; title: string }, byUid: string): Promise<TrackedLinkDoc> {
  const destination = surveyCodePath(event.id);
  const label = `${event.title.trim() || "Untitled event"}: survey code`.slice(0, TRACKED_LINK_LIMITS.label);
  const candidates = [...surveyCodeCandidates(event.title), fallbackSlug(), fallbackSlug()];
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection(TRACKED_LINKS_COLLECTION).where("destination", "==", destination));
    const found = earliest(existing.docs);
    if (found) return found;
    for (const slug of candidates) {
      if (validateNewSlug(slug) !== null || isPrintedSlug(slug)) continue;
      const ref = db.collection(TRACKED_LINKS_COLLECTION).doc(slug);
      if ((await tx.get(ref)).exists) continue;
      // Exactly the fields the console's rule allows, so an admin can change
      // this link there like any other.
      const fields = {
        slug,
        label,
        destination,
        type: "qr",
        campaign: SURVEY_CODE_CAMPAIGN,
        active: true,
        countOffsite: false,
        createdByUid: byUid,
        updatedByUid: byUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, fields);
      return normalizeTrackedLink(slug, { ...fields, createdAt: new Date(), updatedAt: new Date() });
    }
    throw new Error("Every survey code this event's name gives is taken.");
  });
}

/** Make the code, and never let a failure to make it undo what called it: opening the survey makes it again. */
export async function ensureSurveyCode(db: Firestore, event: { id: string; title: string }, byUid: string): Promise<TrackedLinkDoc | null> {
  try {
    return await makeSurveyCode(db, event, byUid);
  } catch (err) {
    console.error("[surveys] could not make an event's survey code", event.id, err);
    return null;
  }
}
