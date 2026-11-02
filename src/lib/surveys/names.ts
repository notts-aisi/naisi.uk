import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";

/**
 * People's names by uid, from their accounts, for the admins' survey screens
 * and the export with names, as `viewer` is shown them (the names rule,
 * `nameForViewer`: the committee and admins see "Priya Shah (Pri)"). A caller
 * drawing for nobody in particular passes null and is given the name people
 * go by. Never an address. A uid with no account any more is simply not in
 * the map.
 */
export async function namesOf(db: Firestore, uids: readonly string[], viewer: NameViewer): Promise<Map<string, string>> {
  const wanted = [...new Set(uids.filter((uid) => uid && !uid.includes("/")))];
  const out = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 100) {
    const page = wanted.slice(i, i + 100);
    const docs = await db.getAll(...page.map((uid) => db.collection("users").doc(uid)));
    for (const doc of docs) {
      if (doc.exists) out.set(doc.id, nameForViewer(viewer, accountNamesOf(doc.data() ?? {}), "NAISI member"));
    }
  }
  return out;
}
