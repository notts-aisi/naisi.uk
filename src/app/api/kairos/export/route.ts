import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { toCSV } from "@/lib/csv";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { logExport } from "@/lib/firestore/dataExports";
import { buildKairosFile } from "@/lib/kairos/file";
import { kairosFilename } from "@/lib/kairos/fileTable";
import { loadKairosProgramme } from "@/lib/kairos/programmes";
import { KAIROS_FILE_WORDS } from "@/lib/kairos/words";

/**
 * THE KAIROS FILE FOR ONE PROGRAMME, as a spreadsheet, for admins: one row
 * per person on it at its end who has not said no to sharing with Kairos,
 * with their name, the programme, the sessions they came to, whether they
 * finished and the ratings they were given (`src/lib/kairos/file.ts`).
 * Never an email address, never who gave a rating, never a survey answer.
 *
 *   POST { roundId, programmeId }  ->  the file
 *
 * ADMINS ONLY, asked before anything is read. Once the run's last session is
 * over, since nobody has finished anything before then.
 *
 * A DOWNLOAD THE SITE LOGS (`dataExports`, kind `kairos`): every press writes
 * its row before the file is handed over, and when the row cannot be written
 * the file is refused. A POST, so a link fetched by something other than the
 * admin's own press downloads nothing.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: KAIROS_FILE_WORDS.notSignedIn }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: KAIROS_FILE_WORDS.adminOnly }, { status: 403 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { roundId?: unknown; programmeId?: unknown }) : {};
  const roundId = typeof body.roundId === "string" ? body.roundId : "";
  const programmeId = typeof body.programmeId === "string" ? body.programmeId : "";
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: KAIROS_FILE_WORDS.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const programme = await loadKairosProgramme(db, roundId, programmeId);
  if (!programme) return NextResponse.json({ error: KAIROS_FILE_WORDS.noProgramme }, { status: 404 });
  const now = new Date();
  const file = await buildKairosFile(db, programme, now);
  if (file.status === "no-run") return NextResponse.json({ error: KAIROS_FILE_WORDS.noProgramme }, { status: 404 });
  if (file.status === "not-over") {
    return NextResponse.json({ error: KAIROS_FILE_WORDS.notOver(file.end.lastDay) }, { status: 409 });
  }

  const filename = kairosFilename(programme.name, londonDateKey(now));
  const csv = toCSV(file.header, file.rows);
  try {
    await logExport(db, {
      kind: "kairos",
      actorUid: actor.uid,
      actorName: actor.displayName ?? "",
      scope: { roundId: programme.roundId, runId: programme.runId },
      rowCount: file.rows.length,
      filename,
    });
  } catch (err) {
    console.error("[kairos export] could not record the download", programme.runId, err);
    return NextResponse.json({ error: KAIROS_FILE_WORDS.notRecorded }, { status: 503 });
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
