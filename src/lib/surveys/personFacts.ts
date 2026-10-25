import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, readRunLead } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { courseEnrolmentId, enrolmentHasLeft, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import type { SurveyDoc } from "@/lib/firestore/surveys";
import type { ConfidentialFacts } from "./words";

/**
 * WHAT A SURVEY SAYS ABOUT ONE PERSON, from records: their group on the
 * programme's run, as they have been told it, and from that two facts.
 *
 *  - The confidential box names the programme's lead and the person's own
 *    group's facilitators (sv-privacy). A placement Publish has not told them
 *    is no group of theirs yet (`placementIsTold`), so nobody's group is
 *    named early: the box then speaks of "your facilitators" without names.
 *  - Whether their answers came after their group first met, worked out at
 *    the moment they are sent and kept with them, so the comparison can leave
 *    them out.
 */

/** The group a person is in on a run and has been told about, or null; with the run it is on. */
export type ToldGroup = { run: CourseRunDoc; group: CourseGroupDoc } | null;

export async function toldGroupOf(db: Firestore, runId: string, uid: string): Promise<ToldGroup> {
  if (!runId || runId.includes("/") || !uid || uid.includes("/")) return null;
  const enrolSnap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  if (!enrolSnap.exists) return null;
  const enrolment = normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {});
  if (enrolment.uid !== uid || enrolment.runId !== runId || enrolment.role !== "learner") return null;
  if (enrolmentHasLeft(enrolment.status) || !enrolment.groupId || !placementIsTold(enrolment)) return null;
  if (enrolment.groupId.includes("/")) return null;
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").doc(enrolment.groupId).get(),
  ]);
  if (!runSnap.exists || !groupSnap.exists) return null;
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.runId !== runId || group.archived) return null;
  return { run: normalizeCourseRun(runSnap.id, runSnap.data() ?? {}), group };
}

/**
 * Whether the group has met: true from the start of its first session that is
 * not cancelled. A group whose sessions cannot be dated has not met.
 */
export function groupHasMet(told: ToldGroup, now: Date): boolean {
  if (!told) return false;
  let first: number | null = null;
  for (const session of resolveSessions(told.run, told.group)) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (startsAt && (first === null || startsAt.getTime() < first)) first = startsAt.getTime();
  }
  return first !== null && now.getTime() >= first;
}

async function firstNamesOf(db: Firestore, uids: readonly string[]): Promise<string[]> {
  const wanted = uids.filter((uid) => uid && !uid.includes("/"));
  if (wanted.length === 0) return [];
  const docs = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  const names: string[] = [];
  for (const doc of docs) {
    if (!doc.exists) continue;
    const name = firstNameOfUser((doc.data() ?? {}) as Record<string, unknown>);
    if (name) names.push(name);
  }
  return names;
}

/**
 * The box's facts for one person. The lead is named while they still meet the
 * bar a lead is appointed behind (`readRunLead`). A lead who also facilitates
 * the person's group is left out of the facilitators, so the box never says
 * of one person both that they see totals and that they see nothing.
 */
export async function confidentialFactsFor(
  db: Firestore,
  survey: Pick<SurveyDoc, "runId" | "namesOffOn" | "programmeKind">,
  uid: string | null,
): Promise<ConfidentialFacts> {
  const [lead, told] = await Promise.all([
    readRunLead(db, survey.runId),
    uid ? toldGroupOf(db, survey.runId, uid) : Promise.resolve(null),
  ]);
  let facilitatorNames: string[] | null = null;
  if (told && told.group.facilitatorUids.length > 0) {
    const others = told.group.facilitatorUids.filter((facilitator) => facilitator !== lead?.uid);
    facilitatorNames = await firstNamesOf(db, others);
  }
  return {
    leadName: lead?.firstName || null,
    facilitatorNames,
    namesOffOn: survey.namesOffOn ?? "",
    programmeKind: survey.programmeKind,
  };
}
