import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { firstNameOfUser, namingProgrammeIn, type NamingProgramme } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { lineOf, wordsOf } from "@/lib/courses/registerCorrection/model";
import { standingFacilitators } from "@/lib/courses/registerCover/view";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { currentTimeAnswer, timeQuestionSinceOf } from "@/lib/courses/timeAnswer/model";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, normalizeCourseAttendance, type CourseAttendanceDoc, type LineSetterHow } from "@/lib/firestore/courseAttendance";
import { courseEnrolmentId, normalizeCourseEnrolment, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import {
  normalizeExcusedRequest,
  type ExcusedAsked,
  type ExcusedEvent,
  type ExcusedRegisterOutcome,
  type ExcusedRequestDoc,
} from "@/lib/firestore/courseExcusedRequests";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { COURSE_REQUESTS_COLLECTION, type CourseRequestStatus } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { ownRequestsIn } from "./ask";
import { facilitatorsToTell, stillBelongs } from "./decide";
import { approvalPlan, excusedKindOf, type ApprovalWrite } from "./model";
import { approvingWords, toldWords, type ExcusedKind } from "./words";

/**
 * A REQUEST TO BE EXCUSED, AS ADMINS READ IT: one request's page, its row on
 * the Requests page, and how often the person has been excused this term.
 *
 * ADMINS ONLY, everywhere here. The reason is the person's own words and is
 * read by admins, not the programme's lead, not a track lead, not a
 * facilitator; so is how often they have been excused. Anybody else is
 * answered `none`, as for a page that is not there.
 *
 * NAMES ONLY, by the names rule for the reader: never an address. Whether
 * the person will be emailed is a yes or no.
 */

export type Loaded<T> = { status: "ok"; view: T } | { status: "none" };

type Named = { uid: string; name: string };

/** The weeks somebody has been excused this term, each kind told apart. Admins only: a member is never sent a count. */
export type ExcusedThisTerm = {
  /** Every week, of every kind. */
  count: number;
  counts: Record<ExcusedKind, number>;
  weeks: { sessionKey: string; weekNumber: number; occurrence: number; dateKey: string; kind: ExcusedKind }[];
};

/** One week of the request, as its page shows it. */
export type ExcusedPageWeek = {
  sessionKey: string;
  weekNumber: number;
  occurrence: number;
  /** The session's date as the group's calendar dates it now; the date when asked if it no longer resolves. */
  dateKey: string;
  startTimeLocal: string;
  durationMinutes: number;
  room: string;
  cancelled: boolean;
  started: boolean;
  asked: ExcusedAsked;
  offered: { online: boolean };
  status: CourseRequestStatus;
  decidedBy: Named | null;
  decidedAt: string | null;
  reply: string;
  withdrawnAt: string | null;
  register: ExcusedRegisterOutcome | null;
  /** The person's line as the register says it now. */
  line: {
    now: string;
    finished: { by: Named; at: string } | null;
    setBy: { name: string; at: string; how: LineSetterHow } | null;
  };
  /** While it waits: what approving will do, and who it emails. */
  approving: {
    write: ApprovalWrite;
    words: string;
    emails: number;
    told: string;
    person: boolean;
    facilitators: Named[];
  } | null;
};

export type ExcusedRequestPageView = {
  id: string;
  kind: "excused";
  status: CourseRequestStatus;
  askedAt: string | null;
  subject: Named;
  programme: { roundId: string | null; programmeId: string | null; name: string };
  runId: string;
  group: { id: string; name: string };
  /** The group's facilitators who stand behind the role. */
  facilitators: Named[];
  /** The person's words; "" once the programme closed and it was deleted. */
  reason: string;
  reasonGoneAt: string | null;
  weeks: ExcusedPageWeek[];
  replies: { text: string; by: Named; at: string }[];
  /** How often they have been excused this term, apart from this request's own weeks. */
  excusedBefore: ExcusedThisTerm;
  history: { what: ExcusedEvent; by: Named; at: string; sessionKey: string | null }[];
  /** A week of it waits, and the reader did not ask it. */
  canDecide: boolean;
  /** The person still holds an active place in the group, and the group is not archived: approving is refused otherwise. */
  belongs: boolean;
  yours: boolean;
};

/** Most registers read for one person's group: a run has a few dozen sessions. */
const MAX_SESSIONS = 60;

async function readRunGroup(db: Firestore, runId: string, groupId: string): Promise<{ run: CourseRunDoc; group: CourseGroupDoc } | null> {
  if (!isAddressableId(runId) || !isAddressableId(groupId)) return null;
  const [runSnap, groupSnap] = await Promise.all([db.collection("courseRuns").doc(runId).get(), db.collection("courseGroups").doc(groupId).get()]);
  if (!runSnap.exists || runSnap.data()?.destroying === true || !groupSnap.exists) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  return group.runId === run.id ? { run, group } : null;
}

/** The group's sessions from a week on, and their registers, by session key. */
async function registersFrom(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  fromWeek: number,
): Promise<{ sessions: ResolvedSession[]; registers: Map<string, CourseAttendanceDoc> }> {
  const sessions = resolveSessions(run, group)
    .filter((session) => session.weekNumber >= fromWeek)
    .slice(0, MAX_SESSIONS);
  const refs = sessions.map((session) =>
    db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence)),
  );
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const registers = new Map<string, CourseAttendanceDoc>();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const register = normalizeCourseAttendance(snap.id, snap.data() ?? {});
    registers.set(register.sessionKey, register);
  }
  return { sessions, registers };
}

/**
 * How often somebody has been excused this term (this run), and which
 * weeks: approved weeks of their requests, sessions they ticked under "Most
 * weeks, not all", and sessions they said in advance before requests, each
 * kind told apart. `except` leaves out one request's own weeks. Pure.
 */
export function excusedThisTermOf(input: {
  uid: string;
  sessions: readonly ResolvedSession[];
  registers: ReadonlyMap<string, CourseAttendanceDoc>;
  requests: readonly ExcusedRequestDoc[];
  seat: Pick<CourseEnrolmentDoc, "role" | "status" | "groupId" | "timeAnswer"> | null;
  group: Pick<CourseGroupDoc, "timeQuestionSince"> | null;
  except?: string | null;
}): ExcusedThisTerm {
  const { uid } = input;
  const answer = input.seat ? currentTimeAnswer(input.seat, timeQuestionSinceOf(input.group)) : null;
  const ticked = new Set(answer?.kind === "mostWeeks" ? answer.sessionKeys : []);
  const approvedKeys = new Set<string>();
  const excepted = new Set<string>();
  for (const request of input.requests) {
    if (request.subjectUid !== uid) continue;
    for (const week of request.weeks) {
      if (request.id === input.except) excepted.add(week.sessionKey);
      else if (week.status === "approved") approvedKeys.add(week.sessionKey);
    }
  }
  const weeks: ExcusedThisTerm["weeks"] = [];
  const counts: Record<ExcusedKind, number> = { approved: 0, "time-set": 0, "in-advance": 0 };
  for (const session of input.sessions) {
    if (excepted.has(session.sessionKey) && !approvedKeys.has(session.sessionKey)) continue;
    const register = input.registers.get(session.sessionKey);
    const kind = excusedKindOf({
      approved: approvedKeys.has(session.sessionKey),
      mark: register?.records[uid] ?? null,
      toldAt: register?.excusedInAdvance[uid] ?? null,
      ticked: ticked.has(session.sessionKey),
    });
    if (!kind) continue;
    counts[kind] += 1;
    weeks.push({ sessionKey: session.sessionKey, weekNumber: session.weekNumber, occurrence: session.occurrence, dateKey: session.dateKey, kind });
  }
  return { count: weeks.length, counts, weeks };
}

/** ONE REQUEST'S PAGE, for admins. */
export async function loadExcusedRequestPage(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  now: Date,
): Promise<Loaded<ExcusedRequestPageView>> {
  if (actor.role !== "admin") return { status: "none" };
  if (!isAddressableId(requestId) || requestId.length > 128) return { status: "none" };
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const request = snap.exists ? normalizeExcusedRequest(snap.id, snap.data() ?? {}) : null;
  if (!request || !request.groupId || !request.runId || !request.subjectUid) return { status: "none" };
  const both = await readRunGroup(db, request.runId, request.groupId);
  if (!both) return { status: "none" };
  const { run, group } = both;

  const [forms, seatSnap, others, facilitators, standing] = await Promise.all([
    listForms(db),
    db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, request.subjectUid)).get(),
    ownRequestsIn(null, db, request.subjectUid, run.id),
    facilitatorsToTell(db, group, [request.subjectUid, actor.uid]),
    standingFacilitators(db, group, { isAdmin: true, role: actor.role }),
  ]);
  const seat = seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
  const fromWeek = Math.min(seat?.joinedWeekNumber ?? 1, ...request.weeks.map((week) => week.weekNumber));
  const { sessions, registers } = await registersFrom(db, run, group, fromWeek);

  // Everybody named, read once, named for the reader: never an address.
  const uids = new Set<string>([request.subjectUid, ...group.facilitatorUids]);
  for (const week of request.weeks) if (week.decidedByUid) uids.add(week.decidedByUid);
  for (const reply of request.replies) uids.add(reply.byUid);
  for (const entry of request.history) uids.add(entry.byUid);
  for (const week of request.weeks) {
    const register = registers.get(week.sessionKey);
    const setter = register?.setBy[request.subjectUid];
    if (setter) uids.add(setter.byUid);
    if (register?.pushedByUid) uids.add(register.pushedByUid);
  }
  const wanted = [...uids].filter(isAddressableId);
  const userSnaps = wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : [];
  const names = new Map<string, string>();
  let personFirstName = "";
  let personHasAddress = false;
  for (const user of userSnaps) {
    if (!user.exists) continue;
    const data = user.data() ?? {};
    names.set(user.id, nameForViewer(actor, accountNamesOf(data), "NAISI member"));
    if (user.id === request.subjectUid) {
      personFirstName = firstNameOfUser(data);
      personHasAddress = typeof data.email === "string" && data.email.trim() !== "";
    }
  }
  const named = (uid: string): Named => ({ uid, name: names.get(uid) ?? "NAISI member" });
  const facilitatorFirstNames = facilitators.map((each) => each.firstName);

  const weeks: ExcusedPageWeek[] = request.weeks.map((week) => {
    const session = sessions.find((each) => each.sessionKey === week.sessionKey) ?? null;
    const register = registers.get(week.sessionKey) ?? null;
    const line = register ? lineOf(register, request.subjectUid) : { mark: null, online: false };
    const mark = line.mark;
    const setter = register?.setBy[request.subjectUid] ?? null;
    const { startsAt } = session ? sessionInstants(session) : { startsAt: null };
    let approving: ExcusedPageWeek["approving"] = null;
    if (week.status === "waiting") {
      const plan = approvalPlan({
        startsAt,
        cancelled: !session || session.cancelled,
        line: { finished: Boolean(register?.pushedAt), notHeld: register ? !register.held : false, mark },
        now,
      });
      const told = plan.tellsFacilitators ? facilitators : [];
      approving = {
        write: plan.write,
        words: approvingWords({
          write: plan.write,
          kept: plan.kept,
          started: startsAt !== null && startsAt.getTime() <= now.getTime(),
          personFirstName,
          facilitatorFirstNames,
        }),
        emails: (personHasAddress ? 1 : 0) + told.length,
        told: toldWords(personHasAddress ? personFirstName : null, told.map((each) => each.firstName)),
        person: personHasAddress,
        facilitators: told.map((each) => named(each.uid)),
      };
    }
    return {
      sessionKey: week.sessionKey,
      weekNumber: week.weekNumber,
      occurrence: week.occurrence,
      dateKey: session?.dateKey ?? week.dateKey,
      startTimeLocal: session?.session.startTimeLocal ?? "",
      durationMinutes: session?.session.durationMinutes ?? 0,
      room: session?.session.location.trim() ?? "",
      cancelled: !session || session.cancelled,
      started: startsAt !== null && startsAt.getTime() <= now.getTime(),
      asked: week.asked,
      offered: { online: week.offered.online },
      status: week.status,
      decidedBy: week.decidedByUid ? named(week.decidedByUid) : null,
      decidedAt: week.decidedAt ? week.decidedAt.toISOString() : null,
      reply: week.reply,
      withdrawnAt: week.withdrawnAt ? week.withdrawnAt.toISOString() : null,
      register: week.register,
      line: {
        now: wordsOf(line),
        finished: register?.pushedAt && register.pushedByUid ? { by: named(register.pushedByUid), at: register.pushedAt.toISOString() } : null,
        setBy: setter ? { name: named(setter.byUid).name, at: setter.at.toISOString(), how: setter.how } : null,
      },
      approving,
    };
  });

  const naming = namingProgrammeIn(forms, run.id);
  return {
    status: "ok",
    view: {
      id: request.id,
      kind: "excused",
      status: request.status,
      askedAt: request.askedAt ? request.askedAt.toISOString() : null,
      subject: named(request.subjectUid),
      programme: { roundId: request.roundId, programmeId: request.programmeId, name: (naming?.shortName ?? "").trim() || run.courseTitle || "" },
      runId: run.id,
      group: { id: group.id, name: group.name.trim() || "Untitled group" },
      facilitators: standing.map((each) => ({ uid: each.uid, name: each.name })),
      reason: request.reason,
      reasonGoneAt: request.reasonGoneAt ? request.reasonGoneAt.toISOString() : null,
      weeks,
      replies: request.replies.map((reply) => ({ text: reply.text, by: named(reply.byUid), at: reply.at.toISOString() })),
      excusedBefore: excusedThisTermOf({
        uid: request.subjectUid,
        sessions,
        registers,
        requests: others,
        seat,
        group,
        except: request.id,
      }),
      history: request.history.map((entry) => ({ what: entry.what, by: named(entry.byUid), at: entry.at.toISOString(), sessionKey: entry.sessionKey })),
      canDecide: request.status === "waiting" && request.askedByUid !== actor.uid,
      belongs: stillBelongs(seat, group),
      yours: request.askedByUid === actor.uid,
    },
  };
}

// ---------------------------------------------------------------------------
// The Requests page: excused requests are admins' rows only
// ---------------------------------------------------------------------------

/** An excused request as a row of the Requests page (`loadRequestsPage`'s `RequestRow`, with its weeks). */
export type ExcusedRow = {
  id: string;
  kind: "excused";
  status: CourseRequestStatus;
  state: "waiting" | "approved" | "declined" | "withdrawn";
  askedBy: Named;
  askedAt: string | null;
  subject: Named;
  programme: { roundId: string | null; programmeId: string | null; name: string };
  runId: string;
  group: { id: string; name: string };
  /** The first week asked about. */
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  /** "" and "Excused": what a correction's row says as from and to. */
  from: string;
  to: string;
  handling: null;
  mine: false;
  decidedBy: Named | null;
  decidedAt: string | null;
  /** Every week of it, with where each stands. */
  weeks: { sessionKey: string; weekNumber: number; occurrence: number; dateKey: string; state: CourseRequestStatus }[];
};

/** The rows of these excused requests, for an admin. Never the reason. */
export async function excusedRequestRows(
  db: Firestore,
  requests: readonly ExcusedRequestDoc[],
  naming: ReadonlyMap<string, NamingProgramme>,
  viewer: SessionUser,
): Promise<ExcusedRow[]> {
  if (viewer.role !== "admin" || requests.length === 0) return [];
  const groupIds = [...new Set(requests.map((each) => each.groupId))].filter(isAddressableId);
  const runIds = [...new Set(requests.map((each) => each.runId))].filter(isAddressableId);
  const uids = new Set<string>();
  for (const each of requests) {
    uids.add(each.subjectUid);
    for (const week of each.weeks) if (week.decidedByUid) uids.add(week.decidedByUid);
    if (each.decidedByUid) uids.add(each.decidedByUid);
  }
  const wanted = [...uids].filter(isAddressableId);
  const [groupSnaps, runSnaps, userSnaps] = await Promise.all([
    groupIds.length ? db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id))) : Promise.resolve([]),
    runIds.length ? db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))) : Promise.resolve([]),
    wanted.length ? db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : Promise.resolve([]),
  ]);
  const groups = new Map<string, CourseGroupDoc>();
  for (const snap of groupSnaps) if (snap.exists) groups.set(snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {}));
  const runs = new Map<string, CourseRunDoc>();
  for (const snap of runSnaps) if (snap.exists && snap.data()?.destroying !== true) runs.set(snap.id, normalizeCourseRun(snap.id, snap.data() ?? {}));
  const names = new Map<string, string>();
  for (const snap of userSnaps) if (snap.exists) names.set(snap.id, nameForViewer(viewer, accountNamesOf(snap.data() ?? {}), "NAISI member"));
  const named = (uid: string): Named => ({ uid, name: names.get(uid) ?? "NAISI member" });

  return requests.map((request) => {
    const group = groups.get(request.groupId);
    const run = runs.get(request.runId);
    const sessions = run && group ? resolveSessions(run, group) : [];
    const dateOf = (key: string, stored: string) => sessions.find((each) => each.sessionKey === key)?.dateKey ?? stored;
    const first = request.weeks[0];
    const programmeNaming = naming.get(request.runId) ?? null;
    return {
      id: request.id,
      kind: "excused" as const,
      status: request.status,
      state: request.status,
      askedBy: named(request.askedByUid),
      askedAt: request.askedAt ? request.askedAt.toISOString() : null,
      subject: named(request.subjectUid),
      programme: { roundId: request.roundId, programmeId: request.programmeId, name: (programmeNaming?.shortName ?? "").trim() || run?.courseTitle || "" },
      runId: request.runId,
      group: { id: request.groupId, name: group?.name.trim() || "Untitled group" },
      weekNumber: first.weekNumber,
      occurrence: first.occurrence,
      dateKey: dateOf(first.sessionKey, first.dateKey),
      from: "",
      to: "Excused",
      handling: null,
      mine: false as const,
      decidedBy: request.decidedByUid ? named(request.decidedByUid) : null,
      decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
      weeks: request.weeks.map((week) => ({
        sessionKey: week.sessionKey,
        weekNumber: week.weekNumber,
        occurrence: week.occurrence,
        dateKey: dateOf(week.sessionKey, week.dateKey),
        state: week.status,
      })),
    };
  });
}
