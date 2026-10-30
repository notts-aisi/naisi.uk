import "server-only";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { agreementCoversCourseworkUse, COURSEWORK_USE_FIELD, FIRST_WRITTEN_FIELD } from "./courseworkUse";

/**
 * THE WRITERS OF THE TWO STAMPS `courseworkUse.ts` reads. Server only: no
 * browser may write either (firestore.rules refuses `courseworkUseAgreedAt`
 * on a browser's create and keeps it unchanged on every browser's update, and
 * `courseExerciseResponses` takes no browser write at all).
 *
 *  - `courseworkUseAgreedAt` on `users/{uid}`: the moment somebody FIRST
 *    agreed to privacy version 13 or later. Written only while absent, so it
 *    is never moved. Every path that records an agreement for a member writes
 *    it: the re-consent route, in the same transaction as the agreement
 *    (`courseworkUseStampFor`), and registration, whose account is written in
 *    the browser, through the profile-complete route straight after
 *    (`stampCourseworkUse`).
 *  - `firstWrittenAt` on a row of `courseExerciseResponses`: when the row was
 *    first created. Stamped once by the reflection, fill-in box and written
 *    answer routes (`firstWrittenFor`), carried over on every later write, and
 *    never added to a row that exists without it.
 */

/**
 * The extra field an agreement to `policyVersion` writes, given the account
 * as it stood: the moment, the first time it is to version 13 or later, and
 * nothing otherwise. The caller writes it in the same update as the
 * agreement, so both carry the same server time.
 */
export function courseworkUseStampFor(
  prior: Record<string, unknown> | null | undefined,
  policyVersion: string,
): Record<string, unknown> {
  if (!prior || prior[COURSEWORK_USE_FIELD] != null) return {};
  if (!agreementCoversCourseworkUse(policyVersion)) return {};
  return { [COURSEWORK_USE_FIELD]: FieldValue.serverTimestamp() };
}

/**
 * After registration: the account was written in the browser with its
 * agreement (`policyAgreedAt` pinned by the rules to the server's clock), so
 * the moment is copied from it, once, if the agreement is to version 13 or
 * later and nothing is kept yet. The update carries the read's own update
 * time as its precondition, so it lands only on the account as it was read.
 * Answers whether it wrote.
 */
export async function stampCourseworkUse(db: Firestore, uid: string): Promise<boolean> {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (data[COURSEWORK_USE_FIELD] != null) return false;
  if (!agreementCoversCourseworkUse(data.policyVersion)) return false;
  const agreed = data.policyAgreedAt;
  if (!(agreed instanceof Timestamp)) return false;
  const precondition = snap.updateTime ? { lastUpdateTime: snap.updateTime } : undefined;
  if (precondition) await ref.update({ [COURSEWORK_USE_FIELD]: agreed }, precondition);
  else await ref.update({ [COURSEWORK_USE_FIELD]: agreed });
  return true;
}

/**
 * The `firstWrittenAt` a coursework row's write carries, given the row as it
 * stood (null when there is none): now, for a new row; the row's own, for a
 * row that has one; nothing, for a row created before the stamp existed,
 * which therefore never counts as written after anybody's agreement.
 */
export function firstWrittenFor(prior: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!prior) return { [FIRST_WRITTEN_FIELD]: FieldValue.serverTimestamp() };
  return prior[FIRST_WRITTEN_FIELD] != null ? { [FIRST_WRITTEN_FIELD]: prior[FIRST_WRITTEN_FIELD] } : {};
}
