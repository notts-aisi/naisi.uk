import { resolveSessions } from "@/lib/courses/sessions";
import { normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { FinishRule } from "./model";
import { certificateNeedsWords } from "./words";

/**
 * WHAT A CERTIFICATE NEEDS, FOR ONE PERSON ON ONE RUN: the numbers behind
 * `certificateNeedsWords`, worked out from what the reader already holds.
 * Pure: the rule is read by the caller (`readFinishRule`).
 *
 * Said to a learner alone: never somebody whose place is as a facilitator,
 * nor a learner who facilitates a group of the run, who is sent a
 * certificate for facilitating whatever they came to. Nothing about their
 * own count against the rule, and nothing about anybody else.
 */

/**
 * How many sessions a group is due to hold for somebody who joined it in
 * `joinedWeekNumber`, counted as who finished counts a group's sessions
 * (`groupSessions` in `programmeAttendance.ts`, which the finished record
 * reads): each week's first session, from the week they joined, one called
 * off left out, and one whose register says it was not held (`notHeld`, by
 * session key: the old switch) left out too.
 */
export function sessionsDueFor(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  joinedWeekNumber: number,
  notHeld: ReadonlySet<string> = new Set(),
): number {
  const weeks = new Set<number>();
  for (const session of resolveSessions(run, group)) {
    if (session.occurrence !== 1 || session.cancelled || notHeld.has(session.sessionKey) || session.weekNumber < joinedWeekNumber) continue;
    weeks.add(session.weekNumber);
  }
  return weeks.size;
}

/** The sentence for this person, or null: no rule, no learner's place, or a learner who facilitates. */
export function certificateNeedsFor(input: {
  rule: FinishRule | null;
  run: CourseRunDoc;
  /** Their own group, or null with none yet. */
  group: CourseGroupDoc | null;
  enrolment: Pick<CourseEnrolmentDoc, "role" | "status" | "joinedWeekNumber"> | null;
  /** They facilitate a group of the run. */
  facilitates: boolean;
  /** The run is an incubator's: its people are told of no group. */
  incubator: boolean;
  /**
   * Their group's registers the caller has already read, by session key. One
   * that says its session was not held (the old switch) counts for nothing,
   * as the record counts it; a session cancelled through Change a session is
   * left out by `sessionsDueFor` whatever its register says.
   */
  registers?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}): string | null {
  const { rule, run, group, enrolment } = input;
  if (!rule || !enrolment || enrolment.role !== "learner" || enrolment.status !== "active" || input.facilitates) return null;
  const sessions = group ? resolveSessions(run, group) : [];
  const notHeld = new Set<string>();
  for (const [key, data] of input.registers ?? []) {
    const register = normalizeCourseAttendance(key, data);
    if (!register.held) notHeld.add(key);
  }
  const due = group ? sessionsDueFor(run, group, enrolment.joinedWeekNumber, notHeld) : null;
  const firstWeek = Math.min(...sessions.filter((session) => session.occurrence === 1 && !session.cancelled).map((session) => session.weekNumber));
  // "Of your group's 6 sessions" only where it is simply true: not for
  // somebody who joined after it began, nor for a group meeting more than
  // once in a week (the record counts one session a week).
  const joinedLate = Number.isFinite(firstWeek) && enrolment.joinedWeekNumber > firstWeek;
  const twiceAWeek = sessions.some((session) => session.occurrence > 1);
  return certificateNeedsWords({
    atLeast: rule.atLeast,
    due,
    noOf: group !== null && (joinedLate || twiceAWeek),
    incubator: input.incubator,
  });
}
