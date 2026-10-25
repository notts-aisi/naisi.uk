import { NextResponse } from "next/server";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { attendanceCsvTable, buildRunAttendance, readRunRecords } from "@/lib/courses/programmeAttendance";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { toCSV } from "@/lib/csv";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { logExport } from "@/lib/firestore/dataExports";
import { slugify } from "@/lib/firestore/slugId";

/**
 * "Download CSV" on a programme's Attendance tab: every register of the
 * course run the programme names, as the grid draws it, one row a person.
 *
 * ## Gated like the tab
 *
 * `loadProgrammeRun`, the tab's own gate, decided from the form before the
 * run is read: an admin and the programme's lead; a reviewer is refused; a
 * form, a programme or a role that is not there is answered as nothing being
 * there. Who is a row is the grid's rule (`buildRunAttendance`), so the file
 * holds exactly what the caller can read on the tab: a lead the people
 * Publish has told, an admin everybody placed.
 *
 * ## A POST, and the log is written FIRST
 *
 * As the worksheet and membership exports: no write on a GET (a GET is
 * prefetched, retried and unfurled), and the `dataExports` row is written
 * before the file is handed over, and a failure to write it refuses the
 * export (`logExport` throws so that this is not optional). The registers
 * are read first, because the row count belongs in the record; they sit in
 * memory and go nowhere until the log has been written.
 *
 * ## Names and marks, nothing else
 *
 * Group, name, each week's mark in words, "Came" and "Of", and when somebody
 * left. Never an address (names come through `displayNameOf`) and never a
 * note. The file starts with a byte-order mark so a spreadsheet reads the
 * names as UTF-8.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

const BOM = "﻿";

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status === "none") {
    return NextResponse.json({ error: "There is no programme here." }, { status: 404 });
  }
  if (outcome.status === "not-yours") {
    return NextResponse.json(
      { error: "Only the programme’s lead and admins can download its attendance." },
      { status: 403 },
    );
  }
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json(
      { error: `${view.programmeName} doesn’t name a course run, so it has no attendance to download.` },
      { status: 409 },
    );
  }

  const now = new Date();
  let csv: string;
  let rowCount: number;
  let filename: string;
  try {
    const records = await readRunRecords(db, view.run.id);
    if (!records) {
      return NextResponse.json(
        { error: `The course run ${view.programmeName} names is no longer on the site.` },
        { status: 409 },
      );
    }
    const table = attendanceCsvTable(buildRunAttendance(records, { isAdmin: view.viewer === "admin" }, now));
    csv = BOM + toCSV(table.header, table.rows);
    rowCount = table.rows.length;
    // The programme and the day it was taken: two downloads a week apart are
    // different files, and the name is the one written into the log.
    filename = `attendance-${slugify(view.programmeName)}-${londonDateKey(now)}.csv`;
  } catch (err) {
    console.error("[attendance export] build failed", view.run.id, err);
    return NextResponse.json({ error: "The CSV couldn’t be made. Try again." }, { status: 500 });
  }

  // THE LOG, BEFORE THE BODY. A throw here is a refusal, not a warning.
  try {
    await logExport(db, {
      kind: "register",
      actorUid: actor.uid,
      actorName: actor.displayName ?? "",
      scope: { runId: view.run.id, roundId: view.roundId },
      rowCount,
      filename,
    });
  } catch (err) {
    console.error("[attendance export] log write failed", view.run.id, err);
    return NextResponse.json(
      {
        error:
          "The download couldn’t be recorded, so it wasn’t made. Every download of a register is " +
          "logged. Try again shortly.",
      },
      { status: 503 },
    );
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Never cached: a cached copy is a copy nobody logged.
      "Cache-Control": "no-store",
    },
  });
}
