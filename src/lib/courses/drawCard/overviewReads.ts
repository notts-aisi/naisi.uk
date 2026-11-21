import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar, resolveWeekDocs, type ResolvedWeekEntry } from "@/lib/courses/groupResolve";
import { drawRosterOf, drawWeeksFrom, readDrawState, type DrawState } from "@/lib/courses/packsAndCases/readers";
import type { RunRecords } from "@/lib/courses/programmeAttendance";
import { resolveSessions } from "@/lib/courses/sessions";
import { mayBeAfterHandOut, pastHandOutToRead, slipsWaitingOf, type SlipsWaiting } from "./overviewLine";
import { withDraws } from "./model";

/**
 * THE SLIPS NOT COPIED IN, for the programme's Overview (`./overviewLine.ts`),
 * read for every group of the run at once, beside the Overview's own reads.
 * The Overview reads no week's document by query for anything else, so these
 * are its own, bounded in four steps:
 *
 *  1. From each group's sessions alone (the one session resolver with the
 *     group's own calendar, over the records the Overview has already read):
 *     whether any week still to come is past its hand-out session. No group
 *     is: nothing is read at all.
 *  2. The run's weeks, ONCE for every group (`resolveWeekDocs` with no group:
 *     one query).
 *  3. For each group step 1 kept, its own copies of weeks over them
 *     (`resolveWeekDocs` with the run's weeks handed in: one query, the
 *     group's copies only), and the course's weeks as it reads them, nothing
 *     read (`drawWeeksFrom`). A group's own copy can give something out where
 *     the run's week does not, and the card reads it, so it is read here too.
 *  4. The draw only of the weeks the rule reads whose hand-out session has
 *     ended (`pastHandOutToRead`), for the people the pathways and cases page
 *     counts (`drawRosterOf`, from the same records: no read), one read by id
 *     per person and block, and the rule asked again with what was read
 *     (`withDraws`). A week left unread counts as not complete, so the rule's
 *     week is then either one read here or one not past its hand-out, which
 *     draws no line: the answer is the one reading both would give.
 *
 * A read that fails draws no line for the groups it was for, is logged, and
 * leaves every other group's line and the page as they are.
 */
export async function readSlipsWaiting(
  db: Firestore,
  input: { records: RunRecords; viewer: { isAdmin: boolean }; now: Date },
): Promise<Map<string, SlipsWaiting>> {
  const { records, viewer, now } = input;
  const { run } = records;
  const out = new Map<string, SlipsWaiting>();
  const kept = records.groups.filter((group) => {
    if (group.archived) return false;
    try {
      const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
      return mayBeAfterHandOut(sessions, now);
    } catch (err) {
      console.error("[overview] the slips not copied in could not be read", group.id, err);
      return false;
    }
  });
  if (kept.length === 0) return out;
  let runWeeks: ResolvedWeekEntry[];
  try {
    runWeeks = await resolveWeekDocs(db, run.id, null);
  } catch (err) {
    console.error("[overview] the slips not copied in could not be read", run.id, err);
    return out;
  }
  const found = await Promise.all(
    kept.map(async (group) => {
      try {
        const entries = await resolveWeekDocs(db, run.id, group.id, { runWeeks });
        const dates = drawWeeksFrom({ run, group, entries, now });
        const toRead = pastHandOutToRead(dates, now);
        if (toRead.length === 0) return null;
        const { people } = drawRosterOf(records, group, viewer, now);
        if (people.length === 0) return null;
        const read = await Promise.all(
          toRead.map(async (n) => {
            const week = dates.weeks.get(n);
            return week ? ([n, await readDrawState(db, run.id, week, people)] as const) : null;
          }),
        );
        const states = new Map<number, DrawState>(read.filter((entry): entry is readonly [number, DrawState] => entry !== null));
        const waiting = slipsWaitingOf({ weeks: withDraws(dates, states, people, now), people, now });
        return waiting ? ([group.id, waiting] as const) : null;
      } catch (err) {
        console.error("[overview] the slips not copied in could not be read", group.id, err);
        return null;
      }
    }),
  );
  for (const entry of found) if (entry) out.set(entry[0], entry[1]);
  return out;
}
