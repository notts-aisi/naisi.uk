import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { campusLabel } from "@/lib/courses/campus";
import { firstNameOfUser, namingProgrammeIn, type NamingProgramme } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { standingFacilitators } from "@/lib/courses/registerCover/view";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeMoveRequest, type MemberRequestEvent, type MoveRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION, type CourseRequestStatus } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { approveButtonWords } from "../excused/words";
import { planMove, previewOf, readMoveFacts } from "../staffMove/plan";
import type { MovePreviewView } from "../staffMove/view";
import { FULL } from "../staffMove/words";
import { rowAboutWords } from "../visitRequest/words";
import { placesLeftNow } from "./facts";
import { moveRequestStandingOf, type MoveRequestStanding } from "./standing";
import { groupChoiceDetailWords, groupChoiceTitleWords, moveGoneStaffWords } from "./words";

/**
 * A REQUEST TO CHANGE GROUP FOR GOOD, AS ADMINS READ IT: its row on the
 * Requests page (in "Moves and visits"), its own page, and how many wait
 * (Home and a programme's head). ADMINS ONLY, everywhere here, as requests to
 * go to another session: anybody else, a programme's lead included, is
 * answered `none`, as for a page that is not there, and sent no row.
 *
 * Where each stands is `moveRequestStandingOf`, the one rule: a request that
 * went by itself is on no list and in no count, and its page says so with no
 * button.
 *
 * THE PERSON'S OWN WORDS ("Why (needed)") are drawn on the request's page
 * alone, for the admin reading it: never on a row, in a count, an email, a
 * group's history or a log line.
 *
 * NAMES ONLY, by the names rule for the reader: never an address.
 */

export type Loaded<T> = { status: "ok"; view: T } | { status: "none" };

type Named = { uid: string; name: string };

/** Everything the rows' standings need, read once for a set of requests: runs, every group of each run, each person's place. */
async function standingFacts(db: Firestore, requests: readonly MoveRequestDoc[]) {
  const runIds = [...new Set(requests.map((each) => each.runId))].filter(isAddressableId);
  const [runSnaps, groupSnaps, placeSnaps] = await Promise.all([
    runIds.length ? db.getAll(...runIds.map((id) => db.collection("courseRuns").doc(id))) : Promise.resolve([]),
    Promise.all(runIds.map((runId) => db.collection("courseGroups").where("runId", "==", runId).get())),
    requests.length ? db.getAll(...requests.map((each) => db.collection("courseEnrolments").doc(courseEnrolmentId(each.runId, each.subjectUid)))) : Promise.resolve([]),
  ]);
  const runs = new Map<string, { run: CourseRunDoc; destroying: boolean }>();
  for (const snap of runSnaps) if (snap.exists) runs.set(snap.id, { run: normalizeCourseRun(snap.id, snap.data() ?? {}), destroying: snap.data()?.destroying === true });
  const groupsOf = new Map<string, CourseGroupDoc[]>();
  runIds.forEach((runId, at) => {
    groupsOf.set(
      runId,
      groupSnaps[at].docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === runId),
    );
  });
  const places = new Map<string, CourseEnrolmentDoc>();
  for (const snap of placeSnaps) if (snap.exists) places.set(snap.id, normalizeCourseEnrolment(snap.id, snap.data() ?? {}));
  const standingOf = (request: MoveRequestDoc): MoveRequestStanding => {
    const read = runs.get(request.runId) ?? null;
    return moveRequestStandingOf({
      request,
      run: read?.run ?? null,
      destroying: read?.destroying ?? false,
      groups: groupsOf.get(request.runId) ?? [],
      place: places.get(courseEnrolmentId(request.runId, request.subjectUid)) ?? null,
    });
  };
  return { runs, groupsOf, standingOf };
}

/** The ones still waiting for a decision, live: not gone by themselves. For counts. */
export async function liveWaitingMoveRequests(db: Firestore, requests: readonly MoveRequestDoc[]): Promise<MoveRequestDoc[]> {
  const waiting = requests.filter((each) => each.status === "waiting");
  if (waiting.length === 0) return [];
  const facts = await standingFacts(db, waiting);
  return waiting.filter((each) => facts.standingOf(each).state === "waiting");
}

/** A move request as a row of the Requests page (`loadRequestsPage`'s `RequestRow`). */
export type MoveRow = {
  id: string;
  kind: "move";
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
  /** "Group C to Group F". */
  about: string;
};

/**
 * The rows of these move requests, for an admin: the live waiting ones and
 * those decided since `since`. Never the person's own words.
 */
export async function moveRequestRows(
  db: Firestore,
  requests: readonly MoveRequestDoc[],
  naming: ReadonlyMap<string, NamingProgramme>,
  viewer: SessionUser,
  since: Date,
): Promise<MoveRow[]> {
  if (viewer.role !== "admin" || requests.length === 0) return [];
  const facts = await standingFacts(db, requests);
  const shown = requests.filter((request) => {
    const standing = facts.standingOf(request);
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
    const run = facts.runs.get(request.runId)?.run;
    const from = groups.find((group) => group.id === request.groupId);
    const to = groups.find((group) => group.id === request.change.toGroupId);
    const programmeNaming = naming.get(request.runId) ?? null;
    const state: MoveRow["state"] = request.status === "waiting" ? (request.handlingUid ? "handling" : "waiting") : request.status;
    return {
      id: request.id,
      kind: "move" as const,
      status: request.status,
      state,
      askedBy: named(request.askedByUid),
      askedAt: request.askedAt ? request.askedAt.toISOString() : null,
      subject: named(request.subjectUid),
      programme: { roundId: request.roundId, programmeId: request.programmeId, name: (programmeNaming?.shortName ?? "").trim() || run?.courseTitle || "" },
      runId: request.runId,
      group: { id: request.groupId, name: from?.name.trim() || "Untitled group" },
      weekNumber: request.change.fromWeek ?? 0,
      occurrence: 1,
      dateKey: "",
      from: from?.name.trim() ?? "",
      to: to?.name.trim() ?? "",
      handling: request.handlingUid ? { ...named(request.handlingUid), at: request.handlingAt ? request.handlingAt.toISOString() : null } : null,
      mine: request.handlingUid === viewer.uid,
      decidedBy: request.decidedByUid ? named(request.decidedByUid) : null,
      decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
      about: rowAboutWords(from?.name ?? "", to?.name ?? "", ""),
    };
  });
}

// ---------------------------------------------------------------------------
// One request's page
// ---------------------------------------------------------------------------

export type MoveRequestPageView = {
  id: string;
  kind: "move";
  status: CourseRequestStatus;
  /** Where it stands now: a waiting one gone by itself reads so. */
  state: "waiting" | "approved" | "declined" | "withdrawn" | "gone";
  askedAt: string | null;
  subject: Named;
  programme: { name: string };
  runId: string;
  group: { id: string; name: string };
  facilitators: Named[];
  toName: string;
  /** The person's own words. */
  reason: string;
  /** "Group F · Thursdays, 5pm to 7pm" and its line, as the group is now. */
  asksFor: { words: string; detail: string };
  /** Why it went by itself; null otherwise. */
  closed: string | null;
  /** While it waits: what approving does (the staff move's own preview), or the one sentence why the move can't be made now. */
  approving: { ok: true; preview: MovePreviewView; button: string } | { ok: false; error: string } | null;
  /** The week the move was made from, once approved. */
  fromWeek: number | null;
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

export async function loadMoveRequestPage(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Loaded<MoveRequestPageView>> {
  if (actor.role !== "admin") return { status: "none" };
  if (!isAddressableId(requestId) || requestId.length > 128) return { status: "none" };
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const request = snap.exists ? normalizeMoveRequest(snap.id, snap.data() ?? {}) : null;
  if (!request) return { status: "none" };
  const facts = await standingFacts(db, [request]);
  const run = facts.runs.get(request.runId)?.run;
  if (!run) return { status: "none" };
  const groups = facts.groupsOf.get(request.runId) ?? [];
  const from = groups.find((group) => group.id === request.groupId) ?? null;
  const to = groups.find((group) => group.id === request.change.toGroupId) ?? null;
  const standing = facts.standingOf(request);

  const uids = new Set<string>([request.subjectUid, ...(to?.facilitatorUids ?? [])]);
  for (const uid of [request.handlingUid, request.decidedByUid]) if (uid) uids.add(uid);
  for (const reply of request.replies) uids.add(reply.byUid);
  for (const entry of request.history) uids.add(entry.byUid);
  const wanted = [...uids].filter(isAddressableId);
  const [userSnaps, forms, facilitators] = await Promise.all([
    wanted.length ? db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : Promise.resolve([]),
    listForms(db),
    from ? standingFacilitators(db, from, { isAdmin: true, role: actor.role }) : Promise.resolve([]),
  ]);
  const names = new Map<string, string>();
  const firstNames = new Map<string, string>();
  let personFirstName = "";
  for (const user of userSnaps) {
    if (!user.exists) continue;
    const data = user.data() ?? {};
    names.set(user.id, nameForViewer(actor, accountNamesOf(data), "NAISI member"));
    firstNames.set(user.id, firstNameOfUser(data));
    if (user.id === request.subjectUid) personFirstName = firstNameOfUser(data);
  }
  const named = (uid: string): Named => ({ uid, name: names.get(uid) ?? "NAISI member" });
  const naming = namingProgrammeIn(forms, run.id);

  // The group asked for as it is now, with the staff move's own count of places.
  const left = to ? placesLeftNow(to) : null;
  const asksFor = to
    ? {
        words: groupChoiceTitleWords(to.name, to.session),
        detail: [
          groupChoiceDetailWords({
            campus: campusLabel(to.campus),
            room: to.session.location ?? "",
            facilitatorFirstNames: to.facilitatorUids.filter((uid) => uid !== request.subjectUid).map((uid) => firstNames.get(uid) ?? "").filter(Boolean),
            placesLeft: left !== null && left > 0 ? left : null,
          }),
          left !== null && left <= 0 ? FULL : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : { words: "another group", detail: "" };

  // What approving would do: the staff move's own facts and plan, read as the press will read them.
  let approving: MoveRequestPageView["approving"] = null;
  if (standing.state === "waiting") {
    const read = await readMoveFacts(db, run.id, request.subjectUid);
    if (read.ok) {
      const planned = await planMove(db, read.facts, request.change.toGroupId, actor.uid, now);
      approving = planned.ok ? { ok: true, preview: previewOf(planned.plan), button: approveButtonWords(planned.plan.emails, "") } : { ok: false, error: planned.error };
    } else {
      approving = { ok: false, error: read.error };
    }
  }
  const live = standing.state === "waiting";
  return {
    status: "ok",
    view: {
      id: request.id,
      kind: "move",
      status: request.status,
      state: standing.state,
      askedAt: request.askedAt ? request.askedAt.toISOString() : null,
      subject: named(request.subjectUid),
      programme: { name: (naming?.shortName ?? "").trim() || run.courseTitle || "" },
      runId: run.id,
      group: { id: request.groupId, name: from?.name.trim() || "Untitled group" },
      facilitators: facilitators.map((each) => ({ uid: each.uid, name: each.name })),
      toName: to?.name.trim() || "another group",
      reason: request.reason,
      asksFor,
      closed:
        standing.state === "gone"
          ? moveGoneStaffWords({ why: standing.why, groupName: standing.why === "group" ? groups.find((group) => group.id === standing.groupId)?.name : undefined }, personFirstName)
          : null,
      approving,
      fromWeek: request.change.fromWeek,
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
