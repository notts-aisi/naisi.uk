import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { firstNameOfUser, namingProgrammeIn, type NamingProgramme } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { standingFacilitators } from "@/lib/courses/registerCover/view";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeVisitRequest, type MemberRequestEvent, type VisitRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION, type CourseRequestStatus } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { approveButtonWords, sessionWhenWords } from "../excused/words";
import { dbReader, joiningOnlineAtHost, planVisit, previewOf, readVisitFacts, sessionChoices } from "../visit/plan";
import { visitLimitRefusal } from "../visit/limits";
import type { VisitPreviewView } from "../visit/view";
import { hostRegisterIdOf, notHeldIn, visitRequestStandingOf, type VisitRequestStanding } from "./standing";
import { closedStaffWords, goneStaffWords, movedSinceWords, rowAboutWords, wouldJoinOnlineWords } from "./words";

/**
 * A REQUEST TO GO TO ANOTHER SESSION, AS ADMINS READ IT: its row on the
 * Requests page, its own page, and how many wait (Home and a programme's
 * head). ADMINS ONLY, everywhere here, as requests to be excused: anybody
 * else is answered `none`, as for a page that is not there, and sent no row.
 *
 * Where each stands is `visitRequestStandingOf`, the one rule: a request that
 * closed by itself or went with the person's place is on no list and in no
 * count, and its page says so with no button.
 *
 * NAMES ONLY, by the names rule for the reader: never an address.
 */

export type Loaded<T> = { status: "ok"; view: T } | { status: "none" };

type Named = { uid: string; name: string };

/** Everything the rows' standings need, read once for a set of requests: runs, every group of each run, each person's place. */
async function standingFacts(db: Firestore, requests: readonly VisitRequestDoc[]) {
  const runIds = [...new Set(requests.map((each) => each.runId))].filter(isAddressableId);
  const [runSnaps, groupSnaps, placeSnaps] = await Promise.all([
    runIds.length ? db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))) : Promise.resolve([]),
    Promise.all(runIds.map((runId) => db.collection("courseGroups").where("runId", "==", runId).get())),
    requests.length ? db.getAll(...requests.map((each) => db.collection("courseEnrolments").doc(courseEnrolmentId(each.runId, each.subjectUid)))) : Promise.resolve([]),
  ]);
  const runs = new Map<string, CourseRunDoc>();
  for (const snap of runSnaps) if (snap.exists && snap.data()?.destroying !== true) runs.set(snap.id, normalizeCourseRun(snap.id, snap.data() ?? {}));
  const groupsOf = new Map<string, CourseGroupDoc[]>();
  runIds.forEach((runId, at) => {
    groupsOf.set(
      runId,
      groupSnaps[at].docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === runId),
    );
  });
  const places = new Map<string, CourseEnrolmentDoc>();
  for (const snap of placeSnaps) if (snap.exists) places.set(snap.id, normalizeCourseEnrolment(snap.id, snap.data() ?? {}));
  // The host's register of each waiting request's week, as every reader reads it (`hostRegisterIdOf`).
  const registerIds = [
    ...new Set(
      requests.flatMap((request) => {
        const run = runs.get(request.runId);
        const id = run && request.status === "waiting" ? hostRegisterIdOf(run, groupsOf.get(request.runId) ?? [], request) : null;
        return id ? [id] : [];
      }),
    ),
  ];
  const registerSnaps = registerIds.length ? await db.getAll(...registerIds.map((id) => db.collection("courseAttendance").doc(id))) : [];
  const notHeld = new Set(registerSnaps.filter((snap) => snap.exists && notHeldIn(snap.id, snap.data())).map((snap) => snap.id));
  const standingOf = (request: VisitRequestDoc, now: Date): VisitRequestStanding => {
    const run = runs.get(request.runId);
    if (!run) return request.status === "waiting" ? { state: "gone" } : { state: request.status };
    const groups = groupsOf.get(request.runId) ?? [];
    const registerId = hostRegisterIdOf(run, groups, request);
    return visitRequestStandingOf({
      request,
      run,
      groups,
      place: places.get(courseEnrolmentId(request.runId, request.subjectUid)) ?? null,
      hostNotHeld: registerId !== null && notHeld.has(registerId),
      now,
    });
  };
  return { runs, groupsOf, standingOf };
}

/** The ones still waiting for a decision, live: neither closed by itself nor gone. For counts. */
export async function liveWaitingVisitRequests(db: Firestore, requests: readonly VisitRequestDoc[], now: Date): Promise<VisitRequestDoc[]> {
  const waiting = requests.filter((each) => each.status === "waiting");
  if (waiting.length === 0) return [];
  const facts = await standingFacts(db, waiting);
  return waiting.filter((each) => facts.standingOf(each, now).state === "waiting");
}

/** A visit request as a row of the Requests page (`loadRequestsPage`'s `RequestRow`). */
export type VisitRow = {
  id: string;
  kind: "visit";
  status: CourseRequestStatus;
  state: "waiting" | "handling" | "approved" | "declined" | "withdrawn";
  askedBy: Named;
  askedAt: string | null;
  subject: Named;
  programme: { roundId: string | null; programmeId: string | null; name: string };
  runId: string;
  group: { id: string; name: string };
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  from: string;
  to: string;
  handling: (Named & { at: string | null }) | null;
  mine: boolean;
  decidedBy: Named | null;
  decidedAt: string | null;
  /** "Group C to Group I, Wed 11 Nov". */
  about: string;
};

/**
 * The rows of these visit requests, for an admin: the live waiting ones and
 * those decided since `since`. Never the person's own words.
 */
export async function visitRequestRows(
  db: Firestore,
  requests: readonly VisitRequestDoc[],
  naming: ReadonlyMap<string, NamingProgramme>,
  viewer: SessionUser,
  since: Date,
  now: Date,
): Promise<VisitRow[]> {
  if (viewer.role !== "admin" || requests.length === 0) return [];
  const facts = await standingFacts(db, requests);
  const shown = requests.filter((request) => {
    const standing = facts.standingOf(request, now);
    if (standing.state === "waiting") return true;
    return (standing.state === "approved" || standing.state === "declined") && request.decidedAt !== null && request.decidedAt.getTime() >= since.getTime();
  });
  const uids = new Set<string>();
  for (const each of shown) for (const uid of [each.subjectUid, each.handlingUid ?? "", each.decidedByUid ?? ""]) if (uid) uids.add(uid);
  const wanted = [...uids].filter(isAddressableId);
  const userSnaps = wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : [];
  const names = new Map<string, string>();
  for (const snap of userSnaps) if (snap.exists) names.set(snap.id, nameForViewer(viewer, accountNamesOf(snap.data() ?? {}), "NAISI member"));
  const named = (uid: string): Named => ({ uid, name: names.get(uid) ?? "NAISI member" });
  return shown.map((request) => {
    const groups = facts.groupsOf.get(request.runId) ?? [];
    const run = facts.runs.get(request.runId);
    const home = groups.find((group) => group.id === request.groupId);
    const host = groups.find((group) => group.id === request.change.hostGroupId);
    const standing = facts.standingOf(request, now);
    const hostDateKey = standing.state === "waiting" && standing.hostSession ? standing.hostSession.dateKey : request.change.asked.dateKey;
    const programmeNaming = naming.get(request.runId) ?? null;
    const state: VisitRow["state"] = request.status === "waiting" ? (request.handlingUid ? "handling" : "waiting") : request.status;
    return {
      id: request.id,
      kind: "visit" as const,
      status: request.status,
      state,
      askedBy: named(request.askedByUid),
      askedAt: request.askedAt ? request.askedAt.toISOString() : null,
      subject: named(request.subjectUid),
      programme: { roundId: request.roundId, programmeId: request.programmeId, name: (programmeNaming?.shortName ?? "").trim() || run?.courseTitle || "" },
      runId: request.runId,
      group: { id: request.groupId, name: home?.name.trim() || "Untitled group" },
      weekNumber: request.change.weekNumber,
      occurrence: 1,
      dateKey: hostDateKey,
      from: home?.name.trim() ?? "",
      to: host?.name.trim() ?? "",
      handling: request.handlingUid ? { ...named(request.handlingUid), at: request.handlingAt ? request.handlingAt.toISOString() : null } : null,
      mine: request.handlingUid === viewer.uid,
      decidedBy: request.decidedByUid ? named(request.decidedByUid) : null,
      decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
      about: rowAboutWords(home?.name ?? "", host?.name ?? "", hostDateKey),
    };
  });
}

// ---------------------------------------------------------------------------
// One request's page
// ---------------------------------------------------------------------------

export type VisitRequestPageView = {
  id: string;
  kind: "visit";
  status: CourseRequestStatus;
  /** Where it stands now: a waiting one closed by itself or gone with the place reads so. */
  state: "waiting" | "approved" | "declined" | "withdrawn" | "closed" | "gone";
  askedAt: string | null;
  subject: Named;
  programme: { name: string };
  runId: string;
  group: { id: string; name: string };
  facilitators: Named[];
  weekNumber: number;
  hostName: string;
  /** The person's own words; "" for none. */
  reason: string;
  /** "Group I · Wed 11 Nov, 6pm to 8pm" and its detail line, as the session is now. */
  asksFor: { words: string; detail: string };
  /** The host's session has moved since they asked; null otherwise. */
  movedSince: string | null;
  /** They ticked "I’d join online": "Daniel would join online."; null when they did not. */
  online: string | null;
  /** Why it is closed, for one that closed by itself or went with the place; null otherwise. */
  closed: string | null;
  /** While it waits: what approving does (the staff visit's own preview), or the one sentence why the visit can't be arranged now. */
  approving: { ok: true; preview: VisitPreviewView; button: string } | { ok: false; error: string } | null;
  replies: { text: string; by: Named; at: string }[];
  reply: string;
  decidedBy: Named | null;
  decidedAt: string | null;
  withdrawnAt: string | null;
  handling: (Named & { at: string | null }) | null;
  mine: boolean;
  history: { what: MemberRequestEvent; by: Named; at: string }[];
  /** It waits, live, and the reader did not ask it. */
  canDecide: boolean;
  canTake: boolean;
  yours: boolean;
};

export async function loadVisitRequestPage(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Loaded<VisitRequestPageView>> {
  if (actor.role !== "admin") return { status: "none" };
  if (!isAddressableId(requestId) || requestId.length > 128) return { status: "none" };
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const request = snap.exists ? normalizeVisitRequest(snap.id, snap.data() ?? {}) : null;
  if (!request) return { status: "none" };
  const facts = await standingFacts(db, [request]);
  const run = facts.runs.get(request.runId);
  if (!run) return { status: "none" };
  const groups = facts.groupsOf.get(request.runId) ?? [];
  const home = groups.find((group) => group.id === request.groupId) ?? null;
  const host = groups.find((group) => group.id === request.change.hostGroupId) ?? null;
  const standing = facts.standingOf(request, now);

  const uids = new Set<string>([request.subjectUid]);
  for (const uid of [request.handlingUid, request.decidedByUid]) if (uid) uids.add(uid);
  for (const reply of request.replies) uids.add(reply.byUid);
  for (const entry of request.history) uids.add(entry.byUid);
  const wanted = [...uids].filter(isAddressableId);
  const [userSnaps, forms, facilitators] = await Promise.all([
    wanted.length ? db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : Promise.resolve([]),
    listForms(db),
    home ? standingFacilitators(db, home, { isAdmin: true, role: actor.role }) : Promise.resolve([]),
  ]);
  const names = new Map<string, string>();
  let personFirstName = "";
  for (const user of userSnaps) {
    if (!user.exists) continue;
    const data = user.data() ?? {};
    names.set(user.id, nameForViewer(actor, accountNamesOf(data), "NAISI member"));
    if (user.id === request.subjectUid) personFirstName = firstNameOfUser(data);
  }
  const named = (uid: string): Named => ({ uid, name: names.get(uid) ?? "NAISI member" });
  const naming = namingProgrammeIn(forms, run.id);

  // What approving would do, from the staff visit's own facts and plan, the
  // request itself being no reason to refuse it.
  let approving: VisitRequestPageView["approving"] = null;
  // As it was offered when they asked, until the session's own words are read.
  const askedWhen = sessionWhenWords(request.change.asked.dateKey, request.change.asked.startTimeLocal);
  let asksFor = { words: [host?.name.trim() || "another group", askedWhen].filter(Boolean).join(" · "), detail: "" };
  if (standing.state === "waiting") {
    const read = await readVisitFacts(dbReader(db), db, run.id, request.subjectUid, [request.change.weekNumber], now);
    if (read.ok) {
      const offered = sessionChoices(read.facts, request.change.weekNumber, now).find((choice) => choice.groupId === request.change.hostGroupId);
      if (offered) asksFor = { words: offered.words, detail: offered.detail };
      const planned = planVisit(read.facts, request.change.weekNumber, request.change.hostGroupId, actor.uid, now, request.id, { isAdmin: true });
      // "I’d join online" ticked: refused here as the press would refuse it, when the host's register can't take the word.
      const online = planned.ok && request.change.online ? joiningOnlineAtHost(read.facts, planned.plan, request.subjectUid, now) : null;
      approving = !planned.ok
        ? { ok: false, error: planned.error }
        : online && !online.ok
          ? { ok: false, error: online.error }
          : {
              ok: true,
              // The sentence a press now would be refused with by the limit on the visit's emails, said before the press.
              preview: previewOf(planned.plan, await visitLimitRefusal(db, run.id, request.subjectUid, actor.uid)),
              button: approveButtonWords(planned.plan.emails, ""),
            };
    } else {
      approving = { ok: false, error: read.error };
    }
  }
  const hostNow = standing.state === "waiting" && standing.hostSession ? standing.hostSession : null;
  const moved =
    hostNow &&
    request.change.asked.dateKey !== "" &&
    (hostNow.dateKey !== request.change.asked.dateKey || hostNow.session.startTimeLocal !== request.change.asked.startTimeLocal);
  const live = standing.state === "waiting";
  return {
    status: "ok",
    view: {
      id: request.id,
      kind: "visit",
      status: request.status,
      state: standing.state,
      askedAt: request.askedAt ? request.askedAt.toISOString() : null,
      subject: named(request.subjectUid),
      programme: { name: (naming?.shortName ?? "").trim() || run.courseTitle || "" },
      runId: run.id,
      group: { id: request.groupId, name: home?.name.trim() || "Untitled group" },
      facilitators: facilitators.map((each) => ({ uid: each.uid, name: each.name })),
      weekNumber: request.change.weekNumber,
      hostName: host?.name.trim() || "another group",
      reason: request.reason,
      asksFor,
      movedSince: moved && hostNow ? movedSinceWords(host?.name ?? "", { dateKey: hostNow.dateKey, startTimeLocal: hostNow.session.startTimeLocal }, personFirstName) : null,
      online: request.change.online ? wouldJoinOnlineWords(personFirstName, named(request.subjectUid).name) : null,
      closed: standing.state === "closed" ? closedStaffWords(standing.lapse) : standing.state === "gone" ? goneStaffWords(personFirstName) : null,
      approving,
      replies: request.replies.map((reply) => ({ text: reply.text, by: named(reply.byUid), at: reply.at.toISOString() })),
      reply: request.reply,
      decidedBy: request.decidedByUid ? named(request.decidedByUid) : null,
      decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
      withdrawnAt: request.withdrawnAt ? request.withdrawnAt.toISOString() : null,
      handling: request.handlingUid ? { ...named(request.handlingUid), at: request.handlingAt ? request.handlingAt.toISOString() : null } : null,
      mine: request.handlingUid === actor.uid,
      history: request.history.map((entry) => ({ what: entry.what, by: named(entry.byUid), at: entry.at.toISOString() })),
      canDecide: live && request.askedByUid !== actor.uid,
      canTake: live && request.askedByUid !== actor.uid && request.handlingUid !== actor.uid,
      yours: request.askedByUid === actor.uid,
    },
  };
}
