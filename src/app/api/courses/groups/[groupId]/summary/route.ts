import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import {
  loadFacilitatorGroup,
  readNextEmailForHome,
  type GroupLeftRecently,
} from "@/lib/courses/facilitatorGroup";
import type { NextEmailLine } from "@/lib/courses/registerEnding";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * WHAT A FACILITATOR'S HOME SAYS ABOUT THEIR GROUP (board wk-fac-home-phone),
 * beside what the run's overview already says: how many are expected at the
 * next session, how many exercises wait for a review, when next week's email
 * goes while it is on its schedule, who left the group recently, and the
 * group's other facilitators by first name.
 *
 *   GET  ->  FacilitatorSummary
 *
 * WHO READS IT: a live facilitator of the group, and admins: the group
 * page's own gate. Everybody else, and a group that is not there, is one 403;
 * an admin is told the group is missing. A GET writes nothing.
 *
 * Every value is worked out by the module the group page draws from
 * (`src/lib/courses/facilitatorGroup.ts`), so Home and the group page never
 * disagree. Names only, never an address, and the answer is built field by
 * field.
 */

/** Next week's email, as Home says it: the states a session still to come can be in. */
export type HomeNextEmail = Exclude<NextEmailLine, { state: "missed" }>;

export type FacilitatorSummary = {
  groupId: string;
  /** The people taking part in the group: who is expected at the next session. */
  expected: number;
  /** Somebody placed in the group has not been told it yet. Never for an admin. */
  notYetTold: boolean;
  /** Rows of exercises waiting for a review, as the group page lists them. */
  toReview: number;
  /** Null while next week's email is not on its schedule, or no email is left to go. */
  nextEmail: HomeNextEmail | null;
  /** Who left recently, by name, and the register they are off from. */
  leftRecently: GroupLeftRecently[];
  /** The group's other facilitators who stand behind the role, by first name, in the group's order. */
  coFacilitators: string[];
};

export async function GET(_req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const isAdmin = actor.role === "admin";
  const facilitates = Boolean(
    group && !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  if (!isAdmin && !facilitates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group || !isAddressableId(group.runId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const runSnap = await db.collection("courseRuns").doc(group.runId).get();
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const now = new Date();
  const model = await loadFacilitatorGroup(db, run, group, { isAdmin }, now);
  const line = await readNextEmailForHome(db, run, group, model.scheduled, now);

  const answer: FacilitatorSummary = {
    groupId: group.id,
    expected: model.expected,
    notYetTold: model.notYetTold,
    toReview: model.toReview.length,
    nextEmail: line && line.state !== "missed" ? line : null,
    leftRecently: model.leftRecently.map((person) => ({
      uid: person.uid,
      name: person.name,
      firstName: person.firstName,
      leftDateKey: person.leftDateKey,
      from: person.from,
    })),
    coFacilitators: model.facilitators.filter((person) => person.uid !== actor.uid).map((person) => person.firstName),
  };
  return NextResponse.json(answer);
}
