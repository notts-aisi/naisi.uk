import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/session";
import { clearPilot, surveyAdminFor } from "@/lib/aiSurvey/adminStore";

/**
 * "CLEAR PILOT DATA": throw away the pilot answers and the pilot used-email
 * list. For the allowlist alone.
 *
 * Body `{ confirm }`. Works ONLY in the Pilot stage, and only when the body
 * carries the phrase the page asks to be typed, so it cannot be pressed by
 * accident and cannot touch a real answer: once the survey is open this route
 * refuses, whoever asks.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = await surveyAdminFor(user);
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  let confirm: unknown = null;
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object") confirm = (body as { confirm?: unknown }).confirm;
  } catch {
    confirm = null;
  }
  const result = await clearPilot(admin.db, admin.state, confirm);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "notConfirmed" ? 400 : 409 });
  return NextResponse.json({ ok: true });
}
