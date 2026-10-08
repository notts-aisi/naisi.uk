import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadForm, loadOwnApplication } from "../repo";
import { standingOf } from "./standing";

/**
 * DOES THIS PERSON STILL HOLD THE PLACE THE FORM GAVE THEM?
 *
 * Asked by the member area, about the caller's own application and nobody
 * else's, for one purpose. Once an admin has handed people over to a course
 * run, each of them has a row on that run saying they hold a place, and the
 * member area draws that as "you have a place" until a group is set. Nothing
 * takes the row away when somebody later gives the place back on the form.
 * So before the member area says it, it asks here whether it is still true.
 *
 * READ OFF THEIR OWN DOCUMENT, by the reading their own application page is
 * drawn from (`standingOf`): `place` means they hold one. Somebody who said
 * they cannot make it reads `released`, and the member area then says
 * nothing about a place they no longer have. No decision document is read:
 * this module is on the applicant's side of the system, and after decision
 * day what a person holds is on their own application.
 *
 * WHEN THERE IS NOTHING TO READ, THE PLACE STANDS. A form that has been
 * destroyed takes its applications with it, and the runs outlive it: the
 * people on a run keep their place, so the answer with no form, or with no
 * application, is yes. Only the person's own reply ever turns it to no.
 *
 * A caller reads the caller's own application here, so a view-as session
 * must be turned away BEFORE this is called
 * (`tests/applications-view-as-own-application.test.mjs` holds each caller
 * to that).
 */
export async function ownPlaceStands(db: Firestore, roundId: string, uid: string): Promise<boolean> {
  const form = await loadForm(db, roundId);
  if (!form) return true;
  const application = await loadOwnApplication(db, form, uid);
  if (!application) return true;
  return standingOf(application).kind === "place";
}
