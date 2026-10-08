import ApplicationFormStaffNotice from "@/features/admissions/ApplicationFormStaffNotice";
import RoundEditor from "@/features/admissions/RoundEditor";
import { ROUNDS_COLLECTION, canSeeRound } from "@/lib/admissions/roundRoutes";
import { canSeeForm } from "@/lib/applications/access";
import { isApplicationForm, normaliseFormFields } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeAdmissionRound } from "@/lib/firestore/admissionRounds";

/**
 * One round's console.
 *
 * The gate runs again here rather than being inherited silently, and it hands
 * the editor `isAdmin`, which now decides two things rather than one:
 *
 *  - appointing reviewers is admin-only (membership of `reviewerUids` is what
 *    grants access to applications), and the member list the picker needs is
 *    readable only by admins and SU-recognised committee;
 *  - the danger zone at the foot of the page, where a round is destroyed.
 *    That removes other people's applications, the access-requirements answer
 *    filed beside each one and the reviewers' written assessments, so it sits
 *    above the `approveCourse` permission that lets somebody author a round.
 *
 * Both are rendering decisions. The roles route and the two destroy routes
 * enforce the same bar for themselves, whatever this page draws.
 *
 * ## An application form is not edited here
 *
 * A form is an admission round too, so this address can be asked for one. The
 * older editor is for rounds of the older kind, and every route behind it
 * refuses a form, so for a form the page renders a notice in the editor's
 * place: the form's name, where a form is edited, and the danger zone for an
 * admin, because destroying is the one thing the two kinds share. Nothing else
 * of the older editor renders. See `src/lib/admissions/formFence.ts`.
 *
 * The notice also links to the form's own pages, for the people those pages
 * admit: an admin, and anybody the form names as a lead or a reviewer.
 * Somebody who sees this round for another reason is not offered a link to a
 * page that would tell them there is no form there.
 */
export default async function RoundPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const [{ roundId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const isAdmin = user.role === "admin";

  const form = await applicationFormHere(user, roundId);
  if (form) {
    return (
      <ApplicationFormStaffNotice
        roundId={roundId}
        label={form.label}
        academicYear={form.academicYear}
        isAdmin={isAdmin}
        canOpen={form.canOpen}
      />
    );
  }

  return <RoundEditor roundId={roundId} isAdmin={isAdmin} />;
}

/**
 * The application form at this address, as far as this caller may know of it,
 * or null.
 *
 * Null covers every case the older editor already answers for itself: no
 * round, a round of the older kind, and a round this caller may not see. The
 * last one matters. `canSeeRound` is the same question the round's own route
 * asks before it says a round exists, so somebody who is in the console for a
 * different round learns nothing here: they get the editor, and its route
 * tells them there is no such round.
 *
 * A read that fails is null as well. The editor then renders and reports
 * whatever its own route says, which is a better answer than this page
 * throwing over a notice.
 */
async function applicationFormHere(
  user: SessionUser,
  roundId: string,
): Promise<{ label: string; academicYear: string; canOpen: boolean } | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.collection(ROUNDS_COLLECTION).doc(roundId).get();
    if (!snap.exists || !isApplicationForm(snap.data())) return null;
    const round = normalizeAdmissionRound(snap.id, snap.data() ?? {});
    if (!canSeeRound(user, round)) return null;
    return {
      label: round.label,
      academicYear: round.academicYear,
      // The same question the form's own pages ask before they draw anything,
      // asked of the stored document.
      canOpen: canSeeForm(user, normaliseFormFields(snap.data())),
    };
  } catch (err) {
    console.error("[admissions round page] could not read the round", roundId, err);
    return null;
  }
}
