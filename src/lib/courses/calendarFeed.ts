import "server-only";
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import type { IcsEvent } from "@/lib/events/ics";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  normalizeCourseEnrolment,
  placementIsTold,
} from "@/lib/firestore/courseEnrolments";
import {
  GROUP_FIELD_LIMITS,
  normalizeCourseGroup,
  sessionChangeForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, validateSubmissionUrl, type CourseRunDoc } from "@/lib/firestore/courses";
import { campusLabel } from "./campus";
import { programmePageAddress } from "./calendarLink";
import { JOIN_ON_SITE, cancelledTitle, joinWords, sessionTitle, type CalendarLineGroup } from "./calendarWords";
import { sessionsFromJoinWeek } from "./ownAttendance";
import { resolveSessions, sessionInstants, type ResolvedSession } from "./sessions";

/**
 * WHAT ONE PERSON'S CALENDAR LINK HOLDS: every session of every group Publish
 * has told them about, worked out the way every page of the site works a
 * group's sessions out (`resolveSessions`, `sessionInstants`), with each
 * week's move, online week and cancellation applied.
 *
 * ── WHOSE SESSIONS ──────────────────────────────────────────────────────────
 *  - A SEAT: their own learner row on a run, told (`placementIsTold`: a
 *    placement Publish has not told them about adds nothing of that run), from
 *    the week they joined. A seat that has LEFT (withdrawn by them, or removed
 *    by staff) keeps only the sessions that started before the day it left,
 *    and none when no day is recorded.
 *  - A GROUP THEY FACILITATE: every session of it. One more query
 *    (`facilitatorUids` array-contains, the automatic index), because a
 *    facilitator sees their group, its day, time and room, from the moment
 *    they are added.
 *  - Never a draft or cancelled run, a run being destroyed, or an archived
 *    group; and nothing at all while the account does not stand
 *    (`isNamedWithStanding`, the run routes' own floor).
 *
 * ── WHAT EACH SESSION SAYS ──────────────────────────────────────────────────
 * Its date and time; the programme and the group ("AGI Strategy · Group B");
 * the week's own room, or while there is none the group's campus ("Jubilee");
 * and for an online week "Join on naisi.uk" with the
 * person's programme page, which is where the session ticket's own Join
 * online is. ONLINE is the ticket's doctrine (`ticketFacts`): the week is held
 * online, or nothing is set for it and the session has a link to join. The
 * link itself is only ever asked about, in one line, and never put in the
 * calendar: the calendar leaves the site, and the link to a call stays on it
 * (Q23). Nobody is named, so no name and no address is in the calendar.
 *
 * An evening cancelled through Change a session stays, marked CANCELLED, so a
 * calendar shows it as off rather than losing it; a week pushed back moves.
 *
 * ── STABLE, SO A CHANGE LANDS ───────────────────────────────────────────────
 * Each session's UID is a hash of its run, group and session key, the same
 * from one fetch to the next and carrying neither id nor person, so a
 * calendar moves the entry it holds. Its SEQUENCE and LAST-MODIFIED are the
 * latest of the run's, the group's and the week's own change stamps, each of
 * which every writer of a session's day, time, room or plan moves.
 */

/** A person's whole calendar, and the line the dialog says about it. */
export type CalendarFeed = {
  /** In start order. */
  events: IcsEvent[];
  /**
   * The groups the person is still in (a live seat, or one they facilitate)
   * whose sessions the calendar holds, in the order their first session falls,
   * for the dialog's count. A seat that has left adds none.
   */
  groups: CalendarLineGroup[];
};

/** At most this many seats and facilitated groups are read: a person holds a handful. */
const MAX_ROWS = 50;

type Seat = {
  runId: string;
  groupId: string;
  /** The first week of theirs, for a learner; 1 for a facilitator. */
  fromWeek: number;
  /** A session starting at or after this is not theirs: the day they left. Null for no end. */
  until: Date | null;
  /** Still in the group: counted on the dialog's line. */
  live: boolean;
};

/** A run whose sessions a calendar may show: dated and not called off. */
function runShows(run: CourseRunDoc, raw: Record<string, unknown>): boolean {
  if (raw.destroying === true) return false;
  return run.status !== "draft" && run.status !== "cancelled";
}

/** The latest of the stamps a session's day, time, room or plan moves with. */
function changedAt(run: CourseRunDoc, group: CourseGroupDoc, session: ResolvedSession): Date | null {
  const stamps = [run.updatedAt, group.updatedAt, sessionChangeForWeek(group, session.weekId)?.at];
  let latest: Date | null = null;
  for (const stamp of stamps) {
    if (stamp instanceof Date && !Number.isNaN(stamp.getTime()) && (!latest || stamp > latest)) latest = stamp;
  }
  return latest;
}

/** The session's UID: its run, group and session key, hashed. */
function sessionUid(run: CourseRunDoc, group: CourseGroupDoc, session: ResolvedSession): string {
  return createHash("sha256").update(`${run.id}\n${group.id}\n${session.sessionKey}`).digest("hex").slice(0, 32);
}

/**
 * One session as the calendar says it. The room is left out of an online
 * week, and the link to join is never put in: whether there is one is asked,
 * as the ticket asks it, to say where to join. With no room and nowhere to
 * join, the group's campus is where it meets.
 */
function eventOf(
  run: CourseRunDoc,
  group: CourseGroupDoc,
  session: ResolvedSession,
  title: string,
  pageUrl: string | null,
  startsAt: Date,
  endsAt: Date,
): IcsEvent {
  const slot = session.session;
  const mode = session.occurrence === 1 ? sessionModeForWeek(group, session.weekId) : null;
  const hasLink = typeof slot.meetingUrl === "string" && validateSubmissionUrl(slot.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl) === null;
  const online = mode === "virtual" || (mode === null && hasLink);
  // The week's own room; while there is none, and the week is not online,
  // the group's campus stands in for it.
  const room =
    mode !== "virtual" && slot.location.trim()
      ? slot.location.trim()
      : !online
        ? campusLabel(group.campus) || null
        : null;
  return {
    uid: sessionUid(run, group, session),
    title: session.cancelled ? cancelledTitle(title) : title,
    startAt: startsAt,
    endAt: endsAt,
    location: room ?? (online ? JOIN_ON_SITE : undefined),
    description: online && !session.cancelled ? joinWords(pageUrl) : undefined,
    url: pageUrl ?? undefined,
    updatedAt: changedAt(run, group, session),
    status: session.cancelled ? "cancelled" : "confirmed",
  };
}

/**
 * The person's calendar, past sessions and future ones alike. `owner` is the
 * person as their account stands (the session, or `standingUserOf` their
 * stored account).
 */
export async function readCalendarFeed(db: Firestore, owner: SessionUser): Promise<CalendarFeed> {
  const [enrolSnap, facilitatedSnap] = await Promise.all([
    db.collection("courseEnrolments").where("uid", "==", owner.uid).limit(MAX_ROWS).get(),
    db.collection("courseGroups").where("facilitatorUids", "array-contains", owner.uid).limit(MAX_ROWS).get(),
  ]);

  const seats = new Map<string, Seat>();
  const groupById = new Map<string, CourseGroupDoc>();

  // The groups they facilitate: every session, from the start.
  for (const doc of facilitatedSnap.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (group.archived) continue;
    if (!isNamedWithStanding(owner, "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    groupById.set(group.id, group);
    seats.set(group.id, { runId: group.runId, groupId: group.id, fromWeek: 1, until: null, live: true });
  }

  // Their seats: told, from the week they joined, and up to the day they left.
  for (const doc of enrolSnap.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (seat.uid !== owner.uid || seat.role !== "learner" || !seat.groupId) continue;
    if (!placementIsTold(seat)) continue;
    if (!isNamedWithStanding(owner, "courseEnrolments.uid", seat.uid)) continue;
    // A group they facilitate is already theirs whole.
    if (seats.has(seat.groupId)) continue;
    const live = seat.status === "active" || seat.status === "completed";
    if (!live && !seat.droppedOutAt) continue;
    seats.set(seat.groupId, {
      runId: seat.runId,
      groupId: seat.groupId,
      fromWeek: seat.joinedWeekNumber,
      until: live ? null : seat.droppedOutAt,
      live,
    });
  }
  if (seats.size === 0) return { events: [], groups: [] };

  const missingGroupIds = [...seats.keys()].filter((id) => !groupById.has(id));
  const runIds = [...new Set([...seats.values()].map((seat) => seat.runId).filter(Boolean))];
  const [groupSnaps, runSnaps] = await Promise.all([
    missingGroupIds.length
      ? db.getAll(...missingGroupIds.map((id) => db.collection("courseGroups").doc(id)))
      : Promise.resolve([]),
    runIds.length ? db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))) : Promise.resolve([]),
  ]);
  for (const snap of groupSnaps) {
    if (snap.exists) groupById.set(snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {}));
  }
  const runById = new Map<string, CourseRunDoc>();
  for (const snap of runSnaps) {
    if (!snap.exists) continue;
    const raw = snap.data() ?? {};
    const run = normalizeCourseRun(snap.id, raw);
    if (runShows(run, raw)) runById.set(run.id, run);
  }

  // The programme each run belongs to, for each session's title. A form that
  // cannot be read leaves the course's own title.
  const programmeOf = new Map<string, string>();
  await Promise.all(
    [...runById.values()].map(async (run) => {
      const programme = await runProgrammeOf(db, run.id).catch(() => null);
      programmeOf.set(run.id, programme?.shortName.trim() || run.courseTitle.trim());
    }),
  );

  const events: IcsEvent[] = [];
  const groups: Array<CalendarLineGroup & { firstStart: number }> = [];
  for (const seat of seats.values()) {
    const run = runById.get(seat.runId);
    const group = groupById.get(seat.groupId);
    if (!run || !group || group.archived || group.runId !== run.id) continue;
    const programmeName = programmeOf.get(run.id) ?? run.courseTitle;
    const title = sessionTitle(programmeName, group.name);
    const pageUrl = programmePageAddress(run.id);

    let count = 0;
    let first: { at: number; dateKey: string } | null = null;
    for (const session of sessionsFromJoinWeek(resolveSessions(run, group), seat.fromWeek)) {
      const { startsAt, endsAt } = sessionInstants(session);
      if (!startsAt || !endsAt) continue;
      if (seat.until && startsAt.getTime() >= seat.until.getTime()) continue;
      events.push(eventOf(run, group, session, title, pageUrl, startsAt, endsAt));
      if (session.cancelled) continue;
      count += 1;
      if (!first || startsAt.getTime() < first.at) first = { at: startsAt.getTime(), dateKey: session.dateKey };
    }
    if (seat.live && first && count > 0) {
      groups.push({
        programmeName,
        groupName: group.name,
        count,
        weekday: group.session.weekday,
        startTimeLocal: group.session.startTimeLocal,
        firstDateKey: first.dateKey,
        firstStart: first.at,
      });
    }
  }

  events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.uid.localeCompare(b.uid));
  groups.sort((a, b) => a.firstStart - b.firstStart);
  return { events, groups: groups.map(({ firstStart: _firstStart, ...group }) => group) };
}
