import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { ADMISSION_PRIVATE_FIELD_LIMITS } from "@/lib/firestore/admissionApplicationPrivate";
import { normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef } from "../repo";
import { accessRequirementsIn, accessRequirementsRef } from "./accessRequirementsDoc";
import { ApplicantError } from "./store";

/**
 * ONE PERSON'S OWN ACCESS-REQUIREMENTS ANSWER: reading it back to them, and
 * saving what they type.
 *
 * The box is on the last step of the form and is optional. What somebody
 * writes in it is, in practice, about their health, a disability or who they
 * care for, so it is kept apart from the application (`./accessRequirementsDoc.ts`
 * says where and why) and it is addressed here by the caller's own uid, which
 * the route takes from the session and never from the request.
 *
 * ## It is not part of the two copies
 *
 * An application has a `draft` and a `sent`, and a change to an answer counts
 * only once the applicant presses Send again. This answer is neither. It is
 * saved as it is typed, there is one copy of it, and what an admin opens is
 * what is stored at that moment. Nothing here reads or writes the application
 * document: the save only checks that the application exists.
 *
 * ## It can be changed until the close
 *
 * The route refuses a save outside the form's window, as it does a draft.
 *
 * ## No row without an application
 *
 * The first save of a draft is what creates an application, and the form
 * saves the draft before it saves this. A save that arrives where there is no
 * application writes nothing and says the same request will succeed once
 * there is one.
 */

/** What a save answers with when no application has been started yet. */
export const NOT_STARTED =
  "Your application has not been started yet, so this could not be saved. It will be saved again in a moment.";

const OLDER_FORM =
  "Your application to this round was started on an older form, so it cannot be changed here. Email ai-safety@uonsu.com and we will sort it out.";

export type AccessRequirementsInput = { ok: true; value: string } | { ok: false; error: string };

/**
 * What a save was handed, held to the box's own limit. The answer is trimmed,
 * so a box of spaces is an empty box. The limit is the older form's, because
 * the row is the older form's.
 */
export function readAccessRequirementsInput(raw: unknown): AccessRequirementsInput {
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: "Your access-requirements answer arrived in a shape this site cannot read.",
    };
  }
  const value = raw.trim();
  const max = ADMISSION_PRIVATE_FIELD_LIMITS.accessRequirements;
  if (value.length > max) {
    const over = value.length - max;
    return {
      ok: false,
      error: `The access-requirements box is ${over} character${over === 1 ? "" : "s"} over its limit of ${max}.`,
    };
  }
  return { ok: true, value };
}

/** The caller's own answer on this form, or "" when they have written none. */
export async function loadOwnAccessRequirements(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
): Promise<string> {
  return accessRequirementsIn(await accessRequirementsRef(db, form.round.id, uid).get());
}

/**
 * Save the caller's own answer, and answer with what is now stored.
 *
 * An empty answer is stored as an empty answer, the way the older form stores
 * one: the row stays, holding nothing.
 */
export async function saveOwnAccessRequirements(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
  value: string,
): Promise<string> {
  const roundId = form.round.id;
  const appRef = applicationRef(db, roundId, uid);
  const ownRef = accessRequirementsRef(db, roundId, uid);
  return db.runTransaction(async (tx) => {
    // The application AS OF THIS TRANSACTION. A row is only ever written
    // beside one, because the application is the only way back to the row.
    const snap = await tx.get(appRef);
    if (!snap.exists) throw new ApplicantError(NOT_STARTED, 409, { retry: true });
    if (!normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid)) {
      throw new ApplicantError(OLDER_FORM, 409);
    }
    tx.set(ownRef, { accessRequirements: value }, { merge: true });
    return value;
  });
}
