import "server-only";
import { MAX_OWN } from "@/lib/courses/excused/ask";
import { normalizeExcusedRequest, type ExcusedRequestDoc } from "@/lib/firestore/courseExcusedRequests";
import { normalizeMoveRequest, normalizeVisitRequest, type MoveRequestDoc, type VisitRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { excusalStandsFor } from "@/lib/courses/excused/marking";
import { factOf, requestStandingOf, weeksAbout } from "@/lib/courses/excused/model";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import type { DocumentReference, DocumentSnapshot, Firestore, Query, QuerySnapshot, Transaction } from "firebase-admin/firestore";
import { cardAsksFor } from "@/lib/courses/cantMakeIt/seat";
import { sayingOnlineOn, type SayingOnline } from "@/lib/courses/joiningOnline/seat";
import { firstNameOfUser, fullNameOfUser, readNamingProgramme, standingUserOf } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { campusLabel } from "@/lib/courses/campus";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { ATTENDANCE_LIMITS, attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  ownGroupForWeek,
  placementIsTold,
  visitInWeek,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { campusForWeek, compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { countsFromArchivedGroup } from "../archivedWeeks";
import { belonging, sessionsWithGroup } from "../groupsByWeek";
import { placeTakesMove, runMoveRefusal } from "../staffMove/plan";
import { facilitatesWords, notToldWords } from "../staffMove/words";
import { cancelDeadline, ownSessionThatWeek } from "./deadline";
import { peopleInWeek, placesLeftInWeek } from "./places";
import type { VisitLineView, VisitPreviewView, VisitSessionChoiceView, VisitStandingView, VisitWeekChoiceView } from "./view";
import {
  LINE_LABEL,
  VISIT_REFUSAL,
  alreadyMarkedWords,
  alreadyVisitingWords,
  excusedWaitingWords,
  ownStartedCallOffWords,
  arrangeButtonWords,
  callOffButtonWords,
  calledOffEmailWords,
  calledOffPersonEmailWords,
  homeEmailWords,
  joinOnlineLinesWords,
  hostArchivedWords,
  hostCancelledWords,
  hostEmailWords,
  hostHasNoneWords,
  hostIsOwnWords,
  hostNotHeldWords,
  hostStartedWords,
  lateLineWords,
  linkLineWords,
  noLongerHappeningWords,
  overLimitWords,
  replacesLineWords,
  ownWeekGoneWords,
  personEmailWords,
  visitRequestWaitingWords,
  withTheAdminsWords,
  readingLineWords,
  registerFullWords,
  registersLineWords,
  remindersLineWords,
  sessionChoiceWords,
  sessionDetailWords,
  standingWords,
  tooLateToCancelWords,
  toldLineWords,
  weekChoiceWords,
  weekLabel,
  weekLineWords,
  type VisitEmailFacts,
  type VisitEmailWords,
  type VisitSessionFacts,
} from "./words";

/**
 * A ONE-WEEK VISIT TO ANOTHER GROUP'S SESSION, ARRANGED BY STAFF: what a visit
 * WOULD do, and what calling one off would, worked out once from one read of
 * the facts for the page (`.../programmes/[programmeId]/people/[uid]/visit`),
 * the route's preview and the route's save, so the three can never say
 * different things. The save reads the same facts again inside its
 * transaction and asks the same functions.
 *
 * WHO MAY is the caller's (`loadProgrammeRun`: an admin or the programme's
 * lead), and for calling one off, also the person themselves (`./cancel.ts`).
 * NOTHING HERE WRITES OR EMAILS.
 *
 * WHO IS TOLD is decided by ONE function (`visitRecipients`): the person,
 * when staff arrange or call it off and they have an address; each
 * facilitator of the host group, then of the group they belong to that week,
 * who still stands behind the role and has an address, never the person and
 * never whoever pressed, once each (somebody who facilitates both is told as
 * one of the host's).
 */

export { cancelDeadline, ownSessionThatWeek };

/** A refusal: the status a route answers with and its one sentence. */
export type VisitRefusal = { ok: false; status: number; error: string; kind?: "too-late" | "no-visit" };

/** Somebody a visit's arranging or calling off emails. */
export type VisitRecipient = {
  uid: string;
  firstName: string;
  email: string;
  as: "person" | "host" | "home";
};

/** Everything read about the person and the run. */
export type VisitFacts = {
  run: CourseRunDoc;
  destroying: boolean;
  /** Every group of the run, archived ones included. */
  groups: CourseGroupDoc[];
  place: CourseEnrolmentDoc;
  person: { uid: string; name: string; firstName: string; email: string };
  /** The accounts of the person and every group's facilitators. */
  accounts: Map<string, Record<string, unknown>>;
  /** The run's active places, for who a session holds each week. */
  places: CourseEnrolmentDoc[];
  /** The registers read, by document id: their own group's and the hosts' for the weeks asked. */
  registers: Map<string, Record<string, unknown>>;
  /**
   * The run has one group that still meets (or is an incubator's): no visit
   * can be ARRANGED (`planVisit` refuses), and a visit that stands can still
   * be called off by staff.
   */
  oneGroup: boolean;
  /**
   * The person's requests to be excused on the run (`courseRequests`, two
   * equalities), paired with their own group's session of a week as every
   * reader pairs them (`weeksAbout`): one asked about a visit to another
   * group is not about theirs. A visit is not arranged for a week whose own
   * session has one waiting (it is decided first), or on which an excusal
   * stands (`excusalStandsFor`, the register's own rule).
   */
  requests: ExcusedRequestDoc[];
  /**
   * The person's own requests to go to another group's session on the run
   * (the same read, through the visit kind's own normaliser). A visit is not
   * arranged for a week one of them still waits about: it is decided first,
   * on the Requests page, unless it is the request being approved.
   */
  visitRequests: VisitRequestDoc[];
  /**
   * The person's own requests to change group for good on the run (the same
   * read, through the move kind's own normaliser): one request at a time, so
   * none of another kind is asked while one waits (`../requests/oneAtATime.ts`).
   */
  moveRequests: MoveRequestDoc[];
};

/**
 * THE ONE ANSWER THE PERSON'S OWN CANCEL GIVES for everything that is not
 * their own standing visit on a run they hold a place on: no run, a run they
 * hold no place on, a run over, archived or with one group, no visit that
 * week, or a visit that reads as none. Never a word about the run.
 */
export const MEMBER_NO_VISIT: VisitRefusal = { ok: false, status: 404, error: VISIT_REFUSAL.noVisit, kind: "no-visit" };

/** Where the facts are read from: the database, or a transaction (reads only). */
export type Reader = {
  getAll(refs: DocumentReference[]): Promise<DocumentSnapshot[]>;
  query(query: Query): Promise<QuerySnapshot>;
};

export function dbReader(db: Firestore): Reader {
  return { getAll: (refs) => (refs.length ? db.getAll(...refs) : Promise.resolve([])), query: (query) => query.get() };
}

export function txReader(tx: Transaction): Reader {
  return { getAll: (refs) => (refs.length ? tx.getAll(...refs) : Promise.resolve([])), query: (query) => tx.get(query) };
}

function emailOf(data: Record<string, unknown> | undefined): string {
  return typeof data?.email === "string" ? data.email.trim() : "";
}

/** A group's facilitators who still stand behind the role, by uid. */
function standingFacilitators(group: Pick<CourseGroupDoc, "facilitatorUids">, accounts: Map<string, Record<string, unknown>>): string[] {
  return group.facilitatorUids.filter((uid) => {
    const data = accounts.get(uid);
    return data !== undefined && isNamedWithStanding(standingUserOf(uid, data), "courseGroups.facilitatorUids", group.facilitatorUids);
  });
}

/** A group's facilitators by first name, never `reader`'s own. */
function facilitatorFirstNames(group: Pick<CourseGroupDoc, "facilitatorUids">, accounts: Map<string, Record<string, unknown>>, reader: string): string[] {
  return group.facilitatorUids
    .filter((uid) => uid !== reader)
    .map((uid) => {
      const data = accounts.get(uid);
      return data ? firstNameOfUser(data) : "";
    })
    .filter(Boolean);
}

/**
 * WHO A VISIT'S ARRANGING OR CALLING OFF EMAILS, the one answer the preview
 * and the send both ask: the person when `person` is handed (staff pressed)
 * and they have an address; then each facilitator of the host, then of the
 * group they belong to that week, standing and with an address, never the
 * person and never whoever pressed, once each.
 */
export function visitRecipients(input: {
  person: { uid: string; email: string; firstName: string } | null;
  personUid: string;
  host: Pick<CourseGroupDoc, "facilitatorUids">;
  home: Pick<CourseGroupDoc, "facilitatorUids">;
  accounts: Map<string, Record<string, unknown>>;
  actorUid: string;
}): VisitRecipient[] {
  const out: VisitRecipient[] = [];
  if (input.person?.email) out.push({ uid: input.person.uid, firstName: input.person.firstName, email: input.person.email, as: "person" });
  const seen = new Set([input.personUid, input.actorUid]);
  for (const [as, group] of [
    ["host", input.host],
    ["home", input.home],
  ] as const) {
    for (const uid of standingFacilitators(group, input.accounts)) {
      if (seen.has(uid)) continue;
      const data = input.accounts.get(uid);
      const email = emailOf(data);
      if (!email) continue;
      seen.add(uid);
      out.push({ uid, firstName: data ? firstNameOfUser(data) : "", email, as });
    }
  }
  return out;
}

/** A run that takes no visit: one being destroyed, over or archived. Null when it takes one. */
export function runVisitRefusal(run: Pick<CourseRunDoc, "status" | "archived">, destroying: boolean): string | null {
  const said = runMoveRefusal(run, destroying);
  if (said === null) return null;
  if (destroying) return VISIT_REFUSAL.runGone;
  if (run.archived && run.status !== "completed" && run.status !== "cancelled") return VISIT_REFUSAL.runArchived;
  return VISIT_REFUSAL.runOver;
}

/**
 * Whether a place could have a visit arranged, by what is known of it alone:
 * the same place a move takes (an active learner's place in a group, told by
 * Publish, of somebody who facilitates no group of the run that still meets).
 * The ways in draw the link only for such a place, on a run that takes one.
 */
export const placeTakesVisit = placeTakesMove;

/**
 * The registers the facts carry: every group's of the run for the weeks
 * asked, an archived group's included (a visit to a group archived since
 * holds that week as its finished register says: `countsFromArchivedGroup`).
 */
function registerIdsFor(run: CourseRunDoc, groups: readonly CourseGroupDoc[], weeks: readonly number[]): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const session of resolveSessions(run, group)) {
      if (!weeks.includes(session.weekNumber)) continue;
      ids.add(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence));
    }
  }
  return [...ids];
}

/**
 * Reads the person's place on the run, and everything a visit's plan asks,
 * and decides whether any visit can be arranged at all. `weeks` are the weeks
 * whose registers are read (every week still to come, for the page; the one
 * week asked, for a press).
 */
export async function readVisitFacts(
  reader: Reader,
  db: Firestore,
  runId: string,
  uid: string,
  weeks: "ahead" | readonly number[],
  now: Date,
  /**
   * Who asks: staff (the default), or the person themselves cancelling, for
   * whom the CALLER'S OWN PLACE is decided first and every other refusal is
   * the one 404 (`MEMBER_NO_VISIT`), so no answer says a run exists, is
   * archived or has one group.
   */
  as: "staff" | "member" = "staff",
): Promise<{ ok: true; facts: VisitFacts } | VisitRefusal> {
  const [[runSnap, placeSnap], groupSnap, placesSnap, requestSnap] = await Promise.all([
    reader.getAll([db.collection("courseRuns").doc(runId), db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid))]),
    reader.query(db.collection("courseGroups").where("runId", "==", runId)),
    reader.query(db.collection("courseEnrolments").where("runId", "==", runId).where("status", "==", "active")),
    reader.query(db.collection(COURSE_REQUESTS_COLLECTION).where("subjectUid", "==", uid).where("runId", "==", runId).limit(MAX_OWN)),
  ]);
  const place = placeSnap?.exists ? normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {}) : null;
  const placeIsTheirs = Boolean(place && place.runId === runId && place.uid === uid && place.role === "learner" && place.status === "active" && place.groupId);
  if (as === "member" && !placeIsTheirs) return MEMBER_NO_VISIT;
  const refuse = (answer: VisitRefusal): VisitRefusal => (as === "member" ? MEMBER_NO_VISIT : answer);
  if (!runSnap?.exists) return refuse({ ok: false, status: 409, error: VISIT_REFUSAL.runGone });
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const destroying = (runSnap.data() ?? {}).destroying === true;
  const runRefusal = runVisitRefusal(run, destroying);
  if (runRefusal) return refuse({ ok: false, status: 409, error: runRefusal });
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === run.id);
  const live = groups.filter((group) => !group.archived);
  const naming = await readNamingProgramme(db, run.id);
  const oneGroup = naming?.kind === "incubator" || live.length < 2;
  if (oneGroup && as === "member") return MEMBER_NO_VISIT;

  if (!place || !placeIsTheirs || place.runId !== run.id) {
    return { ok: false, status: 404, error: VISIT_REFUSAL.noPlace };
  }
  const accountSnaps = await reader.getAll(
    [...new Set([uid, ...groups.flatMap((group) => group.facilitatorUids)])].filter((each) => each && !each.includes("/")).map((each) => db.collection("users").doc(each)),
  );
  const accounts = new Map<string, Record<string, unknown>>();
  for (const snap of accountSnaps) if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  const data = accounts.get(uid);
  const person = {
    uid,
    name: data ? fullNameOfUser(data) : "NAISI member",
    firstName: (data ? firstNameOfUser(data) : "") || (data ? fullNameOfUser(data) : ""),
    email: emailOf(data),
  };
  // (b)'s two sentences, the cases being the same: a seat Publish has not
  // told (nobody is emailed about a group they were never told), and
  // somebody who facilitates a group of the run, who sits only in it.
  if (!placementIsTold(place)) return refuse({ ok: false, status: 409, error: notToldWords(person.firstName) });
  const facilitated = live.find((group) => group.facilitatorUids.includes(uid));
  if (facilitated) return refuse({ ok: false, status: 409, error: facilitatesWords(person.firstName, facilitated.name) });
  const places = placesSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {})).filter((each) => each.runId === run.id);
  const weekList = weeks === "ahead" ? ownWeeksAhead({ run, groups, place }, now).map((week) => week.weekNumber).concat((place.visits ?? []).map((visit) => visit.weekNumber)) : [...weeks];
  const registerIds = registerIdsFor(run, groups, weekList);
  const registerSnaps = await reader.getAll(registerIds.map((id) => db.collection("courseAttendance").doc(id)));
  const registers = new Map<string, Record<string, unknown>>();
  for (const snap of registerSnaps) if (snap.exists) registers.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  const requests = requestSnap.docs
    .map((doc) => normalizeExcusedRequest(doc.id, doc.data() ?? {}))
    .filter((request): request is ExcusedRequestDoc => request !== null && request.runId === run.id && request.subjectUid === uid);
  const visitRequests = requestSnap.docs
    .map((doc) => normalizeVisitRequest(doc.id, doc.data() ?? {}))
    .filter((request): request is VisitRequestDoc => request !== null && request.runId === run.id && request.subjectUid === uid);
  const moveRequests = requestSnap.docs
    .map((doc) => normalizeMoveRequest(doc.id, doc.data() ?? {}))
    .filter((request): request is MoveRequestDoc => request !== null && request.runId === run.id && request.subjectUid === uid);
  return { ok: true, facts: { run, destroying, groups, place, person, accounts, places, registers, oneGroup, requests, visitRequests, moveRequests } };
}

/** A live group's sessions. */
function liveSessionsOf(run: CourseRunDoc, groups: readonly CourseGroupDoc[]) {
  return (groupId: string): readonly ResolvedSession[] | null => {
    const group = groups.find((each) => each.id === groupId && !each.archived);
    return group ? resolveSessions(run, group) : null;
  };
}

/** Whether a session has started by `now`: a session with no date or time never has. */
function hasStarted(session: ResolvedSession, now: Date): boolean {
  const { startsAt } = sessionInstants(session);
  return startsAt !== null && startsAt.getTime() <= now.getTime();
}

/** The session's own facts, as the sentences read them. */
function sessionFacts(group: CourseGroupDoc, session: ResolvedSession): VisitSessionFacts {
  return {
    dateKey: session.dateKey,
    startTimeLocal: session.session.startTimeLocal,
    durationMinutes: session.session.durationMinutes,
    room: session.session.location ?? "",
    campus: campusLabel(campusForWeek(group, session.weekId)),
  };
}

/** One week the person could visit another group's session in: their own group's session that week, still to come. */
export type OwnWeek = { weekNumber: number; home: CourseGroupDoc; session: ResolvedSession };

/**
 * THE WEEKS OF THEIR GROUP WHOSE SESSIONS ARE STILL TO COME: each week's
 * session of the group they BELONG to that week (never a visit's host),
 * dated, not called off and not started. One a week, the week's first.
 */
export function ownWeeksAhead(facts: Pick<VisitFacts, "run" | "groups" | "place">, now: Date): OwnWeek[] {
  const paired = sessionsWithGroup(belonging(facts.place), liveSessionsOf(facts.run, facts.groups));
  const out: OwnWeek[] = [];
  for (const { groupId, session } of paired) {
    if (session.weekNumber < facts.place.joinedWeekNumber) continue;
    if (out.some((week) => week.weekNumber === session.weekNumber)) continue;
    if (!session.dateKey || session.cancelled || hasStarted(session, now)) continue;
    const home = facts.groups.find((group) => group.id === groupId);
    if (home) out.push({ weekNumber: session.weekNumber, home, session });
  }
  return out;
}

/** Their own group's session in a week (`ownSessionThatWeek`), with the group; null with none. */
function ownSessionIn(facts: Pick<VisitFacts, "run" | "groups" | "place">, weekNumber: number): { home: CourseGroupDoc; session: ResolvedSession } | null {
  const homeId = ownGroupForWeek(facts.place, weekNumber);
  const home = facts.groups.find((group) => group.id === homeId) ?? null;
  const session = ownSessionThatWeek(facts.run, home, weekNumber);
  return home && session ? { home, session } : null;
}

/** The next session of their own group after week N they are due at there, or null. */
function backDateKeyOf(facts: Pick<VisitFacts, "run" | "groups" | "place">, weekNumber: number, homeId: string): string | null {
  const paired = sessionsWithGroup(facts.place, liveSessionsOf(facts.run, facts.groups));
  const next = paired.find(
    (each) => each.session.weekNumber > weekNumber && each.groupId === homeId && !each.session.cancelled && each.session.dateKey !== "",
  );
  return next ? next.session.dateKey : null;
}

/** A register as read, by its id. */
function registerOf(facts: Pick<VisitFacts, "registers">, runId: string, groupId: string, session: ResolvedSession) {
  const id = attendanceDocId(runId, groupId, session.weekNumber, session.occurrence);
  const data = facts.registers.get(id);
  return data ? normalizeCourseAttendance(id, data) : null;
}

/** Why a host session cannot be visited, or null when it can. */
function hostSessionRefusal(facts: VisitFacts, host: CourseGroupDoc, weekNumber: number, now: Date): { session: ResolvedSession | null; error: string | null } {
  const session = resolveSessions(facts.run, host).find((each) => each.weekNumber === weekNumber && each.occurrence === 1) ?? null;
  if (!session || !session.dateKey) return { session: null, error: hostHasNoneWords(host.name, weekNumber) };
  if (session.cancelled) return { session, error: hostCancelledWords(host.name, weekNumber) };
  const register = registerOf(facts, facts.run.id, host.id, session);
  if (register && !register.held) return { session, error: hostNotHeldWords(host.name, weekNumber) };
  if (hasStarted(session, now)) return { session, error: hostStartedWords(host.name, weekNumber) };
  return { session, error: null };
}

/**
 * Whether a host's session that week is happening: dated, not called off, not
 * marked as not held, and its group still meets, or was archived after it
 * held the session and finished its register (`countsFromArchivedGroup`).
 */
function hostHappeningIn(facts: Pick<VisitFacts, "run" | "registers">, host: CourseGroupDoc, weekNumber: number): { session: ResolvedSession | null; happening: boolean } {
  const session = resolveSessions(facts.run, host).find((each) => each.weekNumber === weekNumber && each.occurrence === 1 && each.dateKey !== "") ?? null;
  const register = session ? registerOf(facts, facts.run.id, host.id, session) : null;
  const happening = session !== null && !session.cancelled && (register?.held ?? true) && (!host.archived || countsFromArchivedGroup(session, register));
  return { session, happening };
}

/** A standing visit that week to a session that is not happening, which a visit to another session may replace; null otherwise. */
export function replaceableVisit(facts: Pick<VisitFacts, "run" | "registers" | "groups">, hostId: string, weekNumber: number): { host: CourseGroupDoc } | null {
  const host = facts.groups.find((group) => group.id === hostId) ?? null;
  if (!host) return null;
  return hostHappeningIn(facts, host, weekNumber).happening ? null : { host };
}

/**
 * Whether an excusal stands for the person on their own group's session that
 * week (`excusalStandsFor`, the register's own rule: an approved request, a
 * line that says excused, or one kept beside a mark that says they came).
 * Then "with Group B as usual" is untrue, and is left out where a visit ends.
 */
export function excusedAtHomeIn(facts: Pick<VisitFacts, "run" | "groups" | "place" | "registers" | "requests">, weekNumber: number): boolean {
  const own = ownSessionIn(facts, weekNumber);
  if (!own) return false;
  const register = registerOf(facts, facts.run.id, own.home.id, own.session);
  const approved = factOf(weeksAbout(facts.requests, facts.place.uid, own.session.sessionKey, { groupId: own.home.id, visiting: false })) === "excused";
  return excusalStandsFor({ approved, mark: register?.records[facts.place.uid] ?? null, kept: Boolean(register && Object.hasOwn(register.excusalKept, facts.place.uid)) });
}

/**
 * Whether the person's own request to go to another session in `weekNumber`
 * still waits, given their own group's session that week is still to come:
 * stored waiting, asked from the group they belong to that week, and the
 * host's session not yet started where it is happening. The same answer as
 * `visitRequestStandingOf` in that case, asked here so this file reads nothing
 * of it.
 */
function visitRequestWaitsIn(facts: Pick<VisitFacts, "run" | "groups" | "registers">, request: VisitRequestDoc, weekNumber: number, homeId: string | null, now: Date): boolean {
  if (request.status !== "waiting" || request.change.weekNumber !== weekNumber || request.groupId !== homeId) return false;
  const host = facts.groups.find((group) => group.id === request.change.hostGroupId) ?? null;
  if (!host) return true;
  const { session, happening } = hostHappeningIn(facts, host, weekNumber);
  return !(happening && session && hasStarted(session, now));
}

/** The marks that say somebody came: in the room, online, late, left early. */
const CAME = new Set(["present", "late", "left-early"]);

/** What arranging a visit would do. */
export type VisitPlan = {
  weekNumber: number;
  /** The visit to a session not happening this one replaces, in the same write; null when none stands. */
  replaces: { hostGroupId: string; hostName: string } | null;
  hostGroupId: string;
  hostName: string;
  homeGroupId: string;
  homeName: string;
  host: VisitSessionFacts;
  hostSession: ResolvedSession;
  /** Their own group's session that week. */
  ownSession: ResolvedSession;
  lines: VisitLineView[];
  told: { count: string; rest: string };
  /** The warning shown when the session is full, and the flag the press must send back; null when it is not. */
  overLimit: string | null;
  personEmail: { subject: string; lines: string[] } | null;
  button: string;
  recipients: VisitRecipient[];
  emails: number;
  emailFacts: VisitEmailFacts;
};

/**
 * WHAT ARRANGING A VISIT TO `hostGroupId`'S SESSION IN `weekNumber` WOULD DO,
 * from the facts read, or the one sentence why it can't be arranged.
 */
export function planVisit(
  facts: VisitFacts,
  weekNumber: number,
  hostGroupId: string,
  actorUid: string,
  now: Date,
  /** The person's own request this visit approves, which is no reason to refuse it. */
  approving: string | null = null,
  /**
   * Whether whoever asks is an admin: only an admin is told a request of the
   * person's own waits (requests to go to another session are an admin's
   * alone); anybody else is told the week is with the admins.
   */
  viewer: { isAdmin: boolean } = { isAdmin: false },
): { ok: true; plan: VisitPlan } | VisitRefusal {
  const { run, place, person, accounts } = facts;
  if (facts.oneGroup) return { ok: false, status: 409, error: VISIT_REFUSAL.oneGroup };
  // A visit that stands that week is refused, unless its session is not
  // happening: then a visit to another session replaces it in the same write.
  const existing = visitInWeek(place, weekNumber);
  const replaces = existing ? replaceableVisit(facts, existing.groupId, weekNumber) : null;
  if (existing && !replaces) return { ok: false, status: 409, error: alreadyVisitingWords(person.firstName, weekNumber) };
  // Their own group's session that week still to come; or, replacing a visit,
  // that session whether or not it has started (the visit replaced is why
  // they were not there).
  const ownAhead = ownWeeksAhead(facts, now).find((week) => week.weekNumber === weekNumber) ?? null;
  const ownAny = replaces ? ownSessionIn(facts, weekNumber) : null;
  const own = ownAhead ?? (ownAny ? { weekNumber, home: ownAny.home, session: ownAny.session } : null);
  const homeId = ownGroupForWeek(place, weekNumber);
  // Their own group's sessions that week, and the requests about each as every reader pairs them.
  const aboutOwn = (sessionKey: string) => weeksAbout(facts.requests, place.uid, sessionKey, { groupId: homeId ?? "", visiting: false });
  const ownThatWeek = (() => {
    const group = facts.groups.find((each) => each.id === homeId);
    return group ? resolveSessions(run, group).filter((each) => each.weekNumber === weekNumber) : [];
  })();
  // A request about it still waiting: decided first.
  if (ownThatWeek.some((session) => requestStandingOf(aboutOwn(session.sessionKey)) === "waiting")) {
    return { ok: false, status: 409, error: excusedWaitingWords(person.firstName, weekNumber) };
  }
  const homeGroup = facts.groups.find((group) => group.id === homeId) ?? null;
  if (!own || !homeGroup) return { ok: false, status: 409, error: ownWeekGoneWords(homeGroup?.name ?? "", weekNumber) };
  // Their own request to go to another session that week, still waiting:
  // decided first. With their own session that week still to come (just
  // checked), such a request waits until the host's session starts, while
  // that session is happening (`visitRequestStandingOf`, the one rule).
  if (facts.visitRequests.some((request) => request.id !== approving && visitRequestWaitsIn(facts, request, weekNumber, homeId, now))) {
    return {
      ok: false,
      status: 409,
      error: viewer.isAdmin ? visitRequestWaitingWords(person.firstName, weekNumber) : withTheAdminsWords(person.firstName, weekNumber),
    };
  }
  const host = facts.groups.find((group) => group.id === hostGroupId) ?? null;
  if (!host) return { ok: false, status: 404, error: VISIT_REFUSAL.noGroup };
  if (host.archived) return { ok: false, status: 409, error: hostArchivedWords(host.name) };
  if (host.id === own.home.id) return { ok: false, status: 409, error: hostIsOwnWords(person.firstName, host.name) };
  if (replaces && host.id === replaces.host.id) return { ok: false, status: 409, error: alreadyVisitingWords(person.firstName, weekNumber) };
  const hostCheck = hostSessionRefusal(facts, host, weekNumber, now);
  if (hostCheck.error || !hostCheck.session) return { ok: false, status: 409, error: hostCheck.error ?? hostHasNoneWords(host.name, weekNumber) };
  const hostSession = hostCheck.session;
  // Already marked as having come on their own group's register that week.
  // An excusal from it does not stand in the way: it stays where it is, on
  // their own group's register, and they are a visitor at the host's.
  for (const session of resolveSessions(run, own.home).filter((each) => each.weekNumber === weekNumber)) {
    const register = registerOf(facts, run.id, own.home.id, session);
    const mark = register?.records[place.uid];
    if (mark && CAME.has(mark)) return { ok: false, status: 409, error: alreadyMarkedWords(person.firstName, own.home.name, weekNumber) };
  }
  const inWeek = peopleInWeek(facts.places, host.id, weekNumber);
  if (inWeek.length + 1 > ATTENDANCE_LIMITS.maxRecords) return { ok: false, status: 409, error: registerFullWords(host.name, weekNumber) };
  const left = placesLeftInWeek(host, facts.places, weekNumber);
  const overLimit = left !== null && left <= 0 && host.capacity !== null ? overLimitWords(host.name, inWeek.length + 1, host.capacity) : null;

  const recipients = visitRecipients({ person, personUid: place.uid, host, home: own.home, accounts, actorUid });
  const hostFirst = facilitatorFirstNames(host, accounts, place.uid);
  const homeFirst = facilitatorFirstNames(own.home, accounts, place.uid);
  const hostFacts = sessionFacts(host, hostSession);
  const back = backDateKeyOf(facts, weekNumber, own.home.id);
  // The person's own cancel line ("Changed your mind? ... until ..."): the one deadline.
  const earlier = cancelDeadline({ host, hostSession, home: own.home, ownSession: own.session }).first?.session ?? hostSession;
  const emailFacts: VisitEmailFacts = {
    personName: person.name,
    personFirstName: person.firstName,
    weekNumber,
    hostName: host.name.trim(),
    homeName: own.home.name.trim(),
    host: hostFacts,
    hostFacilitatorFirstNames: hostFirst,
    backDateKey: back,
    // Left out once it has passed: a visit replacing one, their own session started, cannot be cancelled.
    cancelUntil: (sessionInstants(earlier).startsAt?.getTime() ?? 0) > now.getTime() ? { dateKey: earlier.dateKey, startTimeLocal: earlier.session.startTimeLocal } : null,
  };
  const lines: VisitLineView[] = [
    ...(replaces ? [{ label: LINE_LABEL.replaces, text: replacesLineWords(person.firstName, replaces.host.name) }] : []),
    {
      label: weekLabel(weekNumber),
      text: weekLineWords({ firstName: person.firstName, hostName: host.name, homeName: own.home.name, host: hostFacts, hostFacilitatorFirstNames: hostFirst, backDateKey: back }),
    },
    { label: LINE_LABEL.late, text: lateLineWords(host.name, hostFacts) },
    { label: LINE_LABEL.reminders, text: remindersLineWords({ firstName: person.firstName, hostName: host.name, weekNumber, done: false }) },
    { label: LINE_LABEL.registers, text: registersLineWords(host.name, own.home.name) },
    {
      label: LINE_LABEL.reading,
      text: readingLineWords({ firstName: person.firstName, weekNumber, hostName: host.name, homeName: own.home.name, hostFacilitatorFirstNames: hostFirst, homeFacilitatorFirstNames: homeFirst }),
    },
    { label: LINE_LABEL.link, text: linkLineWords(person.firstName, host.name) },
  ];
  const toPerson = recipients.some((each) => each.as === "person");
  const personWords = personEmailWords(emailFacts);
  return {
    ok: true,
    plan: {
      weekNumber,
      replaces: replaces ? { hostGroupId: replaces.host.id, hostName: replaces.host.name.trim() || "Untitled group" } : null,
      hostGroupId: host.id,
      hostName: host.name.trim() || "Untitled group",
      homeGroupId: own.home.id,
      homeName: own.home.name.trim() || "Untitled group",
      host: hostFacts,
      hostSession,
      ownSession: own.session,
      lines,
      told: toldLineWords(recipients.map((each) => each.firstName || "somebody")),
      overLimit,
      personEmail: toPerson ? { subject: personWords.subject, lines: [...personWords.lines, personWords.footnote].filter(Boolean) } : null,
      button: arrangeButtonWords(recipients.length),
      recipients,
      emails: recipients.length,
      emailFacts,
    },
  };
}

/** The email each recipient of an arranged visit is sent, in the approved words. */
export function arrangedEmailFor(plan: Pick<VisitPlan, "emailFacts">, recipient: VisitRecipient): VisitEmailWords {
  if (recipient.as === "person") return personEmailWords(plan.emailFacts);
  if (recipient.as === "host") return hostEmailWords(plan.emailFacts);
  return homeEmailWords(plan.emailFacts);
}

/**
 * "I’D JOIN ONLINE" ON A REQUEST A VISIT APPROVES: what approving it writes and
 * says, asked by the request's page before the press and by the save inside
 * its transaction, from the facts each read (the host's register for that
 * session among them).
 *
 * The person's word goes on the HOST'S register for that week's session, by
 * the one rule and the one write of it (`sayingOnlineOn`, as their own press
 * of "I’m joining online" writes it), with the stamp that says its email went,
 * because the host's facilitators' email about the visit says it instead
 * (`lines`, the approved words, by whether the session has a meeting link).
 *
 *  - A session held online for everybody: nothing to say. Nothing is written
 *    and the email is as any visit's (`said` null, no lines).
 *  - Said already: the word is not written again; the email still says it,
 *    and the stamp is written alone when it was never stamped
 *    (`stampOnly`), so their own press later sends nothing twice.
 *  - The register can't take it (finished already, their line already filled
 *    in, or as full of words as it is of rows): refused, in a sentence the
 *    visit already says to staff where it has one, so nothing is approved
 *    that the host's register would not show.
 */
export type HostOnline =
  | { ok: true; lines: string[]; said: Extract<SayingOnline, { ok: true }> | null; registerId: string }
  | VisitRefusal;

export function joiningOnlineAtHost(facts: Pick<VisitFacts, "run" | "groups" | "registers" | "person">, plan: Pick<VisitPlan, "hostGroupId" | "hostName" | "hostSession" | "weekNumber">, uid: string, now: Date): HostOnline {
  const host = facts.groups.find((group) => group.id === plan.hostGroupId) ?? null;
  if (!host) return { ok: false, status: 404, error: VISIT_REFUSAL.noGroup };
  const session = plan.hostSession;
  const registerId = attendanceDocId(facts.run.id, host.id, session.weekNumber, session.occurrence);
  const said = sayingOnlineOn({ group: host, session, data: facts.registers.get(registerId), registerId, uid, now });
  if (said.ok) return { ok: true, lines: joinOnlineLinesWords({ personName: facts.person.name, personFirstName: facts.person.firstName, weekNumber: plan.weekNumber, hasLink: said.hasLink }), said, registerId };
  if (said.state.kind === "closed" && said.state.why === "online") return { ok: true, lines: [], said: null, registerId };
  if (said.state.kind === "marked" || said.state.kind === "told") {
    return { ok: false, status: 409, error: alreadyMarkedWords(facts.person.firstName, plan.hostName, plan.weekNumber) };
  }
  if (said.state.kind === "full") return { ok: false, status: 409, error: registerFullWords(plan.hostName, plan.weekNumber) };
  return { ok: false, status: 409, error: said.error };
}

/** The weeks to choose, as the page draws them: each own week still to come, and whether a visit already stands in it. */
export function weekChoices(facts: VisitFacts, now: Date): VisitWeekChoiceView[] {
  if (facts.oneGroup) return [];
  // A week with a visit to a session that is not happening can be chosen again: the new visit replaces it.
  const replaceable = (weekNumber: number) => {
    const visit = visitInWeek(facts.place, weekNumber);
    return visit !== null && replaceableVisit(facts, visit.groupId, weekNumber) !== null;
  };
  const ahead = ownWeeksAhead(facts, now).map((week) => ({ weekNumber: week.weekNumber, home: week.home, session: week.session }));
  const behind = (facts.place.visits ?? [])
    .filter((visit) => !ahead.some((week) => week.weekNumber === visit.weekNumber) && replaceable(visit.weekNumber))
    .flatMap((visit) => {
      const own = ownSessionIn(facts, visit.weekNumber);
      return own ? [{ weekNumber: visit.weekNumber, home: own.home, session: own.session }] : [];
    });
  return [...ahead, ...behind]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => ({
      weekNumber: week.weekNumber,
      words: weekChoiceWords(week.weekNumber, week.home.name, { dateKey: week.session.dateKey, startTimeLocal: week.session.session.startTimeLocal }),
      visiting: visitInWeek(facts.place, week.weekNumber) !== null && !replaceable(week.weekNumber),
    }));
}

/** The sessions to choose for one week: every other live group's session that week that can be visited, Monday first. */
export function sessionChoices(facts: VisitFacts, weekNumber: number, now: Date): VisitSessionChoiceView[] {
  const homeId = ownGroupForWeek(facts.place, weekNumber);
  return facts.groups
    .filter((group) => !group.archived && group.id !== homeId)
    .sort(compareGroupsByMeeting)
    .flatMap((group) => {
      const check = hostSessionRefusal(facts, group, weekNumber, now);
      if (check.error || !check.session) return [];
      const left = placesLeftInWeek(group, facts.places, weekNumber);
      const sessionWords = sessionFacts(group, check.session);
      return [
        {
          groupId: group.id,
          words: sessionChoiceWords(group.name, sessionWords),
          detail: sessionDetailWords(sessionWords, facilitatorFirstNames(group, facts.accounts, facts.place.uid), left),
          full: left !== null && left <= 0,
        },
      ];
    });
}

/**
 * THE SESSIONS A PERSON MAY ASK TO GO TO in one week, as their own form
 * draws them: the same sessions staff are offered (`hostSessionRefusal`: every
 * other live group's session that week, dated, not called off, not marked as
 * not held, not started) with the same count of places left that week
 * (`placesLeftInWeek`), in the order they start, the full ones after and
 * not choosable, and only those the plan itself would arrange now
 * (`planVisit`: a host register with no room for another line, or their own
 * register already saying they came, offers nothing). No facilitator is
 * named in the detail line.
 */
export function memberSessionChoices(facts: VisitFacts, weekNumber: number, now: Date): VisitSessionChoiceView[] {
  const homeId = ownGroupForWeek(facts.place, weekNumber);
  const offered = facts.groups
    .filter((group) => !group.archived && group.id !== homeId)
    .flatMap((group) => {
      const check = hostSessionRefusal(facts, group, weekNumber, now);
      if (check.error || !check.session) return [];
      if (!planVisit(facts, weekNumber, group.id, facts.place.uid, now).ok) return [];
      const left = placesLeftInWeek(group, facts.places, weekNumber);
      const full = left !== null && left <= 0;
      const words = sessionFacts(group, check.session);
      return [
        {
          startsAt: sessionInstants(check.session).startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
          name: group.name,
          view: {
            groupId: group.id,
            words: sessionChoiceWords(group.name, words),
            // A full one says so on its own line, beside its tag: the count is left out of the detail.
            detail: sessionDetailWords(words, [], full ? null : left),
            full,
          },
        },
      ];
    });
  return offered
    .sort((a, b) => Number(a.view.full) - Number(b.view.full) || a.startsAt - b.startsAt || a.name.localeCompare(b.name))
    .map((each) => each.view);
}

// ---------------------------------------------------------------------------
// Calling a visit off
// ---------------------------------------------------------------------------

/** What calling off the visit in one week would do. */
export type CallOffPlan = {
  weekNumber: number;
  host: CourseGroupDoc;
  home: CourseGroupDoc;
  hostSession: ResolvedSession | null;
  ownSession: ResolvedSession | null;
  /**
   * Whether the host's session is happening: dated, not called off, not
   * marked as not held, and its group still meets, or was archived after it
   * held the session and finished its register (`countsFromArchivedGroup`).
   */
  happening: boolean;
  /**
   * When it can no longer be called off: the host's start for staff, the
   * earlier of the two for the person (`cancelDeadline`). Null for staff when
   * the host's session is not happening: then `ownStarted` decides.
   */
  until: Date | null;
  /**
   * Staff: why it can no longer be called off, once it cannot: their own
   * group's session that week has started (`ownStartedCallOffWords`), or the
   * host's has (`tooLateToCancelWords`). Null while it can.
   */
  stays: string | null;
  /** The name of the group whose session `until` is the start of: the one named once it has started. */
  firstName: string;
  recipients: VisitRecipient[];
  emails: number;
  /** For each recipient, the email they are sent. */
  emailFor: (recipient: VisitRecipient) => VisitEmailWords;
  button: string;
  standing: VisitStandingView;
};

/**
 * WHAT CALLING OFF THE VISIT IN `weekNumber` WOULD DO, by staff (`byStaff`,
 * the person is emailed too) or by the person (only the two groups'
 * facilitators are). Refused when there is no visit that week; a session
 * that has started is the caller's to refuse, by `until`.
 */
export function planCallOff(facts: VisitFacts, weekNumber: number, byStaff: boolean, actorUid: string, now: Date): { ok: true; plan: CallOffPlan } | VisitRefusal {
  const visit = visitInWeek(facts.place, weekNumber);
  if (!visit) return { ok: false, status: 404, error: VISIT_REFUSAL.noVisit, kind: "no-visit" };
  const host = facts.groups.find((group) => group.id === visit.groupId) ?? null;
  const homeId = ownGroupForWeek(facts.place, weekNumber);
  const home = facts.groups.find((group) => group.id === homeId) ?? null;
  if (!host || !home) return { ok: false, status: 409, error: VISIT_REFUSAL.changed };
  const { session: hostSession, happening } = hostHappeningIn(facts, host, weekNumber);
  const own = ownSessionIn(facts, weekNumber);
  // Until the earlier of the two sessions starts, the host's read from its
  // own schedule even once its group is archived (`cancelDeadline`). Staff
  // calling off a visit to a session that is not happening go by their own
  // group's session alone: until it starts, whatever the clock says of the host's.
  const deadline = cancelDeadline({ host, hostSession, home, ownSession: own?.session ?? null });
  const ownStart = own ? sessionInstants(own.session).startsAt : null;
  const hostStart = hostSession ? sessionInstants(hostSession).startsAt : null;
  const staffNotHappening = byStaff && !happening;
  const until = staffNotHappening ? ownStart : deadline.until;
  const closed = until !== null && now.getTime() >= until.getTime();
  // Which session's start closed it: their own group's, or the host's.
  const closedBy = staffNotHappening ? home : (deadline.first?.group ?? host);
  const ownStarted = closed && closedBy.id === home.id;
  const stays = !byStaff || !closed
    ? null
    : ownStarted
      ? ownStartedCallOffWords({
          firstName: facts.person.firstName,
          homeName: home.name,
          hostName: host.name,
          weekNumber,
          hostHappening: happening,
          hostClosed: host.archived || hostStart === null || now.getTime() >= hostStart.getTime(),
          // The page's own rule: their card asks unless they facilitate, with standing, the group their place is in now.
          cardAsks: cardAsksFor(facts.place.uid, facts.accounts.get(facts.place.uid), facts.groups.find((group) => group.id === facts.place.groupId) ?? null),
        })
      : tooLateToCancelWords(closedBy.name);
  const recipients = visitRecipients({
    person: byStaff ? facts.person : null,
    personUid: facts.place.uid,
    host,
    home,
    accounts: facts.accounts,
    actorUid,
  });
  const ownWhen = own ? { dateKey: own.session.dateKey, startTimeLocal: own.session.session.startTimeLocal } : null;
  const excusedAtHome = excusedAtHomeIn(facts, weekNumber);
  const emailFor = (recipient: VisitRecipient): VisitEmailWords =>
    recipient.as === "person"
      ? calledOffPersonEmailWords({ hostName: host.name, homeName: home.name, weekNumber, hostDateKey: hostSession?.dateKey ?? "", own: ownWhen, excusedAtHome })
      : calledOffEmailWords({ personName: facts.person.name, hostName: host.name, homeName: home.name, weekNumber, excusedAtHome });
  const standing: VisitStandingView = {
    weekNumber,
    hostGroupId: host.id,
    words: standingWords({
      firstName: facts.person.firstName,
      weekNumber,
      hostName: host.name,
      host: { dateKey: hostSession?.dateKey ?? "", startTimeLocal: hostSession?.session.startTimeLocal ?? "" },
    }),
    gone: happening ? null : noLongerHappeningWords(host.name),
    button: callOffButtonWords(recipients.length),
    emails: recipients.length,
    open: !closed,
    stays,
  };
  return {
    ok: true,
    plan: {
      weekNumber,
      host,
      home,
      hostSession,
      ownSession: own?.session ?? null,
      happening,
      until,
      stays,
      firstName: closedBy.name,
      recipients,
      emails: recipients.length,
      emailFor,
      button: standing.button,
      standing,
    },
  };
}

/** Every visit that stands, as the staff page draws it. */
export function standingVisits(facts: VisitFacts, actorUid: string, now: Date): VisitStandingView[] {
  return (facts.place.visits ?? []).flatMap((visit) => {
    const planned = planCallOff(facts, visit.weekNumber, true, actorUid, now);
    return planned.ok ? [planned.plan.standing] : [];
  });
}

/** What the page and the route's preview draw of a plan: never an address. */
export function previewOf(plan: VisitPlan, limit: string | null = null): VisitPreviewView {
  return {
    limit,
    weekNumber: plan.weekNumber,
    hostGroupId: plan.hostGroupId,
    lines: plan.lines,
    told: plan.told,
    overLimit: plan.overLimit,
    personEmail: plan.personEmail,
    button: plan.button,
    emails: plan.emails,
  };
}
