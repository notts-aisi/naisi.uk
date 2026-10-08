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
import { listWordsFor, placeWordsFor, type ListWords, type PlaceWords } from "./words";

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

/**
 * What the list of somebody's applications says for each one made on an
 * application form, by round id: the chip and the title their own page shows
 * for the outcome (`listWordsFor`).
 *
 * A round that is not an application form has no entry, and neither has an
 * application with no outcome to state yet, so the list keeps its own words
 * for both. Read through {@link loadStatus}, the page's own read, so the row
 * and the page it opens are drawn from one view of one document: the
 * caller's own.
 */
export async function loadListWords(
  db: Firestore,
  uid: string,
  roundIds: readonly string[],
  now: Date,
): Promise<Map<string, ListWords>> {
  const said = new Map<string, ListWords>();
  await Promise.all(
    [...new Set(roundIds)].map(async (roundId) => {
      const loaded = await loadStatus(db, roundId, uid, now);
      const words = loaded ? listWordsFor(loaded.view) : null;
      if (words) said.set(roundId, words);
    }),
  );
  return said;
}

/**
 * The places this person holds, by round id: for each form decision day gave
 * them a place on, the title and the sentence their own page shows
 * (`placeWordsFor`).
 *
 * For the two pages of the member area that would otherwise tell somebody
 * with a place and no run that they are on nothing. A round that is not an
 * application form has no entry, and neither has an application that holds
 * no place. Read through {@link loadStatus}, the page's own read, exactly as
 * {@link loadListWords} is: one view of one document, the caller's own, so
 * these pages can say nothing the person's own page does not.
 */
export async function loadPlaceWords(
  db: Firestore,
  uid: string,
  roundIds: readonly string[],
  now: Date,
): Promise<Map<string, PlaceWords>> {
  const held = new Map<string, PlaceWords>();
  await Promise.all(
    [...new Set(roundIds)].map(async (roundId) => {
      const loaded = await loadStatus(db, roundId, uid, now);
      const words = loaded ? placeWordsFor(loaded.view) : null;
      if (words) held.set(roundId, words);
    }),
  );
  return held;
}

/** True when there is a form here that an applicant may be told about. */
export async function formIsThere(db: Firestore, roundId: string, now: Date): Promise<boolean> {
  if (!isId(roundId)) return false;
  const form = await loadForm(db, roundId);
  return form !== null && isFormVisible(form, now);
}
