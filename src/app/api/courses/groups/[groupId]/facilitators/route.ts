import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { asUidList } from "@/lib/firestore/events";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { enrolmentRefsFor, facilitatorChange, writeFacilitatorChange } from "@/lib/courses/groupFacilitators";
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
 * NEVER SOMEBODY TAKING PART (Q21): an account with a live learner's row on
 * this run is refused as one of its facilitators, with a sentence. Somebody
 * who has left the run, or takes part in another, can facilitate it.
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

/** Q21, in the words the Facilitators view uses for the same rule. */
const TAKING_PART = "can’t facilitate a programme they’re taking part in";

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

  const current = asUidList(group.facilitatorUids);
  const { added, removed } = facilitatorChange(current, next);

  // Read every enrolment we might touch up front: Firestore batches are
  // write-only, so the add/retire decisions are made from these snapshots.
  const touched = [...added, ...removed];
  const enrolments = touched.length ? await db.getAll(...enrolmentRefsFor(db, runId, touched)) : [];
  const enrolmentByUid = new Map(touched.map((uid, i) => [uid, enrolments[i]] as const));

  // Q21: nobody facilitates a run they are taking part in.
  const takingPart = added.filter((uid) => {
    const row = enrolmentByUid.get(uid);
    const data = row?.exists ? (row.data() ?? {}) : null;
    return data !== null && data.role === "learner" && data.status === "active";
  });
  if (takingPart.length > 0) {
    const names = await Promise.all(
      takingPart.map(async (uid) => {
        const account = await db.collection("users").doc(uid).get();
        const name = account.exists ? account.data()?.displayName : null;
        return typeof name === "string" && name.trim() ? name.trim() : "That person";
      }),
    );
    return NextResponse.json(
      { error: `${names.join(" and ")} ${TAKING_PART}, so nothing was saved.` },
      { status: 409 },
    );
  }

  const appointments = group.facilitatorAppointments;
  const recorded = new Set(
    appointments && typeof appointments === "object" ? Object.keys(appointments as Record<string, unknown>) : [],
  );
  const batch = db.batch();
  writeFacilitatorChange(batch, db, {
    groupRef,
    runId,
    courseId,
    current,
    next,
    enrolments: enrolmentByUid,
    recorded,
  });
  await batch.commit();

  return NextResponse.json({ ok: true, facilitatorUids: next });
}
