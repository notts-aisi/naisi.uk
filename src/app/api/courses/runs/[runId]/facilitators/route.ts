import { NextResponse } from "next/server";
import { namesInWords, weeklySlotWords } from "@/lib/courses/facilitatingEmail";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser, type Role } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { isEligibleAdmissionsReviewer } from "@/lib/firestore/users";

/**
 * A RUN'S GROUPS, WHO FACILITATES EACH, AND WHO COULD: what the Facilitators
 * view of a programme's Groups tab draws and picks from. Read only; a change
 * goes through the group's own facilitators route.
 *
 * The people are the ones that route will accept: every approved account
 * (member, committee or admin), the same `role in` query it intersects a
 * request with. NAMES, IDS AND ROLES ONLY: never an address, so the lead of a
 * programme, who never sees one, can staff a group.
 *
 * WHO MAY READ: somebody who may staff the run's groups (an admin, one of
 * the run's track leads, or the lead of the programme that names it:
 * `doesTrackLeadWork`) AND who may read the member roster at all, which is
 * the tier `firestore.rules` opens `users` to: an admin or SU-recognised
 * committee. A programme's lead always is one. A run's track lead who is a
 * plain member is refused, as the roster is closed to them in the run editor.
 *
 * The roster's tier is decided from the session before anything is read. A
 * run that is not there is a 404 only for somebody who could read a roster
 * anyway.
 */

type Ctx = { params: Promise<{ runId: string }> };

/** The accounts the facilitators route accepts. */
const ELIGIBLE_ROLES = ["member", "committee", "admin"];

/** One group of the run, as the view draws it. */
export type RunFacilitatorGroup = {
  id: string;
  name: string;
  /** "Tuesdays at 6pm", or null while the group has no day and time. */
  when: string | null;
  /** Who facilitates it now, in the group's own order. */
  facilitators: { uid: string; name: string }[];
  /** Their names in a sentence: "Rahul and Sofia". Empty when nobody does. */
  facilitatorWords: string;
};

/** Somebody the facilitators route would accept. */
export type FacilitatorCandidate = { uid: string; name: string; role: Role };

export type RunFacilitatorsPayload = {
  groups: RunFacilitatorGroup[];
  people: FacilitatorCandidate[];
};

export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // The roster's own tier, from the session alone (firestore.rules: the
  // admin and SU-recognised committee read of `users`).
  if (!isEligibleAdmissionsReviewer(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  if (!doesTrackLeadWork(await runStaffingOf(db, actor, run))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // One equality and one `in`, each on one field, so no declared index.
  const [groupSnap, peopleSnap] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", runId).limit(50).get(),
    db.collection("users").where("role", "in", ELIGIBLE_ROLES).get(),
  ]);

  const people: FacilitatorCandidate[] = peopleSnap.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return { uid: doc.id, name: displayNameOf(data), role: data.role as Role };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));
  const nameOf = new Map(people.map((person) => [person.uid, person.name] as const));

  // The groups that still run, Monday first, as the allocation board orders
  // its columns. A facilitator who is no longer an approved account is still
  // shown on their group, so the view can take them off it.
  const groups: RunFacilitatorGroup[] = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived)
    .sort((a, b) => {
      const day = ((a.session.weekday + 6) % 7) - ((b.session.weekday + 6) % 7);
      return day || a.session.startTimeLocal.localeCompare(b.session.startTimeLocal) || a.name.localeCompare(b.name);
    })
    .map((group) => {
      const facilitators = group.facilitatorUids.map((uid) => ({ uid, name: nameOf.get(uid) ?? "NAISI member" }));
      return {
        id: group.id,
        name: group.name.trim() || "Untitled group",
        when: weeklySlotWords(group.session),
        facilitators,
        facilitatorWords: namesInWords(facilitators.map((facilitator) => facilitator.name)),
      };
    });

  const payload: RunFacilitatorsPayload = { groups, people };
  return NextResponse.json(payload);
}
