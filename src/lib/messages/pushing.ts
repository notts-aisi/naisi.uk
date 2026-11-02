import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { TermRoles } from "@/lib/audience/load";
import { UNNAMED_GROUP } from "@/lib/audience/words";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { NO_RUN_PUSH_PATH, groupPushPath, runPushPath, runPushTitle, type PushTarget } from "./pushTarget";

/**
 * WHAT THE NOTIFICATION BESIDE A MESSAGE SAYS, for the sends that push
 * (`pushTargetOf` in `./pushTarget.ts`), worked out from the term the writer's
 * gate already read (`TermRoles`), so it is the run and the group the send's
 * tags resolved to:
 *
 *  - a group: the group's name, and its page;
 *  - a programme's people: the title the cohort email's push carried (the
 *    course's title, else the run's label), and the run's home. One read, of
 *    the run, for its title. A programme that names no run has no home on the
 *    site yet, so its notification is titled with the programme's name and
 *    opens the person's programmes.
 *
 * The subject is the words of either. Builds the note and sends nothing: the
 * send route hands it to the notice lane's push door, once a person.
 */

export type PushNote = { title: string; body: string; url: string };

/** The note for a send's push target, or null when the target is not one of the term's. */
export async function pushNoteFor(db: Firestore, roles: TermRoles, target: PushTarget, subject: string): Promise<PushNote | null> {
  if (target.kind === "group") {
    const run = roles.runs.find((each) => each.groups.some((group) => group.id === target.groupId));
    const group = run?.groups.find((each) => each.id === target.groupId);
    if (!run || !group) return null;
    return { title: group.name.trim() || UNNAMED_GROUP, body: subject, url: groupPushPath(run.runId, group.id) };
  }
  if (!roles.form || roles.form.round.id !== target.roundId) return null;
  const programme = roles.programmes.find((each) => each.programmeId === target.programmeId);
  if (!programme) return null;
  const run = roles.runs.find((each) => each.programmeId === target.programmeId);
  if (!run) return { title: programme.name, body: subject, url: NO_RUN_PUSH_PATH };
  const snap = await db.collection("courseRuns").doc(run.runId).get();
  const doc = snap.exists ? normalizeCourseRun(snap.id, snap.data() ?? {}) : null;
  return { title: runPushTitle(doc, programme.name), body: subject, url: runPushPath(run.runId) };
}
