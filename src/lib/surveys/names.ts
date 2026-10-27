import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { fullNameOfUser } from "@/lib/courses/programmeLead";

/**
 * People's whole names by uid, from their accounts, for the admins' Who
 * answered tab and the export with names. Never an address. A uid with no
 * account any more is simply not in the map.
 */
export async function namesOf(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(uids.filter((uid) => uid && !uid.includes("/")))];
  const out = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 100) {
    const page = wanted.slice(i, i + 100);
    const docs = await db.getAll(...page.map((uid) => db.collection("users").doc(uid)));
    for (const doc of docs) {
      if (doc.exists) out.set(doc.id, fullNameOfUser((doc.data() ?? {}) as Record<string, unknown>));
    }
  }
  return out;
}
