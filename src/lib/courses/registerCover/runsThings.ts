import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * THE BAR ONE SESSION IS GIVEN BEHIND, in a module of its own so that the
 * give (`src/app/api/courses/groups/[groupId]/attendance/cover/route.ts`,
 * through `people.ts`) and the register's gate (`registerAccess.ts`, which
 * asks it again every time a given session is used) call the one function.
 */

/** Most groups one run's facilitators are looked for in: the Facilitators view's own bound. */
const MAX_RUN_GROUPS = 50;

/**
 * WHO MAY BE GIVEN ONE SESSION OF A RUN'S GROUP: somebody who already runs
 * things, never any account. The privacy policy says a facilitator's
 * session may be taken by "someone else running the programme", and tells
 * people taking part that others taking part see only their names, so a
 * fellow is never given another group's register. Admitted, each held to the
 * bar they were appointed behind:
 *
 *  - an admin, or a member of the committee;
 *  - the lead of the programme that names the run;
 *  - one of the run's track leads;
 *  - a facilitator of one of the run's groups that still meets.
 *
 * Everybody else is refused by the cover route in one sentence
 * (`COVER_REFUSAL.notRunning`), and the person picker on the group's page
 * lists the same people (`coverCandidatesOf`). Asked again at every use of
 * a given session (`registerAccess.ts`): somebody who runs nothing on the
 * programme does not hold the session they were given.
 */
export async function runsThingsOn(
  db: Firestore,
  run: { id: string; trackLeadUids: unknown },
  person: { standing: SessionUser },
): Promise<boolean> {
  const standing = person.standing;
  if (standing.role === "admin" || standing.role === "committee") return true;
  if (isNamedWithStanding(standing, "courseRuns.trackLeadUids", run.trackLeadUids)) return true;
  if (await programmeLedBy(db, standing, run.id)) return true;
  // One equality on one field, the Facilitators view's own read: no declared index.
  const groups = await db.collection("courseGroups").where("runId", "==", run.id).limit(MAX_RUN_GROUPS).get();
  return groups.docs.some((doc) => {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    return group.runId === run.id && !group.archived && isNamedWithStanding(standing, "courseGroups.facilitatorUids", group.facilitatorUids);
  });
}
