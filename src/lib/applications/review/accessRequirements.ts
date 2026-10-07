import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION, type CourseAuditKind } from "@/lib/firestore/courseAudit";
import { canRunTerm } from "../access";
import { accessRequirementsIn, accessRequirementsRef } from "../applicant/accessRequirementsDoc";
import { normaliseApplication } from "../normalise";
import { applicationRef, loadForm } from "../repo";
import { UNNAMED_STAFF, firstWord } from "./people";
import { NOT_FOUND, refuse } from "./refusals";
import type { Refusal } from "./types";

/**
 * AN ADMIN OPENING ONE APPLICANT'S ACCESS-REQUIREMENTS ANSWER.
 *
 * This is the only way anybody but its author reads that answer, and it is
 * held to what applicants are told about it:
 *
 *  - ONLY AN ADMIN. A programme's lead and its reviewers read the application
 *    and never this. The refusal comes before anything is read, in the same
 *    words whatever was asked about, so it says nothing about what exists.
 *  - IT HAS TO BE ASKED FOR. Nothing that builds a review screen can reach
 *    this module (`../applicant/accessRequirementsDoc.ts` says what holds
 *    that), so the answer is never part of a page an admin merely opened.
 *  - EVERY READ IS RECORDED. The answer and the log line come out of one
 *    transaction: there is no reading it without the line being written, and
 *    a read that found an empty box is recorded like any other.
 *  - ONLY AN APPLICATION THAT WAS SENT. A draft is nobody's to read but its
 *    author's, and that goes for what its author wrote here too.
 *  - NOBODY OPENS THEIR OWN through the committee's screens.
 *  - THE LINE SAYS WHOSE IT REALLY WAS. A document id is a round id and a uid
 *    joined, and both came from an address. The application found there has
 *    to say it is that person's on that form, or nothing is read: a read
 *    must never be recorded against one id while showing another's answer.
 *
 * ## What the log line holds
 *
 * Who opened it, whose it was by ACCOUNT ID, the form, and when. Never the
 * answer and never the applicant's name: the log is kept when an account is
 * deleted, and it is not where a person goes on being named. The line is
 * keyed to its form like every other line about a form, so destroying the
 * form removes it with the answers it was about.
 */

/** The kind every read of an access-requirements answer is recorded under. */
export const ACCESS_REQUIREMENTS_READ_KIND = "access-requirements-read" satisfies CourseAuditKind;

export type OpenedAccessRequirements = { ok: true; accessRequirements: string } | Refusal;

/**
 * Read one applicant's answer and record that it was read.
 *
 * `recordAs` is the kind the read is logged under, and its type allows one
 * value. It is an argument so that a route cannot call this without naming,
 * in its own source, the record it is making.
 */
export async function openAccessRequirements(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
  recordAs: typeof ACCESS_REQUIREMENTS_READ_KIND,
): Promise<OpenedAccessRequirements> {
  if (!canRunTerm(user)) {
    return refuse(403, "Only an admin can open an applicant’s access requirements.");
  }
  if (applicantUid === user.uid) return NOT_FOUND;
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;

  const appRef = applicationRef(db, roundId, applicantUid);
  const ownRef = accessRequirementsRef(db, roundId, applicantUid);
  const actorName = (user.displayName ?? "").trim() || UNNAMED_STAFF;
  return db.runTransaction(async (tx): Promise<OpenedAccessRequirements> => {
    const [appSnap, ownSnap] = await Promise.all([tx.get(appRef), tx.get(ownRef)]);
    const application = appSnap.exists
      ? normaliseApplication(appSnap.id, appSnap.data(), form.round.availabilityGrid)
      : null;
    if (!application?.sent) return NOT_FOUND;
    if (application.roundId !== roundId || application.uid !== applicantUid) return NOT_FOUND;

    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: recordAs,
      // A form is not a run: the run axis is empty and the form's id is kept.
      runId: "",
      roundId,
      groupId: null,
      subjectUid: applicantUid,
      actorUid: user.uid,
      actorName,
      targetLabel: form.round.label,
      detail: `${firstWord(actorName)} opened an applicant’s access requirements.`,
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true, accessRequirements: accessRequirementsIn(ownSnap) };
  });
}
