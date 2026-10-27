import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import {
  KAIROS_CHOICES_COLLECTION,
  normalizeKairosChoice,
  sharesWithKairos,
  type KairosChoiceDoc,
  type KairosVia,
} from "./model";

/**
 * THE KAIROS CHOICE'S ONE READER AND ONE WRITER (`./model.ts` says what the
 * record is). Every page and route that needs to know whether somebody's
 * details go to Kairos asks `kairosChoicesOf`, and every change goes through
 * `writeKairosChoice`, so the form, the profile, the Kairos file and the
 * Kairos report cannot read the default two ways.
 *
 * Who may ask is the caller's business: the answer page asks for the person
 * whose page it is, the profile for the person signed in, the Kairos file and
 * report for an admin. Every read is a document addressed by a uid the
 * caller already holds, never a query over the collection.
 */

/** Addressed reads per `getAll`. Well inside its own limits. */
const BATCH = 300;

/**
 * THE ONE READER: each stored choice of these people, by uid. A person with
 * no document is not in the map, and reads as shared (`sharesWithKairos`).
 */
export async function kairosChoicesOf(db: Firestore, uids: readonly string[]): Promise<Map<string, KairosChoiceDoc>> {
  const wanted = [...new Set(uids)].filter((uid) => uid !== "" && !uid.includes("/"));
  const out = new Map<string, KairosChoiceDoc>();
  for (let at = 0; at < wanted.length; at += BATCH) {
    const slice = wanted.slice(at, at + BATCH);
    const snaps = await db.getAll(...slice.map((uid) => db.collection(KAIROS_CHOICES_COLLECTION).doc(uid)));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const choice = normalizeKairosChoice(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
      if (choice) out.set(choice.uid, choice);
    }
  }
  return out;
}

/** Whether one person's details go to Kairos now: yes, unless they said no. */
export async function sharesWithKairosNow(db: Firestore, uid: string): Promise<boolean> {
  return sharesWithKairos((await kairosChoicesOf(db, [uid])).get(uid));
}

/**
 * THE ONE WRITER: the person's latest word, with when and where. Inside the
 * caller's transaction when it hands one over (the answers and the choice
 * are kept together, or neither is), alone otherwise.
 */
export async function writeKairosChoice(
  db: Firestore,
  input: { uid: string; shared: boolean; via: KairosVia },
  tx?: Transaction,
): Promise<void> {
  const ref = db.collection(KAIROS_CHOICES_COLLECTION).doc(input.uid);
  const data = { uid: input.uid, shared: input.shared, at: FieldValue.serverTimestamp(), via: input.via };
  if (tx) tx.set(ref, data);
  else await ref.set(data);
}

/** The person's choice goes with their account. True when there was one. */
export async function deleteKairosChoice(db: Firestore, uid: string): Promise<boolean> {
  if (!uid || uid.includes("/")) return false;
  const ref = db.collection(KAIROS_CHOICES_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}
