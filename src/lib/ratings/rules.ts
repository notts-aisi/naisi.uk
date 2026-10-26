/**
 * WHO RATES WHOM, in one place (Zach, Mon 26 Oct 2026). A facilitator is a
 * fellow of the group they run, so the three rules are:
 *
 *  1. NOBODY RATES THEMSELVES.
 *  2. A CO-FACILITATOR NEVER RATES A CO-FACILITATOR. Two people named among a
 *     group's facilitators never rate each other, whatever else either of
 *     them is (an admin, the programme's lead).
 *  3. THE PROGRAMME'S LEAD OR AN ADMIN RATES A FACILITATOR. A group's own
 *     facilitator, while they stand behind the role, rates the other fellows
 *     of their group; the lead and admins may rate any fellow, so a group
 *     whose facilitators cannot (or are themselves rated) is still covered.
 *
 * Only a fellow is rated: somebody taking part in the group at the end (the
 * grid's rows, somebody who left excluded), which the caller decides from the
 * register's own rows before asking here. The page and the route ask this
 * same function, so a form is never drawn for a rating the route refuses.
 *
 * Pure.
 */

export type Rater = {
  uid: string;
  isAdmin: boolean;
  /** Leads the programme that names the run, and still stands as its lead. */
  leads: boolean;
};

export type RatedGroup = {
  /** The uids the group names as its facilitators, standing or not. */
  facilitatorUids: readonly string[];
  /** Those of them who still stand behind the role. */
  standingFacilitatorUids: readonly string[];
};

export type RateRefusal = "self" | "co-facilitator" | "not-yours";

export type RateAnswer = { ok: true } | { ok: false; reason: RateRefusal };

/** Whether `rater` may rate `ratedUid`, a fellow of `group`. */
export function mayRate(rater: Rater, group: RatedGroup, ratedUid: string): RateAnswer {
  if (rater.uid === ratedUid) return { ok: false, reason: "self" };
  const raterNamed = group.facilitatorUids.includes(rater.uid);
  const ratedNamed = group.facilitatorUids.includes(ratedUid);
  if (raterNamed && ratedNamed) return { ok: false, reason: "co-facilitator" };
  if (raterNamed && group.standingFacilitatorUids.includes(rater.uid)) return { ok: true };
  if (rater.isAdmin || rater.leads) return { ok: true };
  return { ok: false, reason: "not-yours" };
}

/** Whether somebody may open a group's ratings at all: rate in it, or read it. */
export function opensGroupRatings(rater: Rater, group: RatedGroup): boolean {
  return rater.isAdmin || rater.leads || group.standingFacilitatorUids.includes(rater.uid);
}

/**
 * Whether somebody reads every rating of a group, not only their own: the
 * programme's lead and admins. A facilitator reads what they gave.
 */
export function readsEveryRating(rater: Rater): boolean {
  return rater.isAdmin || rater.leads;
}
