import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { resolveSessions } from "@/lib/courses/sessions";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { weekDone, weekWritingNeeds, workIsClosed } from "@/lib/courses/weekWork/model";
import { loadPeopleWeekFacts, loadRunWeekStates } from "@/lib/courses/weekWork/readers";
import { liveGroupsOf } from "@/lib/courses/writtenAnswers/access";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { NOTHING_DONE } from "./model";

/**
 * THE EARLIER WEEKS EACH PERSON HAS NOT DONE, for the one line "Week N is
 * open" adds ("Week 1 isn’t done yet either: it’s still open on your
 * programme page."): each week of the group's plan before the email's own,
 * written as blocks and published, whose session the person was due at has
 * passed (they had joined the group by then: somebody told their group after
 * it has no such session, so it is never named), and which is not done by
 * the one meaning of done. Nothing once the programme has closed.
 *
 * EACH WEEK ON THE COPY THAT PERSON READS (`RunWeekStates.copyGroupOf`, made
 * of `copyGroupIdFor`): the copy their own week page shows them and "where
 * their week stands" counts. Somebody moved here mid-term is judged on the
 * old group's copy of a week they spent there, so a week they finished there
 * is never named as not done because the group's own copy asks something
 * more. Everybody else on the group's copy, as always.
 *
 * Read on the server, once per send, before anything is claimed: the run's
 * stored weeks and places once (`loadRunWeekStates`), then each earlier
 * week, once per copy somebody asked about reads it on, and its facts for the
 * people whose session for it has passed. Every person asked about is in the
 * answer, with an empty list for none.
 */
export async function earlierWeeksNotDone(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; weekNumber: number; uids: readonly string[]; now: Date },
): Promise<Map<string, number[]>> {
  const { run, group, weekNumber, now } = input;
  const uids = [...new Set(input.uids.filter(Boolean))];
  const out = new Map<string, number[]>(uids.map((uid) => [uid, []]));
  if (uids.length === 0) return out;
  const sessions = resolveSessions(run, group);
  const earlier = [...new Set(sessions.filter((session) => session.occurrence === 1 && session.weekNumber < weekNumber).map((session) => session.weekNumber))].sort(
    (a, b) => a - b,
  );
  if (earlier.length === 0) return out;
  const liveGroups = await liveGroupsOf(db, run.id);
  const states = await loadRunWeekStates(db, { run, liveGroups, now });
  if (workIsClosed(states.closesAt, now)) return out;
  // One copy of one week, read once, kept only when written as blocks and published.
  const read = new Map<string, Promise<WeekBlock[] | null>>();
  const blocksOf = (groupId: string, n: number): Promise<WeekBlock[] | null> => {
    const key = `${groupId} ${n}`;
    let found = read.get(key);
    if (!found) {
      found = resolveWeekDoc(db, run.id, groupId, weekDocId(n)).then(({ week }) =>
        week && isBlockWeek(week) && week.published ? (week.blocks as WeekBlock[]) : null,
      );
      read.set(key, found);
    }
    return found;
  };
  for (const n of earlier) {
    const due = uids.filter((uid) => {
      const at = states.dueOf(uid, n);
      return (at.by === "session" || at.by === "cancelled") && at.at !== null && at.at.getTime() <= now.getTime();
    });
    if (due.length === 0) continue;
    // The people due, by the copy of the week each reads.
    const byCopy = new Map<string, string[]>();
    for (const uid of due) {
      const copy = states.copyGroupOf(uid, n, group.id);
      byCopy.set(copy, [...(byCopy.get(copy) ?? []), uid]);
    }
    for (const [copy, people] of byCopy) {
      const blocks = await blocksOf(copy, n);
      if (!blocks) continue;
      const facts = await loadPeopleWeekFacts(db, { runId: run.id, weekNumber: n, blocks, uids: people });
      const tasks = weekTaskNeeds(blocks);
      const asks = weekWritingNeeds(blocks);
      for (const uid of people) {
        const own = facts.get(uid) ?? NOTHING_DONE;
        const done = weekDone({ tasks, state: own.state, submitted: states.submittedOf(uid, n) !== null, asks });
        if (!done) out.get(uid)?.push(n);
      }
    }
  }
  return out;
}
