import "server-only";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";

/**
 * Reading the few things these two screens need from people's own accounts:
 * what a lead or a reviewer is called, and whether an accepted applicant's
 * account is still waiting to be approved.
 *
 * Staff only. Both callers have already been gated to admins.
 */

/** `getAll` takes its references as arguments, so a long list goes in batches. */
const BATCH = 250;

async function userDocs(db: Firestore, uids: readonly string[]): Promise<DocumentSnapshot[]> {
  const distinct = [...new Set(uids.filter((uid) => uid))];
  const out: DocumentSnapshot[] = [];
  for (let at = 0; at < distinct.length; at += BATCH) {
    const refs = distinct.slice(at, at + BATCH).map((uid) => db.collection("users").doc(uid));
    out.push(...(await db.getAll(...refs)));
  }
  return out;
}

function firstNameFrom(data: Record<string, unknown>): string {
  const profile = data.profile as { preferredName?: unknown } | undefined;
  const preferred = typeof profile?.preferredName === "string" ? profile.preferredName.trim() : "";
  if (preferred) return preferred;
  const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
  return display.split(/\s+/)[0] ?? "";
}

/**
 * The first name each of these people goes by, by uid. Somebody whose account
 * has gone is simply absent, and their name reads as empty.
 */
export async function loadFirstNames(
  db: Firestore,
  uids: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const doc of await userDocs(db, uids)) {
    if (!doc.exists) continue;
    const name = firstNameFrom(doc.data() ?? {});
    if (name) names.set(doc.id, name);
  }
  return names;
}

/** How many of these people have an account that is still waiting to be approved. */
export async function countWaitingAccounts(db: Firestore, uids: readonly string[]): Promise<number> {
  let waiting = 0;
  for (const doc of await userDocs(db, uids)) {
    if (doc.exists && (doc.data() ?? {}).role === "pending") waiting += 1;
  }
  return waiting;
}
