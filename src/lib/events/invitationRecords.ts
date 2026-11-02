import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { EVENT_AUDIENCES_COLLECTION } from "@/lib/firestore/eventAudiences";
import { EVENT_INVITATIONS_COLLECTION } from "@/lib/firestore/eventInvitations";

/**
 * TAKING AN EVENT FOR CHOSEN PEOPLE'S LIST AWAY, with what it is about.
 *
 * Apart from `./invitations.ts` on purpose: the two deletions below are called
 * by the event's delete route and by an account's deletion, and neither has
 * any business loading the invitation email to do it.
 */

/**
 * An event's choice and its whole list, for the event's own deletion. Counts
 * the people taken off. Batches of 400, under Firestore's 500.
 */
export async function deleteEventInvitations(db: Firestore, eventId: string): Promise<number> {
  const snap = await db.collection(EVENT_INVITATIONS_COLLECTION).where("eventId", "==", eventId).get();
  for (let at = 0; at < snap.docs.length; at += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  await db.collection(EVENT_AUDIENCES_COLLECTION).doc(eventId).delete();
  return snap.docs.length;
}

/**
 * Every invitation an account holds, for the account's own deletion: being on
 * an event's list says who was chosen for what, and goes with them. One
 * equality on `uid`.
 */
export async function deleteInvitationsForAccount(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(EVENT_INVITATIONS_COLLECTION).where("uid", "==", uid).get();
  for (let at = 0; at < snap.docs.length; at += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.docs.length;
}
