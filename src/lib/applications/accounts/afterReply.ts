import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ApplicationForm } from "../normalise";
import { approveWaitingAccount, type ApproveOutcome } from "./approve";

/**
 * WHAT FOLLOWS FROM ACCEPTING AN INVITATION: the account, if it was waiting.
 *
 * Somebody invited on decision day has a place from the moment they accept.
 * Being accepted approves an account that is still waiting, and for
 * everybody decision day placed directly the send does that. An invitation
 * becomes an acceptance later, when its owner says yes, so their route calls
 * this once the reply has been written.
 *
 * ## The reply comes first, and stands whatever happens here
 *
 * This is called AFTER the transaction that records the reply has committed,
 * never inside it: the approval writes a second document, and a reply must
 * not wait on, or be undone by, anything about an account. So nothing here
 * throws. A refusal is an answer (`left`), and a failure to reach the
 * database is caught, logged and reported (`failed`). Either way the person
 * has accepted, their account is still listed in Approvals, and the next
 * press of Send on the form approves it.
 *
 * ## In whose name
 *
 * The admin who sent the decisions (`decisionsSentByUid`), because approving
 * a member is an admin's act and that admin is the one who said yes to
 * everybody on the form. A form that has not been stamped as sent yet names
 * nobody, so nobody is approved from here until it has.
 *
 * Every other condition is `approveWaitingAccount`'s own, read inside its
 * transaction: only a waiting account, only on an acceptance, only in the
 * name of somebody who is an admin right now. It reads no review and no
 * decision, so a route that serves an applicant may import this.
 */
export type AfterAcceptance =
  /** The account was waiting, and is now a member's. */
  | { did: "approved" }
  /** Nothing to do, or not allowed: the account is exactly as it was. */
  | { did: "left"; why: Exclude<ApproveOutcome, { approved: true }>["why"] | "decisions-not-sent" }
  /** The approval could not be attempted or finished. The reply stands. */
  | { did: "failed" };

export async function approveAfterAcceptedInvitation(
  db: Firestore,
  form: Pick<ApplicationForm, "round" | "decisionsSentByUid">,
  uid: string,
): Promise<AfterAcceptance> {
  const approvedByUid = form.decisionsSentByUid;
  if (!approvedByUid) return { did: "left", why: "decisions-not-sent" };
  try {
    const outcome = await approveWaitingAccount(db, { uid, roundId: form.round.id, approvedByUid });
    return outcome.approved ? { did: "approved" } : { did: "left", why: outcome.why };
  } catch (err) {
    console.error("[applications] approving an account after an accepted invitation failed", form.round.id, err);
    return { did: "failed" };
  }
}
