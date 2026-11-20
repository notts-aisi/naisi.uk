import { NextResponse } from "next/server";
import { toCSV } from "@/lib/csv";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { downloadRows } from "@/lib/societyFeedback/admin";

/**
 * Download: every kept entry of anonymous feedback as a CSV (docs/surveys.md,
 * "Anonymous feedback for the whole society"). Admins only.
 *
 * A GET that writes nothing. The file names nobody: the entries carry no
 * sender, and the admins' own marks go out as "Yes" and the note's words, not
 * who wrote them. Every cell passes the CSV helper's formula guard, because
 * every word in it was typed by somebody else.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can do this." }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const { header, rows } = await downloadRows(db);
  return new NextResponse(`${toCSV(header, rows)}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="anonymous-feedback.csv"',
      "Cache-Control": "no-store",
    },
  });
}
