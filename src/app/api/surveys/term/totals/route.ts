import { NextResponse } from "next/server";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunSurveys } from "@/lib/surveys/repo";
import { loadTermNumbers } from "@/lib/surveys/term/load";
import { termTotalsCsv, termTotalsFilename } from "@/lib/surveys/term/totals";
import { TERM_WORDS } from "@/lib/surveys/term/words";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * "DOWNLOAD TOTALS (CSV)" on This term in numbers: the page's numbers as a
 * spreadsheet (`src/lib/surveys/term/totals.ts`), worked out again from the
 * records when it is asked for. Counts only: no name, account id, address or
 * answer's words.
 *
 *   GET  ->  the file, or 404 with a sentence when there is no term yet
 *
 * ADMINS ONLY, asked before anything is read. A view-as session's account is
 * never an admin's, so it is refused here like any other member's.
 *
 * A GET: it reads, and writes nothing. NOT A DOWNLOAD THE SITE LOGS
 * (`dataExports`): that log is for files of named people, the five the
 * privacy policy lists, and this file names nobody, as the Kairos report of
 * totals, an admin's page, is not logged either. So the page's link can be an
 * ordinary link that works before the page's script arrives.
 */
export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const now = new Date();
  const loaded = await loadTermNumbers(db, actor, now);
  if (!loaded) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });
  if (!loaded.term) return NextResponse.json({ error: TERM_WORDS.noTerm }, { status: 404 });

  return new Response(termTotalsCsv(loaded.view), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${termTotalsFilename(loaded.term.label, londonDateKey(now))}"`,
      "Cache-Control": "no-store",
    },
  });
}
