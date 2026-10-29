import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { buildFormPlaceRow, courseApplicationId } from "@/lib/firestore/courseApplications";
import { own } from "../keys";
import type { ApplicationDoc } from "../model";
import { isApplicationForm, normaliseApplication, normaliseForm, type ApplicationForm } from "../normalise";
import { applicationRef, formRef } from "../repo";
import { standingOf } from "../status/standing";
import { HAND_OVER_AUDIT_KIND, handOverBlocker } from "./blocker";
import { holdsPlaceOn, nameOnRecord } from "./holders";
import { RUN_APPLICATIONS_COLLECTION, readRun, runRef } from "./run";

/**
 * THE HAND-OVER THAT FOLLOWS AN ACCEPTED INVITATION: somebody who takes a
 * place after decision day (an invitation decision day sent, or a freed place
 * offered since) is put on the list their programme's run's allocation board
 * reads, as the admin's Hand over would put them there, without anybody
 * having to press it again.
 *
 * IT PUTS NOBODY IN A GROUP AND EMAILS NOBODY. The row it writes is exactly
 * the row the press writes (`buildFormPlaceRow`), so the person arrives in
 * To place on People in groups and in "Not in a group" on Circles, for a
 * person to place. That holds for a freed place too, although its offer named
 * a group: placing stays somebody's decision.
 *
 * IT DECIDES FROM THE PERSON'S OWN DOCUMENT. It runs inside the reply route,
 * which serves an applicant, so it may not reach the committee's reviews or
 * decisions (`tests/applications-boundary.test.mjs`). It does not need to:
 * once somebody has been told, a place taken by accepting an invitation is
 * read from their own document and nothing else (`holdingOf` in
 * `../decisions.ts`), so `holdsPlaceOn` with no decision document gives the
 * press's own answer for them.
 *
 * WHAT STOPS IT is what stops the press (`handOverBlocker`): decisions not
 * sent, no run named, a run that no longer stands or is still a draft. Then
 * nothing is written, and the Settings tab's panel names them as it always
 * has, for an admin to hand over once the run is put right.
 *
 * Like `approveAfterAcceptedInvitation` beside it in the reply route, it is
 * called after the reply has committed and never throws: a reply never waits
 * on, or is undone by, anything about a run.
 */

export type AfterHandOver =
  /** A row was made for them on the run's list. */
  | { did: "handed-over"; runId: string }
  /** Nothing to do, or not allowed now: the run's list is as it was. */
  | { did: "left"; why: "no-place" | "blocked" | "already-there" }
  /** It could not be attempted or finished. The reply stands; the press still works. */
  | { did: "failed" };

/** The course log's sentence. It names the person, as their own row does. */
export function handedOverOnAcceptanceSentence(name: string, programmeName: string): string {
  return `${name} accepted a place on ${programmeName} and was handed over to this run’s allocation board by itself.`;
}

/** Where the place they have just taken is, or null when there is none to hand over. */
function placeTaken(form: ApplicationForm, application: ApplicationDoc): string | null {
  const standing = standingOf(application);
  if (standing.kind !== "place" || !standing.programmeId) return null;
  if (!own(form.programmes, standing.programmeId)) return null;
  return holdsPlaceOn(form, standing.programmeId, application, null) ? standing.programmeId : null;
}

export async function handOverAfterAcceptedInvitation(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
): Promise<AfterHandOver> {
  if (form.decisionsSentAt === null) return { did: "left", why: "blocked" };
  try {
    return await db.runTransaction(async (tx) => {
      // Everything read again inside the transaction, the form first, so a
      // run changed or a place given back while this runs makes it run again.
      const formSnap = await tx.get(formRef(db, form.round.id));
      if (!formSnap.exists || !isApplicationForm(formSnap.data())) return { did: "left", why: "blocked" } as const;
      const fresh = normaliseForm(formSnap.id, formSnap.data());
      const appSnap = await tx.get(applicationRef(db, fresh.round.id, uid));
      if (!appSnap.exists) return { did: "left", why: "no-place" } as const;
      const application = normaliseApplication(appSnap.id, appSnap.data(), fresh.round.availabilityGrid);
      if (!application) return { did: "left", why: "no-place" } as const;
      const programmeId = placeTaken(fresh, application);
      const programme = programmeId ? own(fresh.programmes, programmeId) : undefined;
      if (!programmeId || !programme) return { did: "left", why: "no-place" } as const;

      const runId = programme.runId;
      const runSnap = runId === null ? null : await tx.get(runRef(db, runId));
      const run = runSnap && runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;
      if (runId === null || !run || handOverBlocker(fresh, programme, run) !== null) {
        return { did: "left", why: "blocked" } as const;
      }

      const rowRef = db.collection(RUN_APPLICATIONS_COLLECTION).doc(courseApplicationId(runId, uid));
      // There already, whatever it says: a row is never changed from here.
      if ((await tx.get(rowRef)).exists) return { did: "left", why: "already-there" } as const;

      const name = nameOnRecord(application);
      tx.create(rowRef, {
        ...buildFormPlaceRow({
          runId,
          courseId: run.run.courseId,
          uid,
          displayName: name,
          fromForm: { roundId: fresh.round.id, programmeId },
        }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // The count moves with the row, in the transaction that makes it.
      tx.update(runRef(db, runId), {
        "applicationCounts.accepted": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
        kind: HAND_OVER_AUDIT_KIND,
        runId,
        roundId: null,
        groupId: null,
        subjectUid: uid,
        // Their own acceptance is what did it.
        actorUid: uid,
        actorName: name,
        targetLabel: `${fresh.round.label} · ${programme.shortName}`,
        detail: handedOverOnAcceptanceSentence(name, programme.shortName),
        at: FieldValue.serverTimestamp(),
      });
      return { did: "handed-over", runId } as const;
    });
  } catch (err) {
    console.error("[hand-over] could not hand over after an accepted invitation", form.round.id, err);
    return { did: "failed" };
  }
}
