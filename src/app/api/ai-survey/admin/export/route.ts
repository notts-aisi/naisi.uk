import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/session";
import { exportAnswers, surveyAdminFor } from "@/lib/aiSurvey/adminStore";

/**
 * "DOWNLOAD THE ANSWERS (CSV)". For the allowlist alone.
 *
 * One row for each answer set, rows in a random order, no ids and no times.
 * A POST, not a GET, because each download is RECORDED (who, when, how many
 * rows) before the file is handed over, and a GET must change nothing. If the
 * record cannot be written the download is refused, so none goes unrecorded.
 *
 * The file holds individual answer sets, which carry no names. Only the
 * accounts on the survey's own list reach it.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = await surveyAdminFor(user);
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  let file: { csv: string; rows: number };
  try {
    file = await exportAnswers(admin.db, admin.state, admin.user.uid);
  } catch {
    return NextResponse.json({ error: "The download could not be recorded, so it was not made." }, { status: 503 });
  }
  return new NextResponse(file.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ai-at-nottingham-answers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
