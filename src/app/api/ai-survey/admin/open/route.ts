import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/session";
import { openSurvey, surveyAdminFor } from "@/lib/aiSurvey/adminStore";

/**
 * "OPEN THE SURVEY": Pilot to Open. For the allowlist alone.
 *
 * Refused unless every value the survey needs is set, the real key for the
 * used-email list is there, and it is still before the closing time. OPENING
 * CLEARS PILOT DATA FIRST: the pilot answers, the pilot used-email list and
 * every pilot pass go, and the open survey starts on storage of its own. It
 * cannot be undone, and the page says so beside the button.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = await surveyAdminFor(user);
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const result = await openSurvey(admin.db, admin.state);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
