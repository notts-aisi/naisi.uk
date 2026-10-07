import { notFound } from "next/navigation";
import PoolBoard from "@/features/applications/decisionDay/PoolBoard";
import { AdminsOnly } from "@/features/applications/decisionDay/parts";
import { canRunTerm, canSeeForm } from "@/lib/applications/access";
import { buildPoolBoard } from "@/lib/applications/decisionDay/pool";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * Pooled applicants for one application form: the people no programme they
 * ranked could take, and the outcome picked for each before decision day.
 *
 * Rendered on the server from the Admin SDK, because every collection behind
 * it is closed to browsers. What the browser receives is the object
 * `buildPoolBoard` builds field by field, which holds no email address.
 *
 * Three answers, asked in this order:
 *
 *  1. The tree's own gate (`requireAdmissionsPage`): may you be in the
 *     admissions console at all?
 *  2. Somebody with no role on this form is told it is not found, the same as
 *     for a form that does not exist.
 *  3. Picking what a pooled applicant hears is part of running the term, so a
 *     lead or a reviewer is told plainly that this page is an admin's, before
 *     anything about an applicant has been read.
 *
 * The route that saves an outcome applies the same rule for itself.
 */
export default async function PooledApplicantsPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const [{ roundId }, user] = await Promise.all([params, requireAdmissionsPage()]);

  const db = getAdminDb();
  if (!db) notFound();

  const form = await loadForm(db, roundId);
  if (!form || !canSeeForm(user, form)) notFound();

  if (!canRunTerm(user)) {
    return (
      <AdminsOnly roundId={roundId} what="An admin picks what each pooled applicant hears, once every programme has decided. You can still read and decide your own programme’s applications." />
    );
  }

  const board = await buildPoolBoard(db, form, new Date());
  return <PoolBoard initial={board} />;
}
