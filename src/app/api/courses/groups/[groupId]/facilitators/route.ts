import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { joinedWeekFor } from "@/lib/courses/groupResolve";
import { asUidList } from "@/lib/firestore/events";
import { courseApplicationId, normalizeCourseApplication, rowIsServedTo } from "@/lib/firestore/courseApplications";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import {
  enrolmentRefsFor,
  facilitatorChange,
  placementsFor,
  writeFacilitatorChange,
  type SeatFacts,
  type SeatProblem,
} from "@/lib/courses/groupFacilitators";
import { byHandElsewhereWords, byHandFullWords, byHandNotYoursWords } from "@/lib/courses/facilitatorAsks/words";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { facilitatorAddedHeadline, facilitatorRemovedHeadline, historyDetail } from "@/lib/courses/groupChange/words";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { isAddressableId } from "@/lib/addressableId";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Staff a group by hand: the route the run editor's group card and a
 * programme's Facilitators view ("Change") use. Every write is
 * `writeFacilitatorChange` in `src/lib/courses/groupFacilitators.ts`, the one
 * place a group's facilitators change, which says why `facilitatorUids` is
 * server-owned and what else moves with it.
 *
 * Gated to admins, the parent run's track leads and the lead of the programme
 * that names the run (`runStaffingOf`): the people who staff a run.
 * Facilitators cannot add each other. Everybody else is one 403 before the
 * body is read, whether or not the group and its run exist; an admin is told
 * what is missing. People are named to the caller by the names rule
 * (`nameForViewer`), and in the history by the name they go by.
 *
 * A FACILITATOR WHO HOLDS A PLACE SITS IN THE GROUP THEY FACILITATE. Somebody
 * added who holds a place on the run and sits in no group yet is placed in
 * this one, in the same transaction, and the answer names them (`placed`).
 * Somebody who sits in another group, or a group with no room for those it
 * would place, saves nothing and is answered with a sentence: the board
 * decides where people sit. A row on the run's list that the application form
 * wrote is the business of an admin and of the lead of the programme that
 * names the run (`rowIsServedTo`), so anybody else adding that person saves
 * nothing either.
 *
 * HISTORY: each person added or taken off writes one row of the group's
 * history (`facilitator-appointed`, `facilitator-removed`), in the same
 * transaction, naming them and the presser.
 */

const ELIGIBLE_ROLES = ["member", "committee", "admin"] as const;

/**
 * Approved members, committee and admins: the eligible facilitator pool.
 * Requested uids are intersected with this set so a forged or since-refused
 * uid can never be written. (Same shape as the run roles route's candidate
 * load; kept local because route handlers don't import from one another.)
 */
async function loadEligibleUids(db: Firestore): Promise<Set<string>> {
  const snap = await db
    .collection("users")
    .where("role", "in", [...ELIGIBLE_ROLES])
    .get();
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * An account's name, for a sentence about them to the caller: the name the
 * caller may see (`nameForViewer`): the committee and admins the full name,
 * anybody else the name people go by.
 */
async function nameOf(db: Firestore, viewer: NameViewer, uid: string): Promise<string> {
  const account = await db.collection("users").doc(uid).get();
  return account.exists ? nameForViewer(viewer, accountNamesOf(account.data() ?? {}), "That person") : "That person";
}

/** A group's name, for a sentence about it. */
async function groupNameOf(db: Firestore, groupId: string): Promise<string> {
  const snap = await db.collection("courseGroups").doc(groupId).get();
  const name = snap.exists ? snap.data()?.name : null;
  return typeof name === "string" && name.trim() ? name.trim() : "another group";
}

type Outcome =
  | { kind: "gone" }
  | { kind: "not-yours" }
  | { kind: "seat"; problem: SeatProblem; groupName: string }
  | { kind: "saved"; placed: string[] };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // AUTHORIZATION BEFORE EXISTENCE. The group and its run are read only to
  // ask who staffs them; anybody who is not an admin and does not staff the
  // run is one 403 whatever is missing, before the body is read. An admin is
  // told what is missing.
  const isAdmin = actor.role === "admin";
  const groupRef = isAddressableId(groupId) ? db.collection("courseGroups").doc(groupId) : null;
  const groupSnap = groupRef ? await groupRef.get() : null;
  const group = groupSnap?.exists ? (groupSnap.data() ?? {}) : null;
  const runId = group && typeof group.runId === "string" && isAddressableId(group.runId) ? group.runId : "";
  const courseId = group && typeof group.courseId === "string" ? group.courseId : "";
  const runSnap = runId ? await db.collection("courseRuns").doc(runId).get() : null;
  const run = runSnap?.exists ? (runSnap.data() ?? {}) : null;
  if (!groupRef || !group || !runSnap || !run) {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!groupRef || !group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    if (!runId) return NextResponse.json({ error: "Group is not attached to a run" }, { status: 400 });
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  // An admin, one of the run's track leads, or the lead of the programme that
  // names the run (`runStaffingOf`).
  const staffing = await runStaffingOf(db, actor, { id: runId, trackLeadUids: asUidList(run.trackLeadUids) });
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { uids?: unknown };
  try {
    body = (await req.json()) as { uids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eligible = await loadEligibleUids(db);
  const requested = asUidList(body.uids);
  if (requested.length > GROUP_FIELD_LIMITS.maxFacilitators) {
    return NextResponse.json(
      { error: `A group can have at most ${GROUP_FIELD_LIMITS.maxFacilitators} facilitators.` },
      { status: 400 },
    );
  }
  const next = requested
    .filter((uid) => eligible.has(uid))
    .slice(0, GROUP_FIELD_LIMITS.maxFacilitators);

  // One transaction: the group, the rows of everybody the change touches and
  // the run's list rows of everybody it adds are read, the places decided,
  // and every write made, so a placement cannot overfill the group while the
  // board fills it too.
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    const fresh = await tx.get(groupRef);
    if (!fresh.exists) return { kind: "gone" };
    const stored = normalizeCourseGroup(fresh.id, fresh.data() ?? {});
    const current = asUidList(fresh.data()?.facilitatorUids);
    const { added, removed } = facilitatorChange(current, next);
    const touched = [...added, ...removed];
    const [enrolments, listed] = await Promise.all([
      touched.length ? tx.getAll(...enrolmentRefsFor(db, runId, touched)) : Promise.resolve([]),
      added.length
        ? tx.getAll(...added.map((uid) => db.collection("courseApplications").doc(courseApplicationId(runId, uid))))
        : Promise.resolve([]),
    ]);
    const enrolmentByUid = new Map(touched.map((uid, i) => [uid, enrolments[i]] as const));

    // Where each person added sits on the run, as this caller may see it.
    const seats = new Map<string, SeatFacts>();
    for (const [i, uid] of added.entries()) {
      const snap = listed[i];
      const row = snap?.exists ? normalizeCourseApplication(snap.id, snap.data() ?? {}) : null;
      if (row && !rowIsServedTo(row, staffing)) return { kind: "not-yours" };
      const enrolment = enrolmentByUid.get(uid);
      seats.set(uid, {
        row: enrolment?.exists ? (enrolment.data() ?? {}) : null,
        accepted: row !== null && row.uid === uid && row.status === "accepted",
      });
    }
    const places = placementsFor({
      group: stored,
      added,
      seats,
      joinedWeekNumber: joinedWeekFor(normalizeCourseRun(runSnap.id, run), stored),
    });
    if (!places.ok) return { kind: "seat", problem: places.problem, groupName: stored.name.trim() || "This group" };
    // The names the history rows give, read before anything is written: the
    // name each goes by, which anybody who reads the group's history may be
    // shown (`nameForViewer` with no committee role).
    const accounts = touched.length ? await tx.getAll(...touched.map((uid) => db.collection("users").doc(uid))) : [];
    const nameOfTouched = new Map(
      accounts.map((account) => [account.id, account.exists ? nameForViewer(null, accountNamesOf(account.data() ?? {}), "That person") : "That person"] as const),
    );

    writeFacilitatorChange(tx, db, {
      groupRef,
      runId,
      courseId,
      current,
      next,
      enrolments: enrolmentByUid,
      recorded: new Set(Object.keys(stored.facilitatorAppointments)),
      placing: places.placing,
    });
    for (const [uid, kind] of [
      ...added.map((each) => [each, "facilitator-appointed"] as const),
      ...removed.map((each) => [each, "facilitator-removed"] as const),
    ]) {
      const name = nameOfTouched.get(uid) ?? "That person";
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({
          kind,
          run: { id: runId },
          group: stored,
          actor,
          subjectUid: uid,
          detail: historyDetail({
            headline: kind === "facilitator-appointed" ? facilitatorAddedHeadline(name) : facilitatorRemovedHeadline(name),
          }),
        }),
      );
    }
    return { kind: "saved", placed: [...places.placing.keys()] };
  });

  if (outcome.kind === "gone") return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (outcome.kind === "not-yours") {
    // Names nobody: such a row is named to an admin or the programme's lead only.
    return NextResponse.json({ error: byHandNotYoursWords() }, { status: 409 });
  }
  if (outcome.kind === "seat") {
    const { problem, groupName } = outcome;
    const name = await nameOf(db, actor, problem.uid);
    const error =
      problem.kind === "elsewhere"
        ? byHandElsewhereWords(name, await groupNameOf(db, problem.groupId), groupName)
        : byHandFullWords(name, groupName);
    return NextResponse.json({ error }, { status: 409 });
  }
  if (outcome.placed.length === 0) return NextResponse.json({ ok: true, facilitatorUids: next });
  const placed = await Promise.all(outcome.placed.map((uid) => nameOf(db, actor, uid)));
  return NextResponse.json({ ok: true, facilitatorUids: next, placed });
}
