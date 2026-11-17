import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/session";
import { adminView, surveyAdminFor } from "@/lib/aiSurvey/adminStore";

/**
 * The numbers on the AI at Nottingham survey's admin page: the stage, how
 * many answer sets have started and finished, how many codes went out in the
 * last hour, what is still missing before it can open, and how often each
 * short link was scanned.
 *
 * FOR THE ALLOWLIST ALONE (`surveyAdminFor`): an account on the survey's own
 * list, not the admin role. Everybody else is refused before anything of the
 * survey is read.
 *
 * Totals and nothing else. Nothing here is about one person, and nothing
 * could be: nothing kept says whose an answer set is.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = await surveyAdminFor(user);
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const view = await adminView(admin.db, admin.state);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
