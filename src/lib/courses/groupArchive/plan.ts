import { isRegisterUnmarked, type RegisterState } from "@/lib/courses/unmarkedRegisters";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import {
  enrolmentHasLeft,
  ownGroupForWeek,
  visitInWeek,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  ARCHIVE_REFUSAL,
  facilitatorSitsElsewhereWords,
  movingLaterWords,
  stillHasPeopleOnlyGroupWords,
  stillHasPeopleRunClosedWords,
  stillHasPeopleWords,
  unfinishedRegistersWords,
  visitsToComeWords,
} from "./words";

/**
 * WHETHER A GROUP MAY BE ARCHIVED OR RESTORED, as arithmetic.
 *
 * Archiving a group keeps it on the run for the record and takes it out of
 * everything to come: no session, no reminder, no calendar entry, no
 * register its facilitators can take, nothing to be excused from, and no
 * block or row of its own on the Attendance tab. So it is refused, with one
 * sentence and nothing written, while it would silently lose something:
 *
 *  1. ANYBODY STILL HOLDS A PLACE IN IT: a learner's place whose group it is
 *     and who has not left, as the Groups tab counts them. Their attendance,
 *     who finished and their sessions to come all read the group they are
 *     in, and only from a group that still meets. The sentence says what can
 *     be done: move them, unless the run has no other group that still meets
 *     or takes no move any more (`runTakesNoMove`), when it says why it stays.
 *  2. SOMEBODY MOVED TO ANOTHER GROUP FROM A WEEK STILL TO COME is in this
 *     group until then (their record of groups by week names it for a week
 *     whose session has not started): archiving would take those sessions
 *     from them.
 *  3. A ONE-WEEK VISIT to one of its sessions still to come: the visitor
 *     would have nowhere to go that week.
 *  4. A REGISTER OF A SESSION THAT HAS STARTED is neither finished nor marked
 *     as not having happened (`isRegisterUnmarked`, the register chase's own
 *     test, so a register nobody opened is unfinished too): an archived
 *     group's facilitators lose its register, the chase stops, and an
 *     unfinished register of an archived group counts for nothing
 *     (`countsFromArchivedGroup`). A session called off counts for nothing
 *     either way and is not asked about.
 *
 * Allowed, because nothing is lost once those four hold: the group's
 * facilitators no longer see a group nobody is in (nobody is told, and
 * nothing is sent); a session still to come that was given to somebody to
 * cover has nobody in it to cover; a run that is over archives its emptied
 * groups as any other.
 *
 * Restoring is refused while one of the group's facilitators holds a place
 * in another group of the run, because a facilitator who holds a place sits
 * in the group they facilitate and no other, and the doors that appoint
 * facilitators and move people refuse to make that state.
 *
 * Both are refused on a run being destroyed: its groups belong to the
 * destroy until it ends.
 *
 * Pure: no reads, and no clock but the one passed.
 */

/** Everything the two decisions read, as `read.ts` reads it (in the press's transaction, the second time). */
export type GroupArchiveFacts = {
  group: CourseGroupDoc;
  /** The group's run, or null when the group names none that is there. */
  run: CourseRunDoc | null;
  /** The run is being destroyed. */
  destroying: boolean;
  /** Every group of the run, archived ones and this one included. */
  runGroups: readonly CourseGroupDoc[];
  /** Every place on the run, of every role and status. */
  places: readonly CourseEnrolmentDoc[];
  /** This group's registers of the sessions that have started, by session key. Absent is a register nobody opened. */
  registers: ReadonlyMap<string, RegisterState>;
};

/**
 * A run that takes no move any more: over, cancelled or archived. The same
 * three as the staff move's own refusal (`runMoveRefusal` in
 * `src/lib/courses/staffMove/plan.ts`), so a sentence that says "move them"
 * is only ever said where a move can be made.
 */
export function runTakesNoMove(run: Pick<CourseRunDoc, "status" | "archived">): boolean {
  return run.status === "completed" || run.status === "cancelled" || run.archived;
}

/** A learner's place on this group's run who has not left. */
function stillOnRun(place: CourseEnrolmentDoc, runId: string): boolean {
  return place.runId === runId && place.role === "learner" && !enrolmentHasLeft(place.status);
}

/** The places whose group is this one: the Groups tab's count. */
export function placesInGroup(facts: Pick<GroupArchiveFacts, "group" | "places">): CourseEnrolmentDoc[] {
  const { group } = facts;
  return facts.places.filter((place) => stillOnRun(place, group.runId) && place.groupId === group.id);
}

/** The group's sessions that have started and were not called off: the ones whose registers are asked about. */
export function startedSessions(run: CourseRunDoc, group: CourseGroupDoc, now: Date): ResolvedSession[] {
  return resolveSessions(run, group).filter((session) => {
    if (session.cancelled) return false;
    const { startsAt } = sessionInstants(session);
    return startsAt !== null && startsAt.getTime() <= now.getTime();
  });
}

/**
 * The weeks of the group's sessions still to come, called-off ones left out.
 * A session that cannot be dated is counted as still to come: nobody can say
 * it has met.
 */
function weeksToCome(run: CourseRunDoc, group: CourseGroupDoc, now: Date): number[] {
  const weeks = new Set<number>();
  for (const session of resolveSessions(run, group)) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (startsAt === null || startsAt.getTime() > now.getTime()) weeks.add(session.weekNumber);
  }
  return [...weeks].sort((a, b) => a - b);
}

const sortedWeeks = (weeks: Iterable<number>) => [...new Set(weeks)].sort((a, b) => a - b);

/** Why archiving the group would lose something, in one sentence, or null when it may be archived. */
export function archiveRefusal(facts: GroupArchiveFacts, now: Date): string | null {
  const { group, run } = facts;
  if (facts.destroying) return ARCHIVE_REFUSAL.destroying;

  const inGroup = placesInGroup(facts).length;
  if (inGroup > 0) {
    if (run && runTakesNoMove(run)) return stillHasPeopleRunClosedWords(group.name, inGroup);
    const others = facts.runGroups.filter((each) => each.id !== group.id && !each.archived && each.runId === group.runId);
    if (run && others.length === 0) return stillHasPeopleOnlyGroupWords(group.name, inGroup);
    return stillHasPeopleWords(group.name, inGroup);
  }

  // A group that names no run that is there has no sessions to lose.
  if (!run) return null;

  const toCome = weeksToCome(run, group, now);
  const elsewhere = facts.places.filter((place) => stillOnRun(place, group.runId) && place.groupId !== group.id);

  const movingLater = new Set<string>();
  const movingWeeks: number[] = [];
  for (const place of elsewhere) {
    for (const week of toCome) {
      if (ownGroupForWeek(place, week) !== group.id) continue;
      movingLater.add(place.uid);
      movingWeeks.push(week);
    }
  }
  if (movingLater.size > 0) return movingLaterWords(group.name, movingLater.size, sortedWeeks(movingWeeks));

  let visits = 0;
  const visitWeeks: number[] = [];
  for (const place of elsewhere) {
    for (const week of toCome) {
      if (visitInWeek(place, week)?.groupId !== group.id) continue;
      visits += 1;
      visitWeeks.push(week);
    }
  }
  if (visits > 0) return visitsToComeWords(group.name, visits, sortedWeeks(visitWeeks));

  const unfinished = startedSessions(run, group, now)
    .filter((session) => isRegisterUnmarked(facts.registers.get(session.sessionKey) ?? { exists: false, held: true, pushedAt: null }))
    .map((session) => session.weekNumber);
  if (unfinished.length > 0) return unfinishedRegistersWords(group.name, sortedWeeks(unfinished));

  return null;
}

/** Why restoring the group would break a rule the site holds elsewhere, in one sentence, or null when it may be restored. */
export function restoreRefusal(facts: GroupArchiveFacts): string | null {
  const { group } = facts;
  if (facts.destroying) return ARCHIVE_REFUSAL.destroying;

  const facilitators = new Set(group.facilitatorUids);
  const sitsElsewhere = facts.places.filter(
    (place) =>
      facilitators.has(place.uid) &&
      stillOnRun(place, group.runId) &&
      place.groupId !== null &&
      place.groupId !== "" &&
      place.groupId !== group.id,
  );
  if (sitsElsewhere.length === 0) return null;
  const names = new Map(facts.runGroups.map((each) => [each.id, each.name] as const));
  const otherGroups = [...new Set(sitsElsewhere.map((place) => names.get(place.groupId ?? "") ?? "another group"))];
  return facilitatorSitsElsewhereWords(group.name, sitsElsewhere.length, otherGroups);
}
