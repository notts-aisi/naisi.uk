import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import { namingProgrammeIn, programmeLedBy, type NamingProgramme } from "@/lib/courses/programmeLead";
import { gateGroupRegister, isAddressableId } from "@/lib/courses/registerAccess";
import { lineOf, sameLine, wordsOf } from "@/lib/courses/registerCorrection/model";
import { resolveSessions } from "@/lib/courses/sessions";
import { addDaysToKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, normalizeCourseAttendance, type LineSetterHow } from "@/lib/firestore/courseAttendance";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  COURSE_REQUESTS_COLLECTION,
  normalizeCourseRequest,
  type CourseRequestDoc,
  type CourseRequestEvent,
  type CourseRequestKind,
  type CourseRequestStatus,
} from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { excusedRequestRows } from "@/lib/courses/excused/page";
import { normalizeExcusedRequest, type ExcusedRequestDoc } from "@/lib/firestore/courseExcusedRequests";
import { sessionKeyParts } from "./decide";

/**
 * THE TWO PAGES OF REQUESTS, read on the server: the Requests page (every
 * request waiting, being handled and done this week, for the programmes the
 * reader looks after) and one request's page (what it asks, why, what
 * approving will do, who has it, its history).
 *
 * WHO. The people who decide requests: admins read every programme's, and
 * the lead of a programme the requests of the runs its programme names, and
 * nobody else's. A run's track lead who is neither is anybody else here.
 * Anybody else is answered `none`, as for a page that is not there. The
 * request page also asks the request's own group's register gate, so a lead
 * whose programme does not name the run is nobody on it, and the list
 * leaves out what that page would not open: a group the lead facilitates,
 * which the gate answers them on as its facilitator, or an archived one.
 *
 * READ WITH ONE FIELD AT A TIME, so no list needs a declared index: for an
 * admin, waiting requests by `status` and this week's decided ones by a
 * range on `decidedAt`; for a lead, each led run's by `runId`. Filtered and
 * sorted in code: a term holds tens of these.
 *
 * NAMES ONLY, by the names rule for the reader (`nameForViewer`): never an
 * address. A reason is the asker's words, read here by the people who decide.
 */

/** How a row of the Requests page stands: waiting with nobody on it, being handled, or decided. */
export type RequestState = "waiting" | "handling" | "approved" | "declined" | "withdrawn";

export type RequestPerson = { uid: string; name: string };

export type RequestRow = {
  id: string;
  /** `excused` rows are admins' only (`src/lib/courses/excused/page.ts`). */
  kind: CourseRequestKind | "excused";
  status: CourseRequestStatus;
  state: RequestState;
  askedBy: RequestPerson;
  askedAt: string | null;
  /** Whose line it is about. */
  subject: RequestPerson;
  programme: { roundId: string | null; programmeId: string | null; name: string };
  runId: string;
  group: { id: string; name: string };
  weekNumber: number;
  occurrence: number;
  /** The session's date, as the group's calendar dates it now; "" with none. */
  dateKey: string;
  /** What the line said when it was asked, and what it should say, in words. */
  from: string;
  to: string;
  /** Who has it, and since when; null while nobody has. */
  handling: (RequestPerson & { at: string | null }) | null;
  /** The reader has it. */
  mine: boolean;
  decidedBy: RequestPerson | null;
  decidedAt: string | null;
  /** An excused request's weeks, each with where it stands; absent on a correction. */
  weeks?: { sessionKey: string; weekNumber: number; occurrence: number; dateKey: string; state: CourseRequestStatus }[];
};

export type RequestsPageView = {
  viewer: "admin" | "lead";
  /** Waiting with nobody on it; waiting and somebody has it; approved or declined since Monday. */
  counts: { waiting: number; handling: number; doneThisWeek: number };
  /** Waiting first, then being handled, then done this week; newest first in each. */
  rows: RequestRow[];
  /** Monday this week, in London: where "done this week" starts. */
  weekStartsAt: string;
};

export type Loaded<T> = { status: "ok"; view: T } | { status: "none" };

/** Most requests read for one list: a term holds tens of these. */
const MAX_REQUESTS = 500;

/** Monday of this week, midnight in London. */
export function weekStartOf(now: Date): Date {
  const today = londonDateKey(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return londonWallClockToInstant(addDaysToKey(today, -((weekday + 6) % 7)), "00:00");
}

/**
 * The runs a reader leads, and the programme naming each run. For an admin,
 * no list (they read every run's). For anybody else, the runs whose naming
 * programme names them as its lead, each held to the one gate
 * (`programmeLedBy`, the lead's standing on every request), so a lead who
 * does not meet the bar, or whose programme does not name the run, is
 * nobody on it. A run's track leads decide no request, so naming somebody as
 * one leads them to none here.
 */
async function ledRuns(db: Firestore, actor: SessionUser): Promise<{ runIds: string[]; naming: Map<string, NamingProgramme> }> {
  const forms = await listForms(db);
  const naming = new Map<string, NamingProgramme>();
  const candidates = new Set<string>();
  for (const form of forms) {
    for (const programmeId of form.programmeIds) {
      const programme = own(form.programmes, programmeId);
      if (!programme?.runId) continue;
      const named = namingProgrammeIn(forms, programme.runId);
      if (named) naming.set(programme.runId, named);
      if (programme.leadUid === actor.uid) candidates.add(programme.runId);
    }
  }
  if (actor.role === "admin") return { runIds: [], naming };
  const runIds: string[] = [];
  for (const runId of [...candidates].filter((id) => isAddressableId(id)).sort()) {
    if ((await programmeLedBy(db, actor, runId)) !== null) runIds.push(runId);
  }
  return { runIds, naming };
}

/** Everything a list of requests names, read once. */
async function context(db: Firestore, requests: readonly CourseRequestDoc[], viewer: SessionUser, alsoNamed: readonly string[] = []) {
  const groupIds = [...new Set(requests.map((each) => each.groupId))].filter(isAddressableId);
  const runIds = [...new Set(requests.map((each) => each.runId))].filter(isAddressableId);
  const uids = new Set<string>(alsoNamed);
  for (const each of requests) {
    for (const uid of [each.askedByUid, each.subjectUid, each.handlingUid, each.decidedByUid]) if (uid) uids.add(uid);
    for (const entry of each.history) uids.add(entry.byUid);
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
  const person = (uid: string): RequestPerson => ({ uid, name: names.get(uid) ?? "NAISI member" });
  return { groups, runs, person };
}

function stateOf(request: CourseRequestDoc): RequestState {
  if (request.status === "waiting") return request.handlingUid ? "handling" : "waiting";
  return request.status;
}

function rowOf(
  request: CourseRequestDoc,
  ctx: Awaited<ReturnType<typeof context>>,
  naming: ReadonlyMap<string, NamingProgramme>,
  viewer: SessionUser,
): RequestRow {
  const group = ctx.groups.get(request.groupId);
  const run = ctx.runs.get(request.runId);
  const parts = sessionKeyParts(request.sessionKey) ?? { weekNumber: 0, occurrence: 1 };
  const session = run && group ? resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey) : undefined;
  const named = naming.get(request.runId) ?? null;
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    state: stateOf(request),
    askedBy: ctx.person(request.askedByUid),
    askedAt: request.askedAt ? request.askedAt.toISOString() : null,
    subject: ctx.person(request.subjectUid),
    programme: {
      roundId: request.roundId,
      programmeId: request.programmeId,
      name: (named?.shortName ?? "").trim() || run?.courseTitle || "",
    },
    runId: request.runId,
    group: { id: request.groupId, name: group?.name.trim() || "Untitled group" },
    weekNumber: parts.weekNumber,
    occurrence: parts.occurrence,
    dateKey: session?.dateKey ?? "",
    from: wordsOf(request.change.from),
    to: wordsOf(request.change.to),
    handling: request.handlingUid ? { ...ctx.person(request.handlingUid), at: request.handlingAt ? request.handlingAt.toISOString() : null } : null,
    mine: request.handlingUid === viewer.uid,
    decidedBy: request.decidedByUid ? ctx.person(request.decidedByUid) : null,
    decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
  };
}

const ORDER: Record<RequestState, number> = { waiting: 0, handling: 1, approved: 2, declined: 2, withdrawn: 3 };

/**
 * THE REQUESTS PAGE: every request waiting or being handled, and every one
 * approved or declined since Monday, for the programmes the reader looks
 * after, with the three counts.
 */
export async function loadRequestsPage(db: Firestore, actor: SessionUser, now: Date): Promise<Loaded<RequestsPageView>> {
  const isAdmin = actor.role === "admin";
  const led = await ledRuns(db, actor);
  if (!isAdmin && led.runIds.length === 0) return { status: "none" };
  const weekStartsAt = weekStartOf(now);

  let requests: CourseRequestDoc[] = [];
  // Requests to be excused: admins' only, read from the same two lists.
  let excused: ExcusedRequestDoc[] = [];
  const read = (snap: FirebaseFirestore.QuerySnapshot) =>
    snap.docs.map((doc) => normalizeCourseRequest(doc.id, doc.data() ?? {})).filter((each): each is CourseRequestDoc => each !== null);
  const readExcused = (snap: FirebaseFirestore.QuerySnapshot) =>
    snap.docs.map((doc) => normalizeExcusedRequest(doc.id, doc.data() ?? {})).filter((each): each is ExcusedRequestDoc => each !== null);
  if (isAdmin) {
    const [waiting, decided] = await Promise.all([
      db.collection(COURSE_REQUESTS_COLLECTION).where("status", "==", "waiting").limit(MAX_REQUESTS).get(),
      db.collection(COURSE_REQUESTS_COLLECTION).where("decidedAt", ">=", weekStartsAt).limit(MAX_REQUESTS).get(),
    ]);
    const byId = new Map<string, CourseRequestDoc>();
    for (const each of [...read(waiting), ...read(decided)]) byId.set(each.id, each);
    requests = [...byId.values()];
    const excusedById = new Map<string, ExcusedRequestDoc>();
    for (const each of [...readExcused(waiting), ...readExcused(decided)]) excusedById.set(each.id, each);
    excused = [...excusedById.values()].filter(
      (each) =>
        each.status === "waiting" ||
        ((each.status === "approved" || each.status === "declined") && each.decidedAt !== null && each.decidedAt.getTime() >= weekStartsAt.getTime()),
    );
  } else {
    const snaps = await Promise.all(
      led.runIds.map((runId) => db.collection(COURSE_REQUESTS_COLLECTION).where("runId", "==", runId).limit(MAX_REQUESTS).get()),
    );
    const allowed = new Set(led.runIds);
    requests = snaps.flatMap(read).filter((each) => allowed.has(each.runId));
  }
  requests = requests.filter(
    (each) =>
      each.status === "waiting" ||
      ((each.status === "approved" || each.status === "declined") && each.decidedAt !== null && each.decidedAt.getTime() >= weekStartsAt.getTime()),
  );

  const [ctx, excusedRows] = await Promise.all([context(db, requests, actor), excusedRequestRows(db, excused, led.naming, actor)]);
  // Only what the reader can open (`requestShownTo`): one request's page asks
  // the group's own register gate (`gateGroupRegisterForRead`), which answers
  // a lead who also facilitates the group as a facilitator, and admits no
  // lead to an archived group. The runs are led already (`ledRuns`); the rest
  // is the group's, read once above. (Requests to be excused are an admin's alone.)
  requests = requests.filter((each) => requestShownTo(actor, ctx.groups.get(each.groupId), each.runId, led.runIds.includes(each.runId)));
  const rows: RequestRow[] = [...requests.map((each) => rowOf(each, ctx, led.naming, actor)), ...excusedRows]
    .sort(
      (a, b) =>
        ORDER[a.state] - ORDER[b.state] ||
        (b.decidedAt ?? b.askedAt ?? "").localeCompare(a.decidedAt ?? a.askedAt ?? "") ||
        a.id.localeCompare(b.id),
    );
  return {
    status: "ok",
    view: {
      viewer: isAdmin ? "admin" : "lead",
      counts: {
        waiting: rows.filter((row) => row.state === "waiting").length,
        handling: rows.filter((row) => row.state === "handling").length,
        doneThisWeek: rows.filter((row) => row.state === "approved" || row.state === "declined").length,
      },
      rows,
      weekStartsAt: weekStartsAt.toISOString(),
    },
  };
}

/** One request's page. */
export type RequestPageView = RequestRow & {
  /** The asker's words. */
  reason: string;
  /** The line as the register says it now: its words, who set it and when. */
  line: {
    now: string;
    setBy: { name: string; at: string; how: LineSetterHow } | null;
    /** The line still says what the request says it did: approving corrects it as asked. */
    asAsked: boolean;
  };
  /** Who finished the register and when; null while it is not finished. */
  finished: { by: RequestPerson; at: string } | null;
  /** What approving will do: the line, everybody's figures, nobody emailed, the asker told on the register. */
  approving: { line: string; figures: true; emailed: 0; toldOn: "register" };
  /** The reply, once declined. */
  reply: string;
  history: { what: CourseRequestEvent; by: RequestPerson; at: string }[];
  /** The reader may approve or decline it now: it waits, and they did not ask it. */
  canDecide: boolean;
  /** The reader may take it: it waits, they do not have it, and they did not ask it. */
  canTake: boolean;
  /** The reader asked it. */
  yours: boolean;
};

/** ONE REQUEST'S PAGE, for the people who decide it. */
export async function loadRequestPage(db: Firestore, actor: SessionUser, requestId: string): Promise<Loaded<RequestPageView>> {
  if (!isAddressableId(requestId) || requestId.length > 128) return { status: "none" };
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const request = snap.exists ? normalizeCourseRequest(snap.id, snap.data() ?? {}) : null;
  if (!request || !request.groupId || !request.runId) return { status: "none" };
  const gated = await gateGroupRegisterForRead(db, actor, request);
  if (!gated) return { status: "none" };

  const parts = sessionKeyParts(request.sessionKey);
  const [forms, registerSnap] = await Promise.all([
    listForms(db),
    parts
      ? db.collection("courseAttendance").doc(attendanceDocId(request.runId, request.groupId, parts.weekNumber, parts.occurrence)).get()
      : Promise.resolve(null),
  ]);
  const register = registerSnap?.exists ? normalizeCourseAttendance(registerSnap.id, registerSnap.data() ?? {}) : null;
  const setter = register?.setBy[request.subjectUid] ?? null;
  const ctx = await context(db, [request], actor, [setter?.byUid ?? "", register?.pushedByUid ?? ""].filter(Boolean));
  const naming = new Map<string, NamingProgramme>();
  const named = namingProgrammeIn(forms, request.runId);
  if (named) naming.set(request.runId, named);
  const row = rowOf(request, ctx, naming, actor);
  const current = register ? lineOf(register, request.subjectUid) : { mark: null, online: false };
  const setterName = setter ? ctx.person(setter.byUid).name : "";
  const waiting = request.status === "waiting";
  return {
    status: "ok",
    view: {
      ...row,
      reason: request.reason,
      line: {
        now: wordsOf(current),
        // An approval of a request to be excused: who and when are an admin's alone.
        setBy: setter
          ? setter.how === "approval" && actor.role !== "admin"
            ? { name: "", at: "", how: setter.how }
            : { name: setterName, at: setter.at.toISOString(), how: setter.how }
          : null,
        asAsked: Boolean(register?.pushedAt) && sameLine(current, request.change.from),
      },
      finished: register?.pushedAt && register.pushedByUid
        ? { by: ctx.person(register.pushedByUid), at: register.pushedAt.toISOString() }
        : null,
      approving: { line: `${row.subject.name}: ${row.from} to ${row.to}`, figures: true, emailed: 0, toldOn: "register" },
      reply: request.reply,
      history: request.history.map((entry) => ({ what: entry.what, by: ctx.person(entry.byUid), at: entry.at.toISOString() })),
      canDecide: waiting && request.askedByUid !== actor.uid,
      canTake: waiting && request.handlingUid !== actor.uid && request.askedByUid !== actor.uid,
      yours: request.askedByUid === actor.uid,
    },
  };
}

/**
 * Whether somebody leading a run (`ledRuns` holds them to that) decides the
 * requests on one of its groups, as the register's gate answers them: never
 * on a group they facilitate (the gate answers them as its facilitator), on
 * an archived group, or on a group of another run.
 */
function leadDecidesOn(actor: SessionUser, group: CourseGroupDoc | undefined, runId: string): boolean {
  if (!group || group.archived || group.runId !== runId) return false;
  return !isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
}

/**
 * WHETHER THE REQUESTS LIST SHOWS A REQUEST ON THIS GROUP TO THIS READER:
 * every one to an admin, and to the lead of the programme that names the run
 * (`leadsRun`, worked out by the caller with the lead's standing) only those
 * `leadDecidesOn` admits. A run's track lead who is neither is shown none.
 * The list asks it, and so does the count beside Requests in a programme's
 * head (`requestsWaitingOnRun`), so the number on the link is the number the
 * list shows.
 */
export function requestShownTo(actor: SessionUser, group: CourseGroupDoc | undefined, runId: string, leadsRun: boolean): boolean {
  return actor.role === "admin" || (leadsRun && leadDecidesOn(actor, group, runId));
}

/**
 * Whether the reader decides requests on this request's group, and so reads
 * its page: an admin, or the lead of the programme that names its run, as
 * the decide routes ask. A run's track lead who is neither reads none.
 */
async function gateGroupRegisterForRead(db: Firestore, actor: SessionUser, request: CourseRequestDoc): Promise<boolean> {
  const gated = await gateGroupRegister(request.groupId, actor, db);
  if (!gated.ok || gated.runId !== request.runId) return false;
  return gated.isAdmin || gated.leadsProgramme;
}
