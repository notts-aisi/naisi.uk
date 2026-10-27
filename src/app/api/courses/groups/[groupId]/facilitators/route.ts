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
 * Facilitators cannot add each other.
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

/** An account's name, for a sentence about them. */
async function nameOf(db: Firestore, uid: string): Promise<string> {
  const account = await db.collection("users").doc(uid).get();
  const name = account.exists ? account.data()?.displayName : null;
  return typeof name === "string" && name.trim() ? name.trim() : "That person";
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

  let body: { uids?: unknown };
  try {
    body = (await req.json()) as { uids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupRef = db.collection("courseGroups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const group = groupSnap.data() ?? {};
  const runId = typeof group.runId === "string" ? group.runId : "";
  const courseId = typeof group.courseId === "string" ? group.courseId : "";
  if (!runId) {
    return NextResponse.json({ error: "Group is not attached to a run" }, { status: 400 });
  }

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = runSnap.data() ?? {};

  // An admin, one of the run's track leads, or the lead of the programme that
  // names the run (`runStaffingOf`).
  const staffing = await runStaffingOf(db, actor, { id: runId, trackLeadUids: asUidList(run.trackLeadUids) });
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    return { kind: "saved", placed: [...places.placing.keys()] };
  });

  if (outcome.kind === "gone") return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (outcome.kind === "not-yours") {
    // Names nobody: such a row is named to an admin or the programme's lead only.
    return NextResponse.json({ error: byHandNotYoursWords() }, { status: 409 });
  }
  if (outcome.kind === "seat") {
    const { problem, groupName } = outcome;
    const name = await nameOf(db, problem.uid);
    const error =
      problem.kind === "elsewhere"
        ? byHandElsewhereWords(name, await groupNameOf(db, problem.groupId), groupName)
        : byHandFullWords(name, groupName);
    return NextResponse.json({ error }, { status: 409 });
  }
  if (outcome.placed.length === 0) return NextResponse.json({ ok: true, facilitatorUids: next });
  const placed = await Promise.all(outcome.placed.map((uid) => nameOf(db, uid)));
  return NextResponse.json({ ok: true, facilitatorUids: next, placed });
}
