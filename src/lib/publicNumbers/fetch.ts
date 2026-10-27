import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import { PUBLIC_NUMBERS_COLLECTION, blockOf, latestOf, normalizePublicNumbers, type LastTermBlockData } from "./model";

/**
 * THE PUBLIC READ PATH FOR A PROGRAMME'S "LAST TERM" BLOCK.
 *
 * `publicNumbers` is shut to every browser in `firestore.rules`, so the
 * public page reads it here, on the Admin SDK, on the server, as `/sources`
 * and `/links` read theirs. One equality on `courseId`, so it needs no
 * declared index; a course has a record for each term somebody published, a
 * handful at most, and the latest term's is the one shown (`latestOf`).
 *
 * IT PROJECTS. The page is handed `blockOf`'s fields and nothing else: no
 * id, no uid, no base, no date. The page is served to signed-out visitors, and
 * whatever reaches a component reaches the HTML.
 *
 * A failed read is no block, never a broken page: the programme's page reads
 * as it did before anything was published.
 */
export async function fetchLastTerm(courseId: string): Promise<LastTermBlockData | null> {
  if (!courseId || courseId.includes("/")) return null;
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.collection(PUBLIC_NUMBERS_COLLECTION).where("courseId", "==", courseId).get();
    const docs = snap.docs
      .map((doc) => normalizePublicNumbers(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
      .filter((doc) => doc.courseId === courseId);
    const latest = latestOf(docs);
    return latest ? blockOf(latest) : null;
  } catch {
    return null;
  }
}
