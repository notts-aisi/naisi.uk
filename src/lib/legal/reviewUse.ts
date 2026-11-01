import { agreementIn } from "./acceptance";
import { cameAfter } from "./courseworkUse";
import { currentPolicy } from "./policies";

/**
 * WHEN VERSION 15'S NEW USES BEGIN FOR A PERSON (privacy v15).
 *
 * Versions 13 and 14 promised that only admins read and write the notes kept
 * about a person. Version 15 takes that back for those who accept it: the
 * people leading a programme somebody is on may keep notes about them too,
 * and read the ones kept for them, while "notes written before version 15
 * stay readable by admins only". A new use applies only to what is written
 * after somebody was told, so it counts from the moment THAT PERSON agreed to
 * version 15: a note about them written before that moment stays an admin's,
 * whatever it says about who reads it, and somebody who has not agreed yet
 * has no moment at all.
 *
 * THE MOMENT is `policyAgreedAt` while the stored agreement is readable and
 * names privacy version 15 or later, and no version the site has never
 * served; otherwise there is none. Nothing keeps it on its own: the
 * agreement's time is the time of the LAST agreement, which is the one to
 * version 15 for as long as nobody is asked to accept anything after it.
 * Version 15 is the last privacy version anybody is asked to accept
 * (`LAST_PRIVACY_VERSION_ASKED` in `./acceptance.ts`), but a new version of
 * the Terms of Use asks everybody again, and accepting it moves
 * `policyAgreedAt` forward. That only ever makes the moment later, so it can
 * only leave a note out, never let one in; but it would take from the
 * programme's leads notes they read before, so
 * `tests/notes-for-leads.test.mjs` fails the day the Terms of Use move past
 * version 1, saying to keep the moment once on the account (as
 * `courseworkUseAgreedAt` is kept, `./courseworkUseStamp.ts`) before that
 * change.
 *
 * Pure: no reads, no clock, no server-only import. Safe anywhere.
 */

/** The first privacy policy version under which version 15's new uses apply. */
export const REVIEW_USE_FROM_VERSION = 15;

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

/** The fields of an account this file reads. */
export type ReviewUseSource = {
  policyVersion?: unknown;
  policyAgreedAt?: unknown;
} | null | undefined;

/**
 * The moment from which version 15's new uses apply to this person, or null
 * when they have not agreed to version 15 (or the agreement cannot be read).
 * Null for no account.
 */
export function reviewUseFrom(user: ReviewUseSource): Date | null {
  if (!user) return null;
  const agreed = agreementIn(user.policyVersion);
  if (!agreed) return null;
  if (agreed.privacy < REVIEW_USE_FROM_VERSION) return null;
  // A version nobody was ever shown is no agreement to anything.
  if (agreed.privacy > currentPolicy("privacy").version || agreed.terms > currentPolicy("terms").version) return null;
  return instantOf(user.policyAgreedAt);
}

/**
 * Whether something written at `at` (a note's creation) came strictly after
 * the person's version 15 moment. Never, for somebody with no moment.
 */
export function writtenAfterReviewUse(at: Date | null, from: Date | null): boolean {
  return cameAfter(at, from);
}
