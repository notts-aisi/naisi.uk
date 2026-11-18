import {
  GROUPS_BY_WEEK_LIMITS,
  groupForWeek,
  ownGroupForWeek,
  type CourseEnrolmentDoc,
  type GroupFromWeek,
  type OneWeekVisit,
} from "@/lib/firestore/courseEnrolments";
import type { ResolvedSession } from "./sessions";

/**
 * A PLACE'S GROUPS, WEEK BY WEEK, for the readers that need more than one
 * week's answer: the stretches of weeks they spent in each group, every
 * group their weeks were in, the sessions they were due at across those
 * groups, and the record a move from a week leaves behind. Every answer is
 * made of `groupForWeek` (`src/lib/firestore/courseEnrolments.ts`), the one
 * question, and of the record it reads.
 *
 * With no record and no visit, every answer here is the place's group for
 * every week, which is how every reader read a place before the record
 * existed.
 *
 * A ONE-WEEK VISIT (`visits`) is one more answer of `groupForWeek`: the host
 * group for that week. So every answer here is about the session's group,
 * week by week, visits included: the stretches, the sessions somebody was
 * due at, the register their line is on. A reader that means the group the
 * place BELONGS to in each week (the copy they work in, whose member they
 * are, a staff move's week rule, a group they join later) asks these of
 * `belonging(place)`, the same place without its visits.
 *
 * Pure: no reads, no clock.
 */

/** The fields of a place these answers read. */
export type PlaceByWeek = Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek" | "visits">;

/**
 * A stretch of weeks spent in one group: from `fromWeek` up to but not
 * including `untilWeek`, or for good when `untilWeek` is null. The first
 * stretch starts at week 1, since a week before the record's first entry
 * reads the group they joined (`groupForWeek`).
 */
export type GroupStretch = { groupId: string; fromWeek: number; untilWeek: number | null };

/** Whether the place carries a record of groups by week (somebody moved from a week). */
export function hasGroupsByWeek(place: Pick<CourseEnrolmentDoc, "groupsByWeek">): boolean {
  return (place.groupsByWeek?.length ?? 0) > 1;
}

/** Whether the place has a one-week visit to another group's session. */
export function hasVisits(place: Pick<CourseEnrolmentDoc, "visits">): boolean {
  return (place.visits?.length ?? 0) > 0;
}

/**
 * WHETHER ANY WEEK'S SESSION IS ANOTHER GROUP'S THAN THE GROUP THEY ARE IN
 * NOW: a record of groups by week, or a one-week visit. With neither, every
 * reader of a week's session reads the group they are in now, as before.
 */
export function differsByWeek(place: PlaceByWeek): boolean {
  return hasGroupsByWeek(place) || hasVisits(place);
}

/**
 * THE PLACE AS THE GROUPS IT BELONGS TO: the same place without its one-week
 * visits, for a reader that means whose member they are each week (the copy
 * they work in, a staff move's week rule, a group they join later). A
 * visit's host is never a group they belong to.
 */
export function belonging(place: PlaceByWeek): Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek"> {
  return place.groupsByWeek ? { groupId: place.groupId, groupsByWeek: place.groupsByWeek } : { groupId: place.groupId };
}

/** The stretches of the groups the place belongs to, before any visit. */
function ownStretchesOf(place: PlaceByWeek): GroupStretch[] {
  const record = place.groupsByWeek;
  if (!record || record.length === 0) {
    return place.groupId ? [{ groupId: place.groupId, fromWeek: 1, untilWeek: null }] : [];
  }
  return record.map((entry, index) => ({
    groupId: entry.groupId,
    fromWeek: index === 0 ? 1 : entry.fromWeek,
    untilWeek: record[index + 1]?.fromWeek ?? null,
  }));
}

/**
 * Every stretch of weeks the place's sessions were one group's, in week
 * order: the groups it belongs to, with each one-week visit cut out as a
 * stretch of one week at the host. Two stretches in a row of one group read
 * as one. No record and no visit: one stretch, the group they are in now,
 * from week 1 for good. No group: none.
 */
export function groupStretchesOf(place: PlaceByWeek): GroupStretch[] {
  const own = ownStretchesOf(place);
  if (!hasVisits(place) || own.length === 0) return own;
  const cut: GroupStretch[] = [];
  for (const stretch of own) {
    let from = stretch.fromWeek;
    const inside = (place.visits ?? []).filter(
      (visit) => visit.weekNumber >= stretch.fromWeek && (stretch.untilWeek === null || visit.weekNumber < stretch.untilWeek),
    );
    for (const visit of inside) {
      if (visit.groupId === stretch.groupId) continue;
      if (visit.weekNumber > from) cut.push({ groupId: stretch.groupId, fromWeek: from, untilWeek: visit.weekNumber });
      cut.push({ groupId: visit.groupId, fromWeek: visit.weekNumber, untilWeek: visit.weekNumber + 1 });
      from = visit.weekNumber + 1;
    }
    if (stretch.untilWeek === null || from < stretch.untilWeek) cut.push({ groupId: stretch.groupId, fromWeek: from, untilWeek: stretch.untilWeek });
  }
  const out: GroupStretch[] = [];
  for (const stretch of cut) {
    const last = out[out.length - 1];
    if (last && last.groupId === stretch.groupId && last.untilWeek === stretch.fromWeek) last.untilWeek = stretch.untilWeek;
    else out.push({ ...stretch });
  }
  return out;
}

/** The stretches the place spent in one group, in week order (none when they were never in it). */
export function stretchesIn(place: PlaceByWeek, groupId: string): GroupStretch[] {
  return groupStretchesOf(place).filter((stretch) => stretch.groupId === groupId);
}

/**
 * WHETHER A ROW IS ONE OF A GROUP'S REGISTER'S ROWS FOR A SESSION IN ONE WEEK
 * (`RegisterMember` in `./registerAccess.ts`): always, for somebody whose
 * place records no move, whose row carries no stretches (their joined week
 * is the floor every write already holds them to); for somebody whose place
 * does, only in a week they were in that group. The register's route and its
 * page ask this one function.
 */
export function isRowForWeek(
  member: { inGroupWeeks?: ReadonlyArray<{ fromWeek: number; untilWeek: number | null }> },
  weekNumber: number,
): boolean {
  if (!member.inGroupWeeks) return true;
  return member.inGroupWeeks.some(
    (stretch) => weekNumber >= stretch.fromWeek && (stretch.untilWeek === null || weekNumber < stretch.untilWeek),
  );
}

/** Whether one week of the place was spent in one group. */
export function inGroupForWeek(place: PlaceByWeek, groupId: string, weekNumber: number): boolean {
  return groupForWeek(place, weekNumber) === groupId;
}

/** Whether any week of the place was spent in one group: the group they are in now, or one their record names. */
export function everInGroup(place: PlaceByWeek, groupId: string): boolean {
  return groupStretchesOf(place).some((stretch) => stretch.groupId === groupId);
}

/** Every group the place's weeks were spent in, once each, in the order they were first in it. */
export function groupsOfWeeks(place: PlaceByWeek): string[] {
  return [...new Set(groupStretchesOf(place).map((stretch) => stretch.groupId))];
}

/**
 * THE SESSIONS ONE PERSON WAS DUE AT, ACROSS THEIR GROUPS: each week's
 * sessions from the group they were in that week (`groupForWeek`), in week
 * order. `sessionsOf` answers a group's own sessions, or null for a group
 * that no longer meets, whose weeks then hold none. With no record this is
 * the place's group's sessions as they are, untouched.
 */
export function sessionsByWeekGroup(
  place: PlaceByWeek,
  sessionsOf: (groupId: string) => readonly ResolvedSession[] | null,
): ResolvedSession[] {
  if (!differsByWeek(place)) return place.groupId ? [...(sessionsOf(place.groupId) ?? [])] : [];
  const out: ResolvedSession[] = [];
  for (const stretch of groupStretchesOf(place)) {
    for (const session of sessionsOf(stretch.groupId) ?? []) {
      if (session.weekNumber < stretch.fromWeek) continue;
      if (stretch.untilWeek !== null && session.weekNumber >= stretch.untilWeek) continue;
      out.push(session);
    }
  }
  return out.sort((a, b) => a.weekNumber - b.weekNumber || a.occurrence - b.occurrence);
}

/**
 * Each of those sessions with the group it belongs to, in week order: what
 * a reader needs to address the register each one is marked on
 * (`attendanceDocId(runId, groupId, week, occurrence)`).
 */
export function sessionsWithGroup(
  place: PlaceByWeek,
  sessionsOf: (groupId: string) => readonly ResolvedSession[] | null,
): Array<{ groupId: string; session: ResolvedSession }> {
  const out: Array<{ groupId: string; session: ResolvedSession }> = [];
  for (const stretch of groupStretchesOf(place)) {
    for (const session of sessionsOf(stretch.groupId) ?? []) {
      if (session.weekNumber < stretch.fromWeek) continue;
      if (stretch.untilWeek !== null && session.weekNumber >= stretch.untilWeek) continue;
      out.push({ groupId: stretch.groupId, session });
    }
  }
  return out.sort((a, b) => a.session.weekNumber - b.session.weekNumber || a.session.occurrence - b.session.occurrence);
}

/** Whether a value is a week a move can be made from. */
export function isMoveWeek(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= GROUPS_BY_WEEK_LIMITS.week;
}

/**
 * THE RECORD A MOVE FROM A WEEK LEAVES: the place in `toGroupId` from
 * `fromWeek` on, and every week before it as it was. Kept consistent: in
 * week order, no two entries from one week, no two in a row naming one
 * group, and the last entry's group `toGroupId`, which the move writes as
 * the place's group in the same write. Null when the result names one
 * group only (a move from week 1, or a move back over every week it
 * changed): the place then needs no record, and the field is deleted.
 *
 * Asked only of a place in a group: a place in none has no weeks to keep.
 */
export function recordAfterMove(place: PlaceByWeek, toGroupId: string, fromWeek: number): GroupFromWeek[] | null {
  const before: GroupFromWeek[] = place.groupsByWeek?.length
    ? place.groupsByWeek.map((entry) => ({ ...entry }))
    : place.groupId
      ? [{ groupId: place.groupId, fromWeek: 1 }]
      : [];
  const kept = before.filter((entry) => entry.fromWeek < fromWeek);
  const out: GroupFromWeek[] = [];
  for (const entry of [...kept, { groupId: toGroupId, fromWeek }]) {
    if (out.length > 0 && out[out.length - 1].groupId === entry.groupId) continue;
    out.push(entry);
  }
  return out.length > 1 ? out : null;
}

/**
 * THE VISITS THAT STILL STAND ONCE THE GROUPS A PLACE BELONGS TO CHANGE (a
 * move on the allocation board, a change of session on an open run, a staff
 * move from a week): every visit but one whose host is now the group the
 * place belongs to that week, which would be no visit at all. Null when none
 * stands, and the field is then deleted. A writer that changes the place's
 * groups writes this in the same write, so what is stored is what is read.
 */
export function visitsAfterGroupChange(
  place: Pick<CourseEnrolmentDoc, "visits">,
  after: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek">,
): OneWeekVisit[] | null {
  if (!after.groupId) return null;
  const kept = (place.visits ?? []).filter((visit) => visit.groupId !== ownGroupForWeek(after, visit.weekNumber));
  return kept.length > 0 ? kept.map((visit) => ({ ...visit })) : null;
}
