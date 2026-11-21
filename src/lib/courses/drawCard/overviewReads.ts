import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { drawRosterOf, readDrawState, readDrawWeeks, type DrawState } from "@/lib/courses/packsAndCases/readers";
import type { RunRecords } from "@/lib/courses/programmeAttendance";
import { resolveSessions } from "@/lib/courses/sessions";
import { mayBeAfterHandOut, slipsMayBeWaiting, slipsWaitingOf, type SlipsWaiting } from "./overviewLine";
import { withDraws } from "./model";

/**
 * THE SLIPS NOT COPIED IN, for the programme's Overview (`./overviewLine.ts`),
 * read for every group of the run at once, beside the Overview's own reads,
 * and bounded in three steps so a group with nothing to say costs nothing:
 *
 *  1. From the group's sessions alone (the one session resolver with the
 *     group's own calendar, over the records the Overview has already read):
 *     whether any week still to come is past its hand-out session. No: no
 *     read at all.
 *  2. The course's weeks as the group reads them (`readDrawWeeks` with nobody
 *     in the draw: the run's weeks and the group's own copies, two queries,
 *     no slip), and whether a week the rule reads is past its hand-out
 *     session. No: no slip is read.
 *  3. The draw of the rule's weeks (at most two, `DRAW_WEEKS_READ`) for the
 *     people the card counts (`drawRosterOf`, from the same records: no read),
 *     one read by id per person and block, and the rule asked again with
 *     whether everybody has theirs (`withDraws`).
 *
 * A group whose reads fail draws no line, is logged, and leaves every other
 * group's line and the page as they are.
 */
export async function readSlipsWaiting(
  db: Firestore,
  input: { records: RunRecords; viewer: { isAdmin: boolean }; now: Date },
): Promise<Map<string, SlipsWaiting>> {
  const { records, viewer, now } = input;
  const { run } = records;
  const found = await Promise.all(
    records.groups.map(async (group) => {
      if (group.archived) return null;
      try {
        const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
        if (!mayBeAfterHandOut(sessions, now)) return null;
        const dates = await readDrawWeeks(db, { run, group, people: [], now });
        if (!slipsMayBeWaiting(dates, now)) return null;
        const { people } = drawRosterOf(records, group, viewer, now);
        if (people.length === 0) return null;
        const read = await Promise.all(
          dates.rule.toRead.map(async (n) => {
            const week = dates.weeks.get(n);
            return week ? ([n, await readDrawState(db, run.id, week, people)] as const) : null;
          }),
        );
        const states = new Map<number, DrawState>(read.filter((entry): entry is readonly [number, DrawState] => entry !== null));
        const waiting = slipsWaitingOf({ course: withDraws(dates, states, people, now), people, now });
        return waiting ? ([group.id, waiting] as const) : null;
      } catch (err) {
        console.error("[overview] the slips not copied in could not be read", group.id, err);
        return null;
      }
    }),
  );
  return new Map(found.filter((entry): entry is readonly [string, SlipsWaiting] => entry !== null));
}
