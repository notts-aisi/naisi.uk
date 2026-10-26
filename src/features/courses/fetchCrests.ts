import "server-only";
import { courseCrests } from "@/lib/crests/load";
import type { HoldsCrest } from "@/lib/crests/resolve";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THE COURSES BEHIND A PAGE'S PROGRAMMES, AS THE CREST RESOLVER TAKES THEM,
 * for a Server Component on a page any visitor can load (/courses, the
 * incubator's page).
 *
 * Only what `src/lib/crests/load.ts` reads, by course id; which crest is
 * shown is `src/lib/crests/resolve.ts`'s to say. It cannot fail: with no
 * database, or a read that does not come back, every course reads as one
 * with no crest, so each programme shows its own crest or the NAISI emblem
 * and the page still draws. The failure is logged, never shown.
 */
export async function fetchCourseCrests(
  courseIds: Iterable<string | null | undefined>,
): Promise<Map<string, HoldsCrest>> {
  const db = getAdminDb();
  if (!db) return new Map();
  try {
    return await courseCrests(db, courseIds);
  } catch (err) {
    console.error("[crests] fetchCourseCrests failed, drawing each programme without its course's crest", err);
    return new Map();
  }
}
