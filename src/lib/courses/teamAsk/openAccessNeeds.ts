import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { EXCUSED_REFUSAL } from "@/lib/courses/excused/words";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION, type CourseAuditKind } from "@/lib/firestore/courseAudit";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { accessNeedsWordsOf } from "@/lib/firestore/courseAccessNeedsWords";
import { normalizeAccessNeeds, withAccessEvent } from "@/lib/firestore/courseTeamAsks";
import { ACCESS_OWN } from "./words";

/**
 * AN ADMIN OPENING WHAT A MEMBER WROTE IN AN ACCESS-NEEDS ASK.
 *
 * THE ONLY CODE THAT READS THOSE WORDS, and the tick beside them, once they
 * are stored, through the one store helper that takes them out of the
 * document (`accessNeedsWordsOf`, imported here and nowhere else). Every
 * other reader of an access ask goes through `normalizeAccessNeeds`, which
 * has no field for either. `tests/ask-access-needs-boundary.test.mjs` walks
 * every file that reads the requests collection for a raw document going
 * anywhere but a registered normaliser, and holds that only the open route
 * can reach this module.
 * It is held to what the member is told on the form ("Only admins read this:
 * not your facilitator, not the programme's lead. We record each time an
 * admin opens it.") and to how an access-requirements answer on an
 * application is opened (`src/lib/applications/review/accessRequirements.ts`):
 *
 *  - ONLY AN ADMIN. Anybody else is refused before anything is read, in one
 *    sentence whatever the id, so it says nothing about what exists.
 *  - IT HAS TO BE ASKED FOR, by a press, through a POST. The ask's page, its
 *    row on the Requests page, Home's count and every email are built
 *    without it.
 *  - EVERY OPENING IS RECORDED, IN THE TRANSACTION THAT READS IT. One
 *    `courseAudit` row of kind `access-needs-read` (who, when, whose by
 *    account id, which ask) and the ask's own `opened` history entry are
 *    written by the transaction whose result carries the words. Nothing
 *    leaves `runTransaction` until it has committed: if the commit fails it
 *    throws and nothing is returned, so there is no reading them without the
 *    record.
 *  - NOBODY OPENS THEIR OWN through the admins' screens.
 *
 * WHAT THE RECORD HOLDS: who opened it (uid and name), whose ask it was by
 * ACCOUNT ID, the ask's id, and when. Never the words, never the tick and
 * never the person's name: the log stays when an account is deleted, as the
 * rows of `access-requirements-read` do, and is not where a person goes on
 * being named. Unlike those rows, which go when their form is destroyed,
 * these belong to no form or run, so nothing deletes them by itself: they
 * are kept until the yearly clear-out by hand (docs/courses-ops.md, "Access
 * needs"). Neither the record nor the history entry is ever emailed.
 */

/** The kind every opening of an access ask is recorded under. */
export const ACCESS_NEEDS_READ_KIND = "access-needs-read" satisfies CourseAuditKind;

/** Where the record says it was opened. */
const TARGET_LABEL = "Ask the team";

export type OpenedAccessNeeds =
  | { ok: true; value: { words: string; tellFacilitator: boolean } }
  | { ok: false; status: number; error: string };

function firstWordOf(name: string): string {
  return name.trim().split(/\s+/)[0] || "Someone";
}

/**
 * Read one access ask's words and tick, and record that they were read.
 *
 * `recordAs` is the kind the opening is logged under, and its type allows one
 * value. It is an argument so that a route cannot call this without naming,
 * in its own source, the record it makes.
 */
export async function openAccessNeeds(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  recordAs: typeof ACCESS_NEEDS_READ_KIND,
  now: Date,
): Promise<OpenedAccessNeeds> {
  if (actor.role !== "admin") return { ok: false, status: 403, error: "Forbidden" };
  if (!isAddressableId(requestId) || requestId.length > 128) return { ok: false, status: 404, error: EXCUSED_REFUSAL.notFound };

  const ref = db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId);
  const actorName = (actor.displayName ?? "").trim() || "Someone";
  return db.runTransaction(async (tx): Promise<OpenedAccessNeeds> => {
    const snap = await tx.get(ref);
    const data = (snap.exists ? snap.data() : null) ?? null;
    const ask = data ? normalizeAccessNeeds(snap.id, data) : null;
    // The one read of the stored words and tick. What it read leaves this
    // transaction only in its result, and the result leaves only once the
    // record and the history entry below have committed.
    const opened = data ? accessNeedsWordsOf(data) : null;
    if (!ask || !opened) return { ok: false, status: 404, error: EXCUSED_REFUSAL.notFound };
    if (ask.askedByUid === actor.uid) return { ok: false, status: 403, error: ACCESS_OWN };

    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: recordAs,
      // An ask to the team is about no run and no form.
      runId: "",
      roundId: null,
      groupId: null,
      requestId: ask.id,
      subjectUid: ask.subjectUid,
      actorUid: actor.uid,
      actorName,
      targetLabel: TARGET_LABEL,
      detail: `${firstWordOf(actorName)} opened a message about access needs.`,
      at: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      history: withAccessEvent(ask.history, "opened", actor.uid, now),
      updatedAt: now,
    });

    return { ok: true, value: opened };
  });
}
