import "server-only";
import type { Firestore } from "firebase-admin/firestore";

/**
 * EVERY NAME AN ACCOUNT HOLDS, FOR A SCRUB.
 *
 * Words that leave the site for an outside service (a question an admin
 * types about a programme or its groups, a person's coursework) have each
 * name in them swapped for a label first, and a scrub can only swap a name it
 * knows. So this hands it every name the account holds: its display name
 * (Google's name, for an account made with Google), the name it goes by, and
 * the full name it gave. A scrub that knew only the name somebody goes by
 * would let their full name through.
 *
 * Read to be taken out of words, never to be shown: nothing that calls this
 * puts what it returns on a screen. Every caller is listed in
 * `tests/full-name-readers.test.mjs`.
 */

type Raw = Record<string, unknown>;

function record(v: unknown): Raw {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

/** Each account's names, trimmed and each once, by uid. An account that is gone is left out. */
export async function namesToScrubOf(db: Firestore, uids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return out;
  const snaps = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = record(snap.data());
    const profile = record(data.profile);
    const names = [data.displayName, profile.preferredName, profile.fullName]
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim().replace(/\s+/g, " "));
    out.set(snap.id, [...new Set(names)]);
  }
  return out;
}
