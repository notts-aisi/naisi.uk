import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { holdsStanding } from "./eligibility";
import type { SessionUser } from "./session";

/**
 * WHO THE ADMISSIONS TREE OPENS FOR: the predicate `requireAdmissionsPage`
 * (`./pageGates.ts`) applies, here so a caller that has to know whether a
 * page in that tree would render for somebody, before it offers them a link
 * there, asks the same question (search, `src/lib/search/load.ts`).
 *
 * An author (an admin, or a member holding `approveCourse`), or an account
 * the roles route has flagged as named on some round that still meets the
 * reviewer's bar. The flag is never cleared when somebody stops being
 * eligible, which is why the bar is asked beside it. See `requireAdmissionsPage`.
 */
export function opensAdmissionsConsole(user: SessionUser): boolean {
  const namedReviewer =
    user.admissionsReviewer === true &&
    holdsStanding(user, "admissionRounds.reviewerUids");
  return canAuthorAdmissionRound(user) || namedReviewer;
}
