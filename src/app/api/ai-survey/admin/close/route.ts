import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/session";
import { closeSurvey, surveyAdminFor } from "@/lib/aiSurvey/adminStore";

/**
 * "CLOSE IT NOW": Open to Closed, before the closing time. For the allowlist
 * alone.
 *
 * Nobody new can start from this moment. Anybody part way through has thirty
 * minutes to save, the same thirty they get when the survey closes by itself.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = await surveyAdminFor(user);
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const result = await closeSurvey(admin.db, admin.state);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
