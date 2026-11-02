import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { EVENT_INVITATIONS_COLLECTION, eventInvitationId } from "@/lib/firestore/eventInvitations";
import { isForChosenPeople, mayOpen, runsEvents, type Named, type ReachFields } from "./reach";

/**
 * THE READS `mayOpen` NEEDS, for one person and one event.
 *
 * `./reach.ts` decides who may open an event for chosen people and reads
 * nothing; this asks the two things it needs to be told. Whether the person
 * was invited is one document, `eventInvitations/{eventId}__{uid}`. Whether
 * they are named on the event (its author, or a collaborator) is asked of the
 * event's own fields through `isNamedWithStanding`, so a name left on an
 * event after its account lost its standing opens nothing.
 *
 * A listed event needs neither, and nothing is read for it; nor for somebody
 * who runs events, whom `mayOpen` admits on their role.
 */

/** The fields of an event this reads. */
export type OpeningFields = ReachFields & {
  authorUid?: unknown;
  collaboratorUids?: unknown;
};

/** Whether this account is on the event's list of invited people. */
export async function invitedTo(db: Firestore, eventId: string, uid: string): Promise<boolean> {
  if (!eventId || !uid) return false;
  const snap = await db.collection(EVENT_INVITATIONS_COLLECTION).doc(eventInvitationId(eventId, uid)).get();
  return snap.exists;
}

/** Whether this person is named on the event, as its author or a collaborator, and still stands behind that bar. */
export function organises(event: OpeningFields, viewer: SessionUser): boolean {
  return (
    isNamedWithStanding(viewer, "events.authorUid", event.authorUid) ||
    isNamedWithStanding(viewer, "events.collaboratorUids", event.collaboratorUids)
  );
}

/**
 * May this person open the event? `mayOpen`, with the invitation read only
 * when it can change the answer.
 */
export async function mayOpenFor(
  db: Firestore,
  eventId: string,
  event: OpeningFields,
  viewer: SessionUser | null,
): Promise<boolean> {
  if (!isForChosenPeople(event)) return true;
  if (!viewer) return false;
  const organiser = organises(event, viewer);
  const named: Named = {
    organiser,
    invited: organiser || runsEvents(viewer) ? false : await invitedTo(db, eventId, viewer.uid),
  };
  return mayOpen(event, viewer, named);
}
