import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { facilitatesGroup, takesPartIn } from "@/lib/courses/cantMakeIt/seat";
import { hasGroupsByWeek, sessionsWithGroup } from "@/lib/courses/groupsByWeek";
import { heldOnline } from "@/lib/courses/joiningOnline/model";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { currentTimeAnswer, timeQuestionSinceOf } from "@/lib/courses/timeAnswer/model";
import { workClosesAt } from "@/lib/courses/weekWork/closes";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, cameBy } from "@/lib/firestore/courseAttendance";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { ExcusedRequestDoc } from "@/lib/firestore/courseExcusedRequests";
import {
  campusForWeek,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import type { CourseRequestStatus } from "@/lib/firestore/courseRequests";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { excuseLineOf, ownRequestsIn } from "./ask";
import { askState, excusedKindOf, onlineOfferedFor, requestStandingOf, standingWeek, weeksAbout, type AskClosed } from "./model";

/**
 * ONE PERSON'S OWN EXCUSED WEEKS, for their programme page: for each session
 * of their group they are due at, what its card needs, and a short list of
 * their own requests. Their own records only, read by their own uid.
 *
 * EACH WEEK FROM THE GROUP THEY WERE IN THAT WEEK: somebody whose place
 * records a move has the old group's sessions, read off its registers, for
 * the weeks before it, and nothing is offered to ask about those (a request
 * is asked of the group they are in now). With no record, every session is
 * their group's, as always.
 *
 * WHAT EACH SESSION SAYS:
 *  - `excuse`: asked and waiting (with when they asked, and their own reason
 *    while it is kept); excused by an approval (who approved, when, the
 *    reply); declined (who, when, the reply); withdrawn; excused because they
 *    ticked it under "Most weeks, not all" ("said when the time was set");
 *    or excused on their own word in advance before requests existed ("said
 *    in advance, before requests"). Null with none of these.
 *  - `register`: what their own line says once the register is finished
 *    (absent, excused, or that they came); null before. As their list of
 *    sessions: a member never sees a draft.
 *  - `ask`: whether they may ask about it now, and if not why.
 *  - `first`: what the flow offers before the request: joining online, where
 *    the session is in a room and has not started. Going to another group's
 *    session that week needs one-week visits, which do not exist yet: when
 *    they do, `first` gains the sessions offered, beside `online`.
 *
 * NEVER A COUNT. How often somebody has been excused is for admins
 * (`page.ts`); nothing here adds weeks up.
 *
 * Null for anybody who does not hold a told place in a group of the run.
 * Somebody who facilitates their group gets the view with `asks: false`:
 * they keep the instant "Can't make it".
 */

export type OwnExcuse =
  | { kind: "waiting"; requestId: string; askedAt: string | null; reason: string }
  | { kind: "approved"; requestId: string; by: { firstName: string } | null; at: string | null; reply: string }
  | { kind: "declined"; requestId: string; by: { firstName: string } | null; at: string | null; reply: string }
  | { kind: "withdrawn"; requestId: string; at: string | null }
  | { kind: "time-set" }
  | { kind: "in-advance"; at: string }
  | { kind: "before-requests"; at: string };

/**
 * `another-group`: a session of a week they spent in another group than the
 * one they are in now (their place records a move). A request is asked of
 * the group they are in now, so none is offered about it here.
 */
export type OwnAsk =
  | { open: true; when: "before" | "after" }
  | { open: false; why: AskClosed | "closed" | "facilitates" | "another-group" };

export type OwnExcusedSession = {
  sessionKey: string;
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  startsAt: string | null;
  endsAt: string | null;
  started: boolean;
  ended: boolean;
  cancelled: boolean;
  /** Their own line once the register is finished; null before. */
  register: "absent" | "excused" | "came" | null;
  excuse: OwnExcuse | null;
  ask: OwnAsk;
  /** What the flow offers first: joining online where that is a real choice (`onlineOfferedFor`). */
  first: { online: boolean };
};

export type OwnExcusedRequest = {
  id: string;
  askedAt: string | null;
  status: CourseRequestStatus;
  weeks: {
    sessionKey: string;
    weekNumber: number;
    occurrence: number;
    dateKey: string;
    state: CourseRequestStatus;
    /** When it was decided or withdrawn. */
    at: string | null;
    by: { firstName: string } | null;
    reply: string;
  }[];
};

export type ExcusedOwnView = {
  runId: string;
  groupId: string;
  /** False for somebody who facilitates the group: no request is theirs to make. */
  asks: boolean;
  closesAt: string | null;
  closed: boolean;
  sessions: OwnExcusedSession[];
  /** Their own requests on this run, newest first, at most `OWN_LIST`. */
  requests: OwnExcusedRequest[];
};

/** How many of their own requests the list carries. */
export const OWN_LIST = 10;

function sessionHeldOnline(group: CourseGroupDoc, session: ResolvedSession): boolean {
  const mode = session.occurrence === 1 ? sessionModeForWeek(group, session.weekId) : null;
  const campus = session.occurrence === 1 ? campusForWeek(group, session.weekId) : group.campus;
  return heldOnline({ mode, campus, room: session.session.location });
}

const iso = (at: Date | null): string | null => (at ? at.toISOString() : null);

export async function excusedFor(
  db: Firestore,
  input: { user: SessionUser; run: CourseRunDoc; enrolment: CourseEnrolmentDoc | null; groups: readonly CourseGroupDoc[]; now: Date },
): Promise<ExcusedOwnView | null> {
  const { user, run, now } = input;
  const seat = input.enrolment;
  if (!seat?.groupId) return null;
  const group = input.groups.find((each) => each.id === seat.groupId);
  if (!group || !takesPartIn(user, seat, group, run.id)) return null;
  const asks = !facilitatesGroup(user, group);
  const closesAtDate = workClosesAt(run, input.groups.filter((each) => !each.archived));
  const closed = closesAtDate !== null && now.getTime() >= closesAtDate.getTime();

  // Each week's session from the group they were in that week, and its line
  // from that group's register (`sessionsWithGroup`). A week in a group that
  // no longer meets has no session here. With no record of groups by week,
  // their group's sessions, as always.
  const live = (groupId: string) =>
    input.groups.find((each) => each.id === groupId && each.runId === run.id && !each.archived) ?? null;
  const paired = (
    hasGroupsByWeek(seat)
      ? sessionsWithGroup(seat, (groupId) => {
          const each = live(groupId);
          return each ? resolveSessions(run, each) : null;
        })
      : resolveSessions(run, group).map((session) => ({ groupId: group.id, session }))
  ).filter((each) => each.session.weekNumber >= seat.joinedWeekNumber);
  const sessions = paired.map((each) => each.session);
  const refs = paired.map(({ groupId, session }) =>
    db.collection("courseAttendance").doc(attendanceDocId(run.id, groupId, session.weekNumber, session.occurrence)),
  );
  const [snaps, requests] = await Promise.all([refs.length ? db.getAll(...refs) : Promise.resolve([]), ownRequestsIn(null, db, user.uid, run.id)]);

  // Who decided, by first name: never anything else of theirs.
  const deciders = [...new Set(requests.flatMap((request) => request.weeks.map((week) => week.decidedByUid ?? "")))].filter(
    (uid) => uid && isAddressableId(uid),
  );
  const deciderSnaps = deciders.length ? await db.getAll(...deciders.map((uid) => db.collection("users").doc(uid))) : [];
  const firstNames = new Map(deciderSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, firstNameOfUser(snap.data() ?? {})]));
  const by = (uid: string | null) => (uid ? { firstName: firstNames.get(uid) ?? "" } : null);

  const answer = currentTimeAnswer(seat, timeQuestionSinceOf(group));
  const ticked = new Set(answer?.kind === "mostWeeks" ? answer.sessionKeys : []);
  // Ticks from an answer to an earlier asking of the time question, kept on
  // a week a new regular time did not move: said in advance, not "before requests".
  const stored = currentTimeAnswer(seat, null);
  const tickedBefore = new Set(stored?.kind === "mostWeeks" ? stored.sessionKeys : []);

  const out: OwnExcusedSession[] = sessions.map((session, at) => {
    const snap = snaps[at];
    const line = excuseLineOf(snap?.exists ? snap.data() : undefined, refs[at].id, user.uid);
    const { startsAt, endsAt } = sessionInstants(session);
    const weeks = weeksAbout(requests, user.uid, session.sessionKey);
    const standing = standingWeek(weeks);
    // The group whose session this is: theirs now, or, for a week their
    // place records them in another group, that group. The answer to "Can
    // you make this time?" is about the group they are in now, so its ticks
    // are read on that group's sessions alone.
    const ownGroupsSession = paired[at].groupId === group.id;
    const sessionGroup = ownGroupsSession ? group : (live(paired[at].groupId) ?? group);
    let excuse: OwnExcuse | null = null;
    if (standing?.week.status === "waiting") {
      excuse = { kind: "waiting", requestId: standing.request.id, askedAt: iso(standing.request.askedAt), reason: standing.request.reason };
    } else if (standing?.week.status === "approved") {
      excuse = { kind: "approved", requestId: standing.request.id, by: by(standing.week.decidedByUid), at: iso(standing.week.decidedAt), reply: standing.week.reply };
    } else if (line.mark === "excused" && line.toldAt) {
      const kind = excusedKindOf({
        approved: false,
        mark: line.mark,
        toldAt: line.toldAt,
        ticked: ownGroupsSession && ticked.has(session.sessionKey),
        tickedBefore: ownGroupsSession && tickedBefore.has(session.sessionKey),
      });
      excuse = kind === "time-set" ? { kind: "time-set" } : { kind: kind === "before-requests" ? "before-requests" : "in-advance", at: line.toldAt.toISOString() };
    } else if (standing?.week.status === "declined") {
      excuse = { kind: "declined", requestId: standing.request.id, by: by(standing.week.decidedByUid), at: iso(standing.week.decidedAt), reply: standing.week.reply };
    } else if (standing?.week.status === "withdrawn") {
      excuse = { kind: "withdrawn", requestId: standing.request.id, at: iso(standing.week.withdrawnAt) };
    }
    const state = askState({
      startsAt,
      cancelled: session.cancelled,
      line,
      standing: requestStandingOf(weeks),
      now,
    });
    const ask: OwnAsk = !asks
      ? { open: false, why: "facilitates" }
      : !ownGroupsSession
        ? { open: false, why: "another-group" }
        : closed && state.open
          ? { open: false, why: "closed" }
          : state;
    return {
      sessionKey: session.sessionKey,
      weekNumber: session.weekNumber,
      occurrence: session.occurrence,
      dateKey: session.dateKey,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      started: startsAt !== null && startsAt.getTime() <= now.getTime(),
      ended: endsAt !== null && endsAt.getTime() <= now.getTime(),
      cancelled: session.cancelled,
      register: line.finished ? (line.mark === "absent" ? "absent" : line.mark === "excused" ? "excused" : cameBy(line.mark) ? "came" : null) : null,
      excuse,
      ask,
      first: {
        online: ask.open && onlineOfferedFor({ when: ask.when, heldOnline: sessionHeldOnline(sessionGroup, session) }),
      },
    };
  });

  const own: OwnExcusedRequest[] = [...requests]
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0))
    .slice(0, OWN_LIST)
    .map((request: ExcusedRequestDoc) => ({
      id: request.id,
      askedAt: iso(request.askedAt),
      status: request.status,
      weeks: request.weeks.map((week) => ({
        sessionKey: week.sessionKey,
        weekNumber: week.weekNumber,
        occurrence: week.occurrence,
        dateKey: week.dateKey,
        state: week.status,
        at: iso(week.decidedAt ?? week.withdrawnAt),
        by: by(week.decidedByUid),
        reply: week.reply,
      })),
    }));

  return {
    runId: run.id,
    groupId: group.id,
    asks,
    closesAt: iso(closesAtDate),
    closed,
    sessions: out,
    requests: own,
  };
}
