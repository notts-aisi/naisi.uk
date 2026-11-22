import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { NO_RUN_NAMED } from "@/lib/applications/handover/blocker";
import { canRunTerm } from "@/lib/applications/access";
import { own } from "@/lib/applications/keys";
import { isId } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { START_DATE_READ_ONLY } from "@/lib/courses/groupPage/words";
import type { SessionUser } from "@/lib/firebase/session";
import type { RunDetailsPatch } from "./details";

/**
 * WRITE THE RUN'S DETAILS FROM A PROGRAMME'S SETTINGS: the label, academic
 * year and cohort of the run the programme names, and its start date while
 * the groups have not gone out. Admin only, asked before anything is read.
 *
 * The patch has been through `checkRunDetails` already (the older form's
 * checks). What only the stored run can answer is asked here, inside one
 * transaction:
 *
 *  - the run the programme names is still on the site (404), not being
 *    destroyed (409: every destroy pass checks the typed label against the
 *    CURRENT one, so a rename would wedge it);
 *  - A NEW START DATE ONCE THE GROUPS HAVE GONE OUT IS REFUSED (409, with
 *    the sentence the form shows under the date). The rules pin it for a
 *    browser (`runDatesKeptOnceGroupsOut`), but the Admin SDK skips the
 *    rules, so the server asks itself. The same date sent again is no change.
 *
 * Then it writes the label, the year, the cohort (deleted, never stored as
 * null, when cleared: see `CourseRunPatch.cohort`), the start date when one
 * was sent, and `updatedAt`. Nobody is emailed.
 */

export const ONLY_AN_ADMIN_CHANGES_DETAILS = "Only an admin can change a course run’s details here.";

export type DetailsRefusal = { ok: false; status: 403 | 404 | 409; error: string };

export async function saveRunDetails(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  patch: RunDetailsPatch,
): Promise<{ ok: true; runId: string } | DetailsRefusal> {
  if (!canRunTerm(actor)) return { ok: false, status: 403, error: ONLY_AN_ADMIN_CHANGES_DETAILS };
  const notHere: DetailsRefusal = { ok: false, status: 404, error: "That programme is not on this form." };
  if (!isId(roundId) || !isId(programmeId)) return notHere;
  const form = await loadForm(db, roundId);
  const programme = form ? own(form.programmes, programmeId) : undefined;
  if (!form || !programme) return notHere;
  const runId = programme.runId;
  if (runId === null || !isId(runId)) return { ok: false, status: 409, error: NO_RUN_NAMED };

  const ref = db.collection("courseRuns").doc(runId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: "The run this programme names is no longer on the site." } as const;
    const data = snap.data() ?? {};
    if (data.destroying === true) {
      return { ok: false, status: 409, error: "This run is being destroyed and its details can't be changed." } as const;
    }
    const goneOut = data.allocationPublishedAt != null;
    if (patch.startDate !== undefined && goneOut && patch.startDate !== data.startDate) {
      return { ok: false, status: 409, error: START_DATE_READ_ONLY } as const;
    }
    tx.update(ref, {
      label: patch.label,
      academicYear: patch.academicYear,
      cohort: patch.cohort === null ? FieldValue.delete() : patch.cohort,
      ...(patch.startDate !== undefined && !goneOut ? { startDate: patch.startDate } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, runId } as const;
  });
}
