import { currentPolicy } from "./policies";

/**
 * WHEN SOMEBODY'S COURSEWORK MAY BE USED OUTSIDE ITS PROGRAMME (privacy v13).
 *
 * Until version 12 the privacy policy promised that nothing written in a
 * course is used to make decisions about its writer outside the programme.
 * Version 13 takes that back from its own agreement on, and from then only:
 * what somebody writes on a course AFTER they first agree to version 13 (or a
 * later version), and the notes admins keep about them, may be used when they
 * are considered for something else later. Anything written before stays
 * inside its programme. This file is the one place that says when that
 * moment was for a person, and whether a piece of their writing came after
 * it. Claude and Pangram are sent nothing of a person whose moment is not
 * known, and nothing written before it.
 *
 * THE MOMENT IS KEPT ONCE (`courseworkUseAgreedAt` on `users/{uid}`). It is
 * written on the server only, by `stampCourseworkUse` (the re-consent route
 * and the registration's profile-complete route), only while the field is
 * absent, so it is never moved; firestore.rules refuses it in a browser's
 * create and keeps it unchanged in every browser's update, an admin's
 * included. `policyAgreedAt` is not enough on its own: it moves forward with
 * every later version a person accepts.
 *
 * ONE FALLBACK, AND IT ONLY EVER MAKES THE MOMENT LATER. Registration writes
 * the account in the browser and stamps the field a moment later through a
 * request that may be lost. Until the field is there, somebody whose stored
 * agreement is version 13 or later (and no later than the policy the site
 * serves) counts from `policyAgreedAt`, which the rules pin to the server's
 * clock. That moment is never earlier than their first agreement to version
 * 13, so the fallback can only leave writing out, never let earlier writing
 * in.
 *
 * A ROW COUNTS ONLY IF IT WAS WRITTEN ENTIRELY AFTER THE MOMENT: the row's
 * `firstWrittenAt`, stamped once when the row is first created by the
 * reflection, fill-in box and written-answer routes, is after it. A row with
 * no `firstWrittenAt` was created before the stamp existed, which is before
 * anybody could agree to version 13, and never counts. A box started before
 * the moment and finished after it does not count either: its first words
 * came before.
 *
 * Pure: no reads, no clock. Safe anywhere.
 */

/** The first privacy policy version under which coursework may be used outside its programme. */
export const COURSEWORK_USE_FROM_VERSION = 13;

/** The field on `users/{uid}` that keeps the moment. */
export const COURSEWORK_USE_FIELD = "courseworkUseAgreedAt";

/** The field on a coursework row that keeps when it was first written. */
export const FIRST_WRITTEN_FIELD = "firstWrittenAt";

/** A stored instant, from a Timestamp or a Date, or null. */
function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (stamp && typeof stamp.toDate === "function") {
    const date = stamp.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

/**
 * The privacy version inside a stored agreement string
 * ("terms.1+privacy.13" gives 13), or null for anything else.
 */
export function privacyVersionIn(policyVersion: unknown): number | null {
  if (typeof policyVersion !== "string") return null;
  const match = /(?:^|\+)privacy\.(\d{1,4})(?:\+|$)/.exec(policyVersion);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a stored agreement is to a policy that lets coursework be used
 * outside its programme: version 13 or later, and no later than the version
 * the site serves (a version that does not exist was never shown to anybody).
 */
export function agreementCoversCourseworkUse(policyVersion: unknown): boolean {
  const version = privacyVersionIn(policyVersion);
  return version !== null && version >= COURSEWORK_USE_FROM_VERSION && version <= currentPolicy("privacy").version;
}

/** The fields of an account this file reads. */
export type CourseworkUseSource = {
  courseworkUseAgreedAt?: unknown;
  policyVersion?: unknown;
  policyAgreedAt?: unknown;
} | null | undefined;

/**
 * The moment from which this person's coursework may be used outside its
 * programme, or null when it may not be used at all. Null for no account.
 */
export function courseworkCountsFrom(user: CourseworkUseSource): Date | null {
  if (!user) return null;
  const kept = instantOf(user.courseworkUseAgreedAt);
  if (kept) return kept;
  if (!agreementCoversCourseworkUse(user.policyVersion)) return null;
  return instantOf(user.policyAgreedAt);
}

/**
 * Whether one row of coursework was written entirely after `from`: its
 * `firstWrittenAt` is after the moment. Strictly after: a row stamped in the
 * same instant is not known to have come after it.
 */
export function writtenAfter(firstWrittenAt: unknown, from: Date | null): boolean {
  if (!from) return false;
  const first = instantOf(firstWrittenAt);
  return first !== null && first.getTime() > from.getTime();
}

/** `writtenAfter`, for a stored row. */
export function rowCountsFrom(row: { firstWrittenAt?: unknown } | null | undefined, from: Date | null): boolean {
  return writtenAfter(row?.firstWrittenAt, from);
}

/**
 * Whether something written at `at` (a note's creation, say) came after the
 * person's moment, so it may be used outside its programme.
 */
export function cameAfter(at: Date | null, from: Date | null): boolean {
  return at !== null && from !== null && at.getTime() > from.getTime();
}
