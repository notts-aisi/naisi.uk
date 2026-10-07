import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { isId } from "../keys";
import { loadForm, loadOwnApplication, loadQuestionSets } from "../repo";
import { orderedSets } from "../sections";
import {
  projectApplicationForOwner,
  projectFormForApplicant,
  projectQuestionSetForApplicant,
} from "../applicant/project";
import { isFormVisible } from "../applicant/window";
import { statusViewFor, type StatusView } from "./view";

/**
 * Reading what "Your application" shows one person, on the server.
 *
 * It reads the form, its question sets and the caller's OWN application,
 * through `../repo.ts`, and nothing else. The uid comes from the session, so
 * there is no id a caller can change to reach somebody else's document.
 *
 * ## Who is told that a form exists
 *
 * A form that is still a draft, or has been archived, is not something a
 * stranger may learn about: the answer for one is null, exactly as it is for
 * an id that addresses nothing, and the caller treats both the same way.
 * Somebody who APPLIED on that form is different. They know it exists, and
 * what they sent and what they were told are still theirs to read, so they
 * get their page whatever has happened to the form since.
 */

export type LoadedStatus = {
  roundId: string;
  view: StatusView;
};

export async function loadStatus(
  db: Firestore,
  roundId: string,
  uid: string,
  now: Date,
): Promise<LoadedStatus | null> {
  if (!isId(roundId)) return null;
  const form = await loadForm(db, roundId);
  if (!form) return null;
  const application = await loadOwnApplication(db, form, uid);
  if (!application && !isFormVisible(form, now)) return null;
  const sets = orderedSets(form, await loadQuestionSets(db, roundId));
  return {
    roundId: form.round.id,
    view: statusViewFor(
      projectFormForApplicant(form, now),
      sets.map(projectQuestionSetForApplicant),
      application ? projectApplicationForOwner(application) : null,
      londonDateKey(now),
    ),
  };
}

/** True when there is a form here that an applicant may be told about. */
export async function formIsThere(db: Firestore, roundId: string, now: Date): Promise<boolean> {
  if (!isId(roundId)) return false;
  const form = await loadForm(db, roundId);
  return form !== null && isFormVisible(form, now);
}
