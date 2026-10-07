import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isInTerm } from "../decisions";
import type { ApplicationDoc } from "../model";
import { normaliseApplication } from "../normalise";
import { applicationRef } from "../repo";

/**
 * ACCEPTING SOMEBODY APPROVES AN ACCOUNT THAT IS STILL WAITING.
 *
 * A person can apply before their join request has been looked at. If a
 * programme then accepts them, there is nothing left to look at: the same
 * committee has just said yes to them. So an acceptance approves the account,
 * and this is the one function that does it.
 *
 * ## It makes the same change the Approvals tab makes
 *
 * On `users/{uid}`: `role` becomes `member`, `approvedAt` is the server's
 * clock, `approvedBy` is an admin's uid, and `rejectedAt` and `rejectedBy`
 * are removed. Nothing else on the account is touched, and no email is sent
 * from here.
 *
 * ## What it will not do, whoever calls it
 *
 * It changes a role, so every condition is read and checked INSIDE the
 * transaction that writes, on the documents as they are at that moment:
 *
 *  - ONLY A WAITING ACCOUNT IS APPROVED. `pending` becomes `member`. A member,
 *    a committee member, an admin and a refused account are each left exactly
 *    as they are and reported, so this can never demote anybody, never undo a
 *    refusal, and is safe to call twice.
 *  - ONLY ON AN ACCEPTANCE. The person's own application on the named form
 *    has to show one ({@link holdsAcceptance}): a place they were told they
 *    have and have not given up, or an invitation they have accepted. So this
 *    is not a way to approve an arbitrary account.
 *  - ONLY IN AN ADMIN'S NAME. `approvedByUid` has to be an account that is an
 *    admin right now. Approving a member is an admin's act, and a record
 *    saying a lead or a reviewer approved somebody would be a record of
 *    something that cannot happen.
 *
 * ## Who calls it
 *
 * The decision-day send, for each person it tells they are in, naming the
 * admin who pressed Send. And the route an invited person accepts through
 * (by way of `./afterReply.ts`), naming the admin who sent the decisions
 * (`decisionsSentByUid` on the form).
 * It reads no review and no decision document, so it is safe to import from
 * a route that serves an applicant.
 */

export type ApproveRequest = {
  /** Whose account. */
  uid: string;
  /** The application form their acceptance is on. */
  roundId: string;
  /** The admin in whose name the account is approved. */
  approvedByUid: string;
};

export type ApproveOutcome =
  /** The account was waiting, and is now a member's. */
  | { approved: true }
  /** Not waiting, so left exactly as it is. `role` is what it holds. */
  | { approved: false; why: "not-waiting"; role: string }
  /** There is no account document for that uid. */
  | { approved: false; why: "no-account" }
  /** Their application on that form does not show an acceptance. */
  | { approved: false; why: "not-accepted" }
  /** `approvedByUid` is not an admin, so nothing is approved in their name. */
  | { approved: false; why: "approver-not-admin" };

type Accepted = Pick<ApplicationDoc, "sent" | "status" | "result" | "invitation" | "attendance">;

/**
 * Does this application show that its owner has been accepted this term?
 *
 * Either decision day told them they have a place and they have not since
 * said they cannot take it, or they were invited and have accepted. A
 * withdrawn application shows nothing.
 */
export function holdsAcceptance(application: Accepted | null): boolean {
  // Sent, and not taken out since: the contract's one rule for who is in the term.
  if (!application || !isInTerm(application)) return false;
  const { result } = application;
  if (!result) return false;
  if (result.kind === "accepted") return application.attendance?.answer !== "cant-make-it";
  if (result.kind === "invited") return application.invitation?.response === "accepted";
  return false;
}

export async function approveWaitingAccount(
  db: Firestore,
  request: ApproveRequest,
): Promise<ApproveOutcome> {
  const { uid, roundId, approvedByUid } = request;
  // An empty id would address a collection, not a document.
  if (!uid || !roundId || !approvedByUid) return { approved: false, why: "no-account" };

  const account = db.collection("users").doc(uid);
  const approver = db.collection("users").doc(approvedByUid);
  return db.runTransaction<ApproveOutcome>(async (tx) => {
    const [approverSnap, accountSnap, applicationSnap] = await Promise.all([
      tx.get(approver),
      tx.get(account),
      tx.get(applicationRef(db, roundId, uid)),
    ]);

    if (!approverSnap.exists || approverSnap.data()?.role !== "admin") {
      return { approved: false, why: "approver-not-admin" };
    }
    if (!accountSnap.exists) return { approved: false, why: "no-account" };
    const role: unknown = accountSnap.data()?.role;
    if (role !== "pending") {
      return { approved: false, why: "not-waiting", role: typeof role === "string" ? role : "" };
    }
    const application = applicationSnap.exists
      ? normaliseApplication(applicationSnap.id, applicationSnap.data())
      : null;
    // The application has to be theirs and on this form, as well as say yes.
    if (!application || application.uid !== uid || application.roundId !== roundId) {
      return { approved: false, why: "not-accepted" };
    }
    if (!holdsAcceptance(application)) return { approved: false, why: "not-accepted" };

    tx.update(account, {
      role: "member",
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: approvedByUid,
      rejectedAt: FieldValue.delete(),
      rejectedBy: FieldValue.delete(),
    });
    return { approved: true };
  });
}
