import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { writeRecordsForRound } from "@/lib/admissions/memberRecordSync";
import type { SessionUser } from "@/lib/firebase/session";
import type { AdmissionRoundStatus } from "@/lib/firestore/admissionRounds";
import { canRunTerm } from "../access";
import { decisionDayHasBegun } from "../decisions";
import { QUESTION_SETS_SUBCOLLECTION, type QuestionSetDoc } from "../model";
import { isApplicationForm, isId, normaliseForm, normaliseQuestionSet } from "../normalise";
import { formRef } from "../repo";
import { readLeadsInStanding, readinessOf } from "./load";
import { readinessRefusal, type FormReadinessCheckId } from "./readiness";
import { planFormMove, type FormMoveRefusalCode, type FormMoveRequest } from "./status";

/**
 * Move an application form along its term. THE only writer of a form's
 * `status`.
 *
 * The older round console's status route refuses a form, and no other route
 * under the form's own tree writes the field, so this is the one place a form
 * is opened, closed, reopened or settled. What may follow what is the round's
 * own table, read through `planFormMove` (`./status.ts`), and what "ready"
 * means is `formReadiness` (`./readiness.ts`): the term page asks both, so a
 * button it offers is a move this makes.
 *
 * ## One transaction decides and writes
 *
 * The form is read, the move is planned, readiness is asked and the status is
 * written inside one transaction. The question sets and each lead's account
 * are read in it too, so a set emptied or a lead's standing lost while
 * somebody is pressing Open makes the transaction start again and meet the
 * form as it now is. The write is queued only after the last check, because
 * a transaction commits whatever was queued when its function returns,
 * refusal or not.
 *
 * ## What a move writes
 *
 * `status` and `updatedAt`, and nothing else. The counts of applications by
 * status are not touched: no application's status changes when the form's
 * does.
 *
 * ## Settling keeps the record
 *
 * A settled form is a finished intake: decision day has gone and the scores
 * have stopped moving. That is the moment each application is copied onto
 * the applicant's member record, by the same sweep a settled round uses
 * (`writeRecordsForRound`), which reads a form's programmes and question
 * sets for itself.
 *
 * A FAILURE THERE IS A WARNING, NOT A REFUSAL. The status is already written,
 * and holding a whole term open because one record could not be written
 * would punish everybody for one bad row. Nothing is lost by carrying on:
 * the applications are still on the form, and a destroy writes any record
 * that is missing before it deletes anything. The sweep runs after the
 * transaction and not inside it, because it reads every application on the
 * form and a transaction around that would hold an unbounded read set for a
 * one-field write.
 */

export type FormMoveRefusal = {
  ok: false;
  status: 403 | 404 | 409;
  code: FormMoveRefusalCode | "forbidden" | "no-form" | "needs-confirmation" | "not-ready";
  error: string;
  /** Present when the move would go through with `confirm: true`. */
  needsConfirmation?: true;
  /** Present when the form is not ready to open: what is left, line by line. */
  unmet?: { id: FormReadinessCheckId; label: string; hint: string }[];
};

export type FormMoveDone = {
  ok: true;
  /** False when the form was already there, and nothing was written. */
  changed: boolean;
  status: AdmissionRoundStatus;
  /** Set when the term was settled and a member record could not be written. */
  recordWarning: string | null;
};

const NO_FORM: FormMoveRefusal = {
  ok: false,
  status: 404,
  code: "no-form",
  error: "There is no application form here.",
};

export const ONLY_AN_ADMIN = "Only an admin can open, close or settle an application form.";

const RECORDS_KEPT_LATER =
  "Nothing is lost yet: the applications are still on the form, and destroying the form writes any missing record itself and refuses until every one of them succeeds.";

export async function moveFormStatus(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  request: FormMoveRequest,
  now: Date = new Date(),
): Promise<FormMoveDone | FormMoveRefusal> {
  if (!canRunTerm(actor)) return { ok: false, status: 403, code: "forbidden", error: ONLY_AN_ADMIN };
  if (!isId(roundId)) return NO_FORM;

  const ref = formRef(db, roundId);
  const moved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const raw = snap.data();
    if (!snap.exists || !raw || !isApplicationForm(raw)) return NO_FORM;
    const form = normaliseForm(snap.id, raw);
    const { archived, opensAt, closesAt } = form.round;

    const plan = planFormMove(
      {
        // As stored, so a status this site does not know is refused and not
        // repaired into a draft.
        status: raw.status,
        destroying: raw.destroying === true,
        decisionsSentAt: form.decisionsSentAt,
        anybodyTold: decisionDayHasBegun(form),
        archived,
        opensAt,
        closesAt,
      },
      request.to,
      now,
    );
    if (!plan.ok) {
      const refusal: FormMoveRefusal = { ok: false, status: 409, code: plan.code, error: plan.error };
      return refusal;
    }
    if (plan.kind === "noop") {
      // A button pressed twice is not an error, and must not stamp an
      // `updatedAt` that says something moved.
      return { ok: true as const, changed: false, status: plan.status, round: null };
    }
    if (plan.requiresConfirmation && !request.confirm) {
      const refusal: FormMoveRefusal = {
        ok: false,
        status: 409,
        code: "needs-confirmation",
        error: plan.confirmPrompt ?? "Confirm this move to make it.",
        needsConfirmation: true,
      };
      return refusal;
    }
    if (plan.needsReadiness) {
      const setsSnap = await tx.get(ref.collection(QUESTION_SETS_SUBCOLLECTION));
      const sets: QuestionSetDoc[] = [];
      for (const doc of setsSnap.docs) {
        const set = normaliseQuestionSet(doc.id, doc.data());
        if (set) sets.push(set);
      }
      const leadsInStanding = await readLeadsInStanding(db, form, (refs) => tx.getAll(...refs));
      const readiness = readinessOf(form, sets, leadsInStanding, now);
      if (!readiness.ready) {
        const refusal: FormMoveRefusal = {
          ok: false,
          status: 409,
          code: "not-ready",
          error: readinessRefusal(readiness.unmet),
          unmet: readiness.unmet.map((check) => ({ id: check.id, label: check.label, hint: check.hint })),
        };
        return refusal;
      }
    }

    // Queued last: nothing above can refuse once this is in the transaction.
    tx.update(ref, { status: plan.to, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true as const, changed: true, status: plan.to, round: form.round };
  });

  if (!moved.ok) return moved;

  let recordWarning: string | null = null;
  if (moved.changed && moved.status === "settled" && moved.round) {
    try {
      const sync = await writeRecordsForRound(db, { ...moved.round, status: "settled" }, "settle", actor.uid);
      if (sync.failed.length > 0) {
        const who = sync.failed.length === 1 ? "1 applicant" : `${sync.failed.length} applicants`;
        recordWarning = `The term is settled, but the member record could not be written for ${who}. ${RECORDS_KEPT_LATER}`;
        console.error(
          "[form-status] member records failed on settle:",
          roundId,
          sync.failed.map((failure) => failure.uid),
        );
      }
    } catch (err) {
      recordWarning = `The term is settled, but the member records could not be written. ${RECORDS_KEPT_LATER}`;
      console.error("[form-status] member record sweep failed on settle:", roundId, err);
    }
  }

  return { ok: true, changed: moved.changed, status: moved.status, recordWarning };
}
