import "server-only";
import { listGroups, weeksOf, type GridPerson, type RunRecords } from "@/lib/courses/programmeAttendance";
import { recordOf, runEndOf, type Finishing, type RunEnd } from "./record";

/**
 * HOW MANY TOOK PART IN A PROGRAMME, AND HOW MANY FINISHED, counted once for
 * every page that says so: the Kairos report (`src/lib/surveys/kairosReportLoad.ts`)
 * and This term in numbers (`src/lib/surveys/term/load.ts`). Two pages that
 * counted these each their own way could tell an admin two numbers for one
 * programme, so neither counts them: both ask here.
 *
 *  - STARTED is everybody the Attendance tab lists for an admin: on the
 *    programme at its end, and whoever left after a register marked them
 *    (`listGroups`), each person once however many groups list them.
 *  - AT THE END is those of them who have not left.
 *  - FINISHED is those at the end whose record says they finished
 *    (`recordOf`: the lead's decision, or the rule's suggestion), and null
 *    until the run's last session is over, since nobody has finished
 *    anything before then.
 *
 * Pure: the caller reads the run's records and its finished record.
 */
export type Headcount = {
  end: RunEnd;
  /** Everybody who took part, each once, in the Attendance tab's order. */
  started: GridPerson[];
  /** Of those, everybody who had not left by the end. */
  atEnd: GridPerson[];
  /** How many of those finished, by the record; null before the run's last session is over. */
  finished: number | null;
};

export function headcountOf(records: RunRecords, finishing: Finishing, now: Date): Headcount {
  const end = runEndOf(records.run, records.groups, now);
  const rows = listGroups(records, { isAdmin: true }, now, weeksOf(records)).flatMap((listed) => listed.people.map((person) => person.row));
  const seen = new Set<string>();
  const started = rows.filter((row) => (seen.has(row.uid) ? false : (seen.add(row.uid), true)));
  const atEnd = started.filter((row) => row.left === null);
  return {
    end,
    started,
    atEnd,
    finished: end.over ? atEnd.filter((row) => recordOf(row, finishing, end)?.finished === true).length : null,
  };
}
