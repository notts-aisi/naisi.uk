import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, readRunLead } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { courseEnrolmentId, enrolmentHasLeft, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import type { SurveyDoc } from "@/lib/firestore/surveys";
import { facilitatesOnRun } from "@/lib/courses/writtenAnswers/access";
import { isLinesQuestion } from "./items";
import { FACILITATOR_LINE_ID } from "./templates";
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
 * of one person both that they see totals and that they see nothing. So is
 * the reader: a facilitator who holds a place in the group they run is one of
 * its people, and is never told that they cannot see their own answers (Zach,
 * 26 October 2026). A facilitator who runs the group alone reads no sentence
 * about its facilitators at all.
 */
export async function confidentialFactsFor(
  db: Firestore,
  survey: Pick<SurveyDoc, "runId" | "namesOffOn" | "programmeKind"> & Partial<Pick<SurveyDoc, "kind">>,
  uid: string | null,
): Promise<ConfidentialFacts> {
  const [lead, told] = await Promise.all([
    readRunLead(db, survey.runId),
    uid ? toldGroupOf(db, survey.runId, uid) : Promise.resolve(null),
  ]);
  let facilitatorNames: string[] | null = null;
  if (told && told.group.facilitatorUids.length > 0) {
    const others = told.group.facilitatorUids.filter((facilitator) => facilitator !== lead?.uid && facilitator !== uid);
    facilitatorNames = await firstNamesOf(db, others);
  }
  return {
    stage: survey.kind ?? "before",
    leadName: lead?.firstName || null,
    facilitatorNames,
    namesOffOn: survey.namesOffOn ?? "",
    programmeKind: survey.programmeKind,
  };
}

/**
 * The lines of the survey's lines questions this person is not shown: the
 * Facilitator line of "How valuable was each part?", to somebody who
 * facilitates a live group of the run, a facilitator who holds a place
 * included, who would be rating their own facilitating (Zach, 26 October
 * 2026). Whether somebody facilitates on a run is `facilitatesOnRun`'s
 * answer, as it is for a facilitator's own work. Nothing is read for a survey
 * without that line, or for nobody.
 */
export async function hiddenLinesFor(
  db: Firestore,
  survey: Pick<SurveyDoc, "runId" | "items">,
  uid: string | null,
): Promise<string[]> {
  const asks = survey.items.some((item) => isLinesQuestion(item) && item.lines.some((line) => line.id === FACILITATOR_LINE_ID));
  if (!uid || !asks || !survey.runId || survey.runId.includes("/")) return [];
  // The run's groups, read for who facilitates them and never listed.
  const snap = await db.collection("courseGroups").where("runId", "==", survey.runId).get();
  const groups = snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === survey.runId);
  return facilitatesOnRun(uid, groups) ? [FACILITATOR_LINE_ID] : [];
}

/**
 * `hiddenLinesFor` for several people at once, with the run's groups read
 * once: the admins' Who answered tab asks it of everybody who answered, to
 * say how many questions each left blank. The same rule, person by person.
 */
export async function hiddenLinesForEach(
  db: Firestore,
  survey: Pick<SurveyDoc, "runId" | "items">,
  uids: readonly string[],
): Promise<Map<string, string[]>> {
  const asks = survey.items.some((item) => isLinesQuestion(item) && item.lines.some((line) => line.id === FACILITATOR_LINE_ID));
  if (!asks || uids.length === 0 || !survey.runId || survey.runId.includes("/")) return new Map();
  const snap = await db.collection("courseGroups").where("runId", "==", survey.runId).get();
  const groups = snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === survey.runId);
  return new Map(uids.map((uid) => [uid, facilitatesOnRun(uid, groups) ? [FACILITATOR_LINE_ID] : []]));
}
