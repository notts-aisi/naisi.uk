import "server-only";
import { randomInt } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isPrintedSlug } from "@/lib/campaign/printedLinks";
import { TRACKED_LINKS_COLLECTION } from "@/lib/campaign/trackedLinkStore";
import { runsCheckIn, type CheckInViewer } from "@/lib/events/checkInAccess";
import { doorCodeWord } from "@/lib/events/doorCode";
import type { EventSurveyDoc } from "@/lib/firestore/surveys";
import { TRACKED_LINK_LIMITS, normalizeTrackedLink, validateNewSlug, type TrackedLinkDoc } from "@/lib/firestore/trackedLinks";
import { surveyState } from "../repo";

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
 *
 * WHO SHOWS IT AT THE EVENT (`surveyCodeAtEvent`): exactly the people who
 * may draw the event's door code (`runsCheckIn`: admins and the committee
 * members the Students' Union recognises), while the survey is taking
 * answers. They show it from the event's Check-in tab, with its PNG and full
 * screen, and the QR image route asks the same function before it draws the
 * code for anybody who is not an admin. A survey its event set up shows it
 * only where its Survey after step left "Show its QR code at the end of the
 * event" on; it opens itself at the event's start (the `event-surveys` job),
 * and an admin may open any survey on its own Send tab.
 */

/** The campaign every survey's code is filed under in the console. */
export const SURVEY_CODE_CAMPAIGN = "Surveys";

/** The event's survey page: where its survey's code goes. */
export function surveyCodePath(eventId: string): string {
  return `/events/${eventId}/survey`;
}

/** The event a survey's code goes to, from a link's destination, or null for any other link. */
export function eventOfSurveyCodePath(destination: string): string | null {
  const match = /^\/events\/([A-Za-z0-9_-]{1,128})\/survey$/.exec(destination);
  return match ? match[1] : null;
}

/**
 * What the people who may show an event's survey code at the event are shown
 * of it: the code (`"show"`) while the survey takes answers, a line that it
 * shows once the survey opens (`"not-yet"`) while it is a draft, and nothing
 * (`null`) once it has closed, before there is a survey, where its event's
 * step switched the code off, or to anybody who does not run check-in.
 */
export function surveyCodeAtEvent(
  viewer: CheckInViewer | null | undefined,
  survey: Pick<EventSurveyDoc, "kind" | "firstSentAt" | "closedAt" | "closesAt" | "auto"> | null,
  now: Date,
): "show" | "not-yet" | null {
  if (!survey || !runsCheckIn(viewer)) return null;
  if (survey.auto && !survey.auto.showCode) return null;
  const state = surveyState(survey, now);
  if (state === "open") return "show";
  return state === "draft" ? "not-yet" : null;
}

/** The slugs a survey's code tries, in order. */
export function surveyCodeCandidates(title: string): string[] {
  const word = doorCodeWord(title);
  const tries = [`${word}-survey`];
  for (let n = 2; n <= 9; n += 1) tries.push(`${word}-survey-${n}`);
  return tries;
}

/**
 * A slug nobody would pick, for an event whose every candidate is taken. Each
 * character is drawn evenly from the alphabet by `randomInt`, never by a
 * remainder of a random byte, so no character is likelier than another
 * whatever the alphabet's length.
 */
function fallbackSlug(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "survey-";
  for (let i = 0; i < 6; i += 1) out += alphabet[randomInt(alphabet.length)];
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
