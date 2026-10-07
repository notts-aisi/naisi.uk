import "server-only";
import { findPublicTerm, noPublicTerm, type PublicTerm } from "@/lib/applications/lifecycle/publicTerm";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THE TERM, FOR A SERVER COMPONENT ON A PAGE ANY VISITOR CAN LOAD.
 *
 * What a visitor may be told is decided by the form's own code,
 * `findPublicTerm` in `src/lib/applications/lifecycle/publicTerm.ts`, and not
 * here. This file hands it the database and passes the answer on.
 *
 * It cannot fail. A page that is built ahead of time is built where there
 * may be no database to ask, and a page that threw there would stop the
 * build. So with no database, and with a read that does not come back, the
 * answer is the one a site with no form gets: the stage is `none`, and the
 * page draws itself without a term. The failure is logged, never shown.
 *
 * A page passes on the FIELDS a component uses, never the term itself.
 */
export async function fetchPublicTerm(now: Date = new Date()): Promise<PublicTerm> {
  const db = getAdminDb();
  if (!db) return noPublicTerm();
  try {
    return await findPublicTerm(db, now);
  } catch (err) {
    console.error("[term] fetchPublicTerm failed, drawing the page with no term", err);
    return noPublicTerm();
  }
}
