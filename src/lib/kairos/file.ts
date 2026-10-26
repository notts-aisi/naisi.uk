import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readFinishing, recordOf } from "@/lib/courses/finishing/record";
import { runEndOf, type RunEnd } from "@/lib/courses/finishing/runEnd";
import { listGroups, readRunRecords, weeksOf } from "@/lib/courses/programmeAttendance";
import { readRunRatings } from "@/lib/ratings/store";
import { kairosChoicesOf } from "./choice";
import { kairosFileTable, type KairosFilePerson } from "./fileTable";
import { sharesWithKairos } from "./model";
import type { KairosProgramme } from "./programmes";

/**
 * THE KAIROS FILE FOR ONE PROGRAMME, read from the records once its run's
 * last session is over: everybody taking part at the end (the register's
 * rows, as an admin sees them), less everybody whose Kairos choice says no.
 * Each row is the person's name, the programme, the sessions they came to
 * (the register's count, as Attendance and who finished count it), whether
 * they finished (`recordOf`, the lead's decision or the rule's suggestion)
 * and the ratings they were given.
 *
 * Somebody who left is not in it: they are counted in the report's totals,
 * and nothing of theirs goes to Kairos with their name.
 *
 * Admins only ask here; the route decides that, and records the download
 * before handing it over.
 */

export type KairosFile =
  | { status: "ok"; header: string[]; rows: (string | number)[][]; end: RunEnd; leftOut: number }
  /** The run is not there. */
  | { status: "no-run" }
  /** The run's last session is not over yet: nobody has finished anything. */
  | { status: "not-over"; end: RunEnd };

export async function buildKairosFile(db: Firestore, programme: KairosProgramme, now: Date): Promise<KairosFile> {
  const records = await readRunRecords(db, programme.runId);
  if (!records) return { status: "no-run" };
  const end = runEndOf(records.run, records.groups, now);
  if (!end.over) return { status: "not-over", end };

  const rows = listGroups(records, { isAdmin: true }, now, weeksOf(records))
    .flatMap((listed) => listed.people)
    .map((person) => person.row)
    .filter((row) => row.left === null);
  const uids = [...new Set(rows.map((row) => row.uid))];
  const [finishing, choices, ratings] = await Promise.all([
    readFinishing(db, programme.runId),
    kairosChoicesOf(db, uids),
    readRunRatings(db, programme.runId),
  ]);

  const people: KairosFilePerson[] = [];
  let leftOut = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.uid)) continue;
    seen.add(row.uid);
    if (!sharesWithKairos(choices.get(row.uid))) {
      leftOut += 1;
      continue;
    }
    people.push({
      name: row.name,
      came: row.came,
      of: row.of,
      finished: recordOf(row, finishing, end)?.finished === true,
      ratings: ratings
        .filter((rating) => rating.ratedUid === row.uid)
        .sort((a, b) => (a.savedAt?.getTime() ?? 0) - (b.savedAt?.getTime() ?? 0) || a.id.localeCompare(b.id))
        .map((rating) => ({ ...rating.answers })),
    });
  }
  const table = kairosFileTable(programme.name, programme.kind, people);
  return { status: "ok", header: table.header, rows: table.rows, end, leftOut };
}
