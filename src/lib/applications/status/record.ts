import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef, formRef } from "../repo";
import { ApplicantError } from "../applicant/store";
import { decideReply, type Reply } from "./replies";

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
 *
 * Nothing else. `result` is what decision day told this person and no reply
 * changes it. No other document is read or written: not a decision, not a
 * review, not anybody else's application. Nobody is emailed and no account
 * is changed here.
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
  reply: Reply,
  now: Date,
): Promise<Recorded> {
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

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (decision.attendance) {
      update.attendance = { answer: decision.attendance, answeredAt: FieldValue.serverTimestamp() };
    }
    if (decision.invitationResponse) {
      update["invitation.response"] = decision.invitationResponse;
      update["invitation.respondedAt"] = FieldValue.serverTimestamp();
    }
    const moved = decision.status !== application.status;
    if (moved) {
      update.status = decision.status;
      if (decision.status === "withdrawn") update.withdrawnAt = FieldValue.serverTimestamp();
    }
    tx.update(appRef, update);
    if (moved) {
      tx.update(roundRef, {
        [`applicationCounts.${application.status}`]: FieldValue.increment(-1),
        [`applicationCounts.${decision.status}`]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { changed: true, released: decision.releases, tookPlace: decision.takesPlace };
  });
}
