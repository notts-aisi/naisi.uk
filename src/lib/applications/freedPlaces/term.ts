import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { ApplicationDoc, DecisionDoc } from "../model";
import { normaliseApplication, normaliseDecision, type ApplicationForm } from "../normalise";
import { applicationRef } from "../repo";
import { decisionRef } from "../staffRepo";

/**
 * THE WHOLE TERM, READ INSIDE THE FREED-PLACE WRITER'S TRANSACTION.
 *
 * Every sent application on the form and every decision document beside
 * them, read by id through the transaction, so that a place given, taken or
 * offered by anybody else while a press runs makes the press run again. The
 * writer counts free places over all of it, the caller's own application
 * included, and asks each person's questions of what was read here.
 *
 * It READS and nothing else: no decision is written here, or anywhere a
 * freed place is offered. It is its own module so that the only module of
 * the freed-place writer that holds a decision reference addresses the two
 * collections a decision lives beside, and nothing a browser may read.
 */
export async function readTermInTransaction(
  tx: Transaction,
  db: Firestore,
  form: ApplicationForm,
  uids: readonly string[],
): Promise<{ applications: ApplicationDoc[]; decisions: Map<string, DecisionDoc> }> {
  const roundId = form.round.id;
  const [applicationSnaps, decisionSnaps] = await Promise.all([
    tx.getAll(...uids.map((uid) => applicationRef(db, roundId, uid))),
    tx.getAll(...uids.map((uid) => decisionRef(db, roundId, uid))),
  ]);
  const applications: ApplicationDoc[] = [];
  const decisions = new Map<string, DecisionDoc>();
  uids.forEach((uid, at) => {
    const applicationSnap = applicationSnaps[at];
    const application = applicationSnap.exists
      ? normaliseApplication(applicationSnap.id, applicationSnap.data(), form.round.availabilityGrid)
      : null;
    if (application?.sent) applications.push(application);
    const decisionSnap = decisionSnaps[at];
    if (decisionSnap.exists) decisions.set(uid, normaliseDecision(decisionSnap.id, decisionSnap.data()));
  });
  return { applications, decisions };
}
