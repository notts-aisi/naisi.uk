import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  markedSlotCount,
  maskCoversSession,
  type SessionSlot,
} from "@/lib/admissions/availability";
import type { CourseApplicationDoc } from "@/lib/firestore/courseApplications";
import type { ApplicationDoc, DecisionDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { loadForm } from "../repo";
import { loadApplication, loadDecision } from "../staffRepo";
import { holdsPlaceOn } from "./holders";

/**
 * WHAT THE ALLOCATION BOARD IS TOLD about somebody the application form
 * placed on its run.
 *
 * The board forms groups, and for that it needs two things about each person
 * the form put there: which groups they can make, and whether they still hold
 * the place that put them on the list.
 *
 * ## Read when the board is drawn, and stored nowhere
 *
 * The form keeps availability as a painted week on the person's own
 * application. Nothing of it is copied onto the run: each time the board is
 * read, this module reads the application that row came from and answers
 * with the outcome of the comparison and nothing else, the ids of the groups
 * whose WHOLE weekly session the painted week covers (`maskCoversSession`,
 * the availability module's own test). The week itself never leaves here.
 *
 * So there is one copy of what somebody painted, the one on their
 * application, and whatever deletes that application leaves the board saying
 * "not on file" and not showing a week nobody holds any more.
 *
 * ## Three things a card can say about availability
 *
 *  - `given`: they painted a week, and `canMakeGroupIds` says which groups it
 *    covers. It can be none of them.
 *  - `none-given`: they sent the form with nothing painted. A card says so in
 *    words, because "can make none of these" and "never said" are different.
 *  - `not-on-file`: their application is no longer there to read (its form
 *    was destroyed). The person keeps their place on the run, and nothing is
 *    claimed about when they are free.
 *
 * ## For an admin, and for nobody else
 *
 * A row from the form is served to admins only (`rowIsServedTo`), and an
 * admin may read every application. This function is handed who is asking
 * and answers nothing for anybody else, so a caller that forgot to ask first
 * still gets nothing.
 */

/** A group, reduced to what the comparison reads: its id and its weekly session. */
export type BoardGroup = { id: string; session: SessionSlot };

export type FormPlaceFacts = {
  availability: "given" | "none-given" | "not-on-file";
  /** Each group whose whole weekly session their painted week covers. */
  canMakeGroupIds: string[];
  /**
   * False once they no longer hold the place that put them here: they gave
   * it back after they were handed over. True while nothing says otherwise.
   */
  holdsPlace: boolean;
};

/** What is said about a row whose application cannot be read any more. */
const NOT_ON_FILE: FormPlaceFacts = { availability: "not-on-file", canMakeGroupIds: [], holdsPlace: true };

type FormRow = Pick<CourseApplicationDoc, "uid" | "fromForm">;

function factsFor(
  form: ApplicationForm,
  programmeId: string,
  application: ApplicationDoc | null,
  decision: DecisionDoc | null,
  groups: readonly BoardGroup[],
): FormPlaceFacts {
  if (!application || !application.sent) return NOT_ON_FILE;
  const mask = application.sent.availability;
  const grid = form.round.availabilityGrid;
  const holdsPlace = holdsPlaceOn(form, programmeId, application, decision);
  if (markedSlotCount(mask, grid) === 0) {
    return { availability: "none-given", canMakeGroupIds: [], holdsPlace };
  }
  return {
    availability: "given",
    canMakeGroupIds: groups
      .filter((group) => maskCoversSession(mask, grid, group.session))
      .map((group) => group.id),
    holdsPlace,
  };
}

/**
 * The facts for each row the form put on a run, by the person's uid. Rows
 * with no `fromForm` are passed over: they applied to the run itself, and
 * the board reads what they ticked off their own row.
 */
export async function formPlaceFactsFor(
  db: Firestore,
  viewer: { isAdmin: boolean },
  rows: readonly FormRow[],
  groups: readonly BoardGroup[],
): Promise<Map<string, FormPlaceFacts>> {
  const facts = new Map<string, FormPlaceFacts>();
  if (!viewer.isAdmin) return facts;

  const byRound = new Map<string, { uid: string; programmeId: string }[]>();
  for (const row of rows) {
    if (!row.fromForm || !row.uid) continue;
    const list = byRound.get(row.fromForm.roundId) ?? [];
    list.push({ uid: row.uid, programmeId: row.fromForm.programmeId });
    byRound.set(row.fromForm.roundId, list);
  }

  for (const [roundId, people] of byRound) {
    const form = await loadForm(db, roundId);
    if (!form) {
      for (const person of people) facts.set(person.uid, NOT_ON_FILE);
      continue;
    }
    // Addressed by id through the staff readers, never queried: each
    // person's application and decision sit at one known path, so only the
    // people on this board are read, and each is read the one way it is read
    // everywhere else.
    const read = await Promise.all(
      people.map(async (person) => ({
        person,
        application: await loadApplication(db, form, person.uid),
        decision: await loadDecision(db, roundId, person.uid),
      })),
    );
    for (const { person, application, decision } of read) {
      facts.set(person.uid, factsFor(form, person.programmeId, application, decision, groups));
    }
  }
  return facts;
}
