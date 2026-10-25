import "server-only";
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { AdmissionApplicationStatus } from "@/lib/firestore/admissionApplications";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { ReleaseReason } from "../model";
import { normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef, formRef } from "../repo";
import { ApplicantError } from "../applicant/store";
import { RELEASE_REASON_PROBLEMS } from "./reasons";
import { decideReply, type ReplyRequest, type ReplyWrite } from "./replies";
import { standingOf } from "./standing";

/**
 * WRITING ONE PERSON'S REPLY, in one transaction on their own document.
 *
 * The reply is decided by `decideReply` against the document AS IT IS INSIDE
 * THE TRANSACTION, so two tabs, or a reply racing decision day, cannot leave
 * the application in a state neither of them saw. A refusal throws before
 * anything is written.
 *
 * ## What is written, and where
 *
 *  - `attendance` for "I’m coming" and "I can’t make it".
 *  - `invitation.response` and `invitation.respondedAt` for an invitation
 *    accepted or turned down. The rest of the invitation is decision day's
 *    and is left exactly as it was, which is why these two are written by
 *    field path and the map is never replaced.
 *  - `status`, when the reply moves it, with `withdrawnAt` when it moves to
 *    withdrawn. The form's `applicationCounts` move in the same transaction,
 *    from the status the document had to the one it has now.
 *  - `releaseReason`, by the reply that gives a place or an invitation back,
 *    in the same write as the reply itself. A reply that gives something
 *    back with no reason is refused here too, so no caller can store one
 *    without the other. The first reason given stands: saying the same thing
 *    again writes nothing.
 *
 * Nothing else. `result` is what decision day told this person and no reply
 * changes it. No other document is read or written: not a decision, not a
 * review, not anybody else's application. Nobody is emailed and no account
 * is changed here.
 *
 * ## Leaving the programme gives the place back the same way
 *
 * Somebody who leaves the course run their programme placed them on gives
 * their place on the form back as "I can’t make it" does (`readPlaceToGiveBack`
 * and `givePlaceBack`, below): the same decision, from their own application
 * as it stands inside the transaction that takes them off the run, and the
 * same write. So every count of places and every list of the programme's
 * people says so in the same moment as the run does.
 */

export const NO_APPLICATION = "There is no application on this form under this account.";

const OLDER_FORM =
  "This application was made on an older form, so it cannot be answered here. Email ai-safety@uonsu.com and we will sort it out.";

export type Recorded = {
  /** False when the same thing had already been said: nothing was written. */
  changed: boolean;
  /** This reply gave a place or an invitation back. */
  released: boolean;
  /**
   * This reply is the one that turned an invitation into a place. Anything
   * that follows from somebody taking a place is the caller's to do, AFTER
   * this has committed and never inside the transaction.
   */
  tookPlace: boolean;
};

export async function recordReply(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
  request: ReplyRequest,
  now: Date,
): Promise<Recorded> {
  const { reply, reason } = request;
  const roundId = form.round.id;
  const appRef = applicationRef(db, roundId, uid);
  const roundRef = formRef(db, roundId);
  const today = londonDateKey(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists) throw new ApplicantError(NO_APPLICATION, 404);
    const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
    if (!application) throw new ApplicantError(OLDER_FORM, 409);

    const decision = decideReply(application, reply, today);
    if (decision.kind === "refused") throw new ApplicantError(decision.error, 409);
    if (decision.kind === "unchanged") return { changed: false, released: false, tookPlace: false };
    if (decision.releases && !reason) throw new ApplicantError(RELEASE_REASON_PROBLEMS.none, 400);

    writeReply(tx, appRef, roundRef, application.status, decision, reason);
    return { changed: true, released: decision.releases, tookPlace: decision.takesPlace };
  });
}

/**
 * The writes one decided reply makes: the application, and the form's
 * counters when its status moves. Shared by a reply and by leaving, so the
 * two can never write a place given back in two different shapes.
 */
function writeReply(
  tx: Transaction,
  appRef: DocumentReference,
  roundRef: DocumentReference,
  from: AdmissionApplicationStatus,
  decision: ReplyWrite,
  reason: ReleaseReason | null,
): void {
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  // Why, with the reply that gives the place back, and with no other reply.
  if (decision.releases && reason) update.releaseReason = { kind: reason.kind, other: reason.other };
  if (decision.attendance) {
    update.attendance = { answer: decision.attendance, answeredAt: FieldValue.serverTimestamp() };
  }
  if (decision.invitationResponse) {
    update["invitation.response"] = decision.invitationResponse;
    update["invitation.respondedAt"] = FieldValue.serverTimestamp();
  }
  const moved = decision.status !== from;
  if (moved) {
    update.status = decision.status;
    if (decision.status === "withdrawn") update.withdrawnAt = FieldValue.serverTimestamp();
  }
  tx.update(appRef, update);
  if (moved) {
    tx.update(roundRef, {
      [`applicationCounts.${from}`]: FieldValue.increment(-1),
      [`applicationCounts.${decision.status}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/** A place on the form that leaving the programme gives back, read and decided, not yet written. */
export type PlaceToGiveBack = {
  appRef: DocumentReference;
  roundRef: DocumentReference;
  from: AdmissionApplicationStatus;
  decision: ReplyWrite;
};

/**
 * THE PLACE ON THE FORM THAT LEAVING THE PROGRAMME GIVES BACK, read inside
 * the caller's transaction, before any of its writes (Firestore takes every
 * read of a transaction first), or null when there is nothing to give back.
 *
 * Only a place the person still holds ON THIS PROGRAMME is given back, and it
 * is decided exactly as "I can’t make it" is (`decideReply`). Anything else is
 * left as it stands, and leaving the run goes ahead without it: a place
 * already given back, an application withdrawn some other way, a place on
 * another programme, one this form cannot read, or no application at all.
 */
export async function readPlaceToGiveBack(
  tx: Transaction,
  db: Firestore,
  form: ApplicationForm,
  uid: string,
  programmeId: string,
  now: Date,
): Promise<PlaceToGiveBack | null> {
  const roundId = form.round.id;
  const appRef = applicationRef(db, roundId, uid);
  const roundRef = formRef(db, roundId);
  const snap = await tx.get(appRef);
  if (!snap.exists) return null;
  const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
  if (!application) return null;
  const standing = standingOf(application);
  if (standing.kind !== "place" || standing.programmeId !== programmeId) return null;
  const decision = decideReply(application, "cant-make-it", londonDateKey(now));
  if (decision.kind !== "write" || !decision.releases) return null;
  return { appRef, roundRef, from: application.status, decision };
}

/**
 * Gives the place back, in the caller's transaction: what "I can’t make it"
 * writes, and the form's counters.
 *
 * NO REASON IS WRITTEN onto the application. The reason a person gives for
 * leaving is kept with their place on the run, where the programme's lead and
 * admins read it; a reason on the application is read by everybody who reads
 * applications, reviewers included. The reply buttons still ask for one, and
 * `recordReply` still refuses a reply that gives a place back without it.
 */
export function givePlaceBack(tx: Transaction, place: PlaceToGiveBack): void {
  writeReply(tx, place.appRef, place.roundRef, place.from, place.decision, null);
}
