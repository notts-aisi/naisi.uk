import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { own } from "@/lib/applications/keys";
import type { ProgrammeSettings, QuestionSetDoc } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm, loadQuestionSets } from "@/lib/applications/repo";
import { orderedSets } from "@/lib/applications/sections";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { LEADS_AND_ADMINS, NO_PROGRAMME, NO_RUN, RUN_GONE } from "./words";

/**
 * EVERYTHING ASKING STANDS ON, read for one caller: the programme's lead or
 * an admin (`loadProgrammeRun`, which decides it from the form before the run
 * is read, and holds a lead to the lead's bar at the point of use). A
 * reviewer of the programme is refused; anybody with no role on it is told
 * there is no programme here.
 *
 * Then the form and its question sets (the facilitator questions are the
 * table's columns), the run the programme names, and its groups that still
 * meet, in the order every tab of the programme's page lists them.
 */

export type AskRefusal = { ok: false; status: 400 | 403 | 404 | 409 | 502; error: string };

export const refuse = (status: AskRefusal["status"], error: string): AskRefusal => ({ ok: false, status, error });

export type AskContext = {
  ok: true;
  viewer: "admin" | "lead";
  form: ApplicationForm;
  programme: ProgrammeSettings;
  /** The form's question sets, in its order. */
  sets: QuestionSetDoc[];
  run: CourseRunDoc;
  /** The run's live groups, Monday first. */
  groups: CourseGroupDoc[];
};

export async function askContext(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<AskContext | AskRefusal> {
  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status === "none") return refuse(404, NO_PROGRAMME);
  if (outcome.status === "not-yours") return refuse(403, LEADS_AND_ADMINS);
  const { view } = outcome;
  if (!view.run) return refuse(409, view.blank === "run-gone" ? RUN_GONE : NO_RUN);

  const [form, stored, runSnap, groupSnap] = await Promise.all([
    loadForm(db, roundId),
    loadQuestionSets(db, roundId),
    db.collection("courseRuns").doc(view.run.id).get(),
    // One equality on one field, so no declared index.
    db.collection("courseGroups").where("runId", "==", view.run.id).get(),
  ]);
  const programme = form ? own(form.programmes, programmeId) : undefined;
  if (!form || !programme) return refuse(404, NO_PROGRAMME);
  if (!runSnap.exists || runSnap.data()?.destroying === true) return refuse(409, RUN_GONE);

  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const groups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => group.runId === run.id && !group.archived)
    .sort(compareGroupsByMeeting);
  return { ok: true, viewer: view.viewer, form, programme, sets: orderedSets(form, stored), run, groups };
}
