import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun, type ProgrammeRunView } from "@/lib/applications/handover/programmeRun";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * THE LEAD'S DOOR TO A GROUP'S WEEK: the programme's lead (Q30, Q31, and
 * Zach on Mon 26 Oct for a facilitator's own work) and admins, from the
 * programme's own pages, because a lead holds no role on the run that would
 * let them through `/learn/[runId]`.
 *
 * Decided from the form before the run is read (`loadProgrammeRun`): an admin
 * or the programme's lead; a reviewer is told the page is the lead's and an
 * admin's; anybody with no role on the programme, or a programme that is not
 * there, gets the programme pages' calm not-here answer. Then the run the
 * programme names, while it is on the site, and one of its live groups: the
 * one asked for by `?group=`, or the first in the order every tab lists
 * them. Nothing is read about anybody here.
 */
export type LeadDoor =
  | { kind: "none" }
  | { kind: "not-yours" }
  | { kind: "blank"; view: ProgrammeRunView }
  /** The run has no live group yet. */
  | { kind: "no-groups"; view: ProgrammeRunView }
  | {
      kind: "open";
      view: ProgrammeRunView;
      run: CourseRunDoc;
      /** The run's live groups, in the one order the tabs list them. */
      groups: CourseGroupDoc[];
      group: CourseGroupDoc;
      viewer: "lead" | "admin";
    };

export async function openLeadDoor(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  askedGroup: unknown,
): Promise<LeadDoor> {
  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return { kind: "none" };
  if (outcome.status === "not-yours") return { kind: "not-yours" };
  const { view } = outcome;
  if (!view.run) return { kind: "blank", view };
  const runSnap = await db.collection("courseRuns").doc(view.run.id).get();
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) return { kind: "blank", view: { ...view, blank: "run-gone" } };
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  // One equality on one field, as the programme's tabs read a run's groups.
  const groupSnap = await db.collection("courseGroups").where("runId", "==", run.id).get();
  const groups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === run.id)
    .map((group) => ({ ...group, name: group.name.trim() || "Untitled group" }))
    .sort(compareGroupsByMeeting);
  const wanted = typeof askedGroup === "string" && isAddressableId(askedGroup) ? askedGroup : null;
  const group = groups.find((candidate) => candidate.id === wanted) ?? groups[0] ?? null;
  if (!group) return { kind: "no-groups", view };
  return { kind: "open", view, run, groups, group, viewer: view.viewer === "admin" ? "admin" : "lead" };
}
