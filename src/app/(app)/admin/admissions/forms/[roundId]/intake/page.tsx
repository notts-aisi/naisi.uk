import { notFound } from "next/navigation";
import { AdminsOnly, Page, Pill } from "@/features/applications/decisionDay/parts";
import IntakePlan from "@/features/applications/intake/IntakePlan";
import { canRunTerm, canSeeForm } from "@/lib/applications/access";
import { planIntake } from "@/lib/applications/intake/run";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * Plan the intake: the whole term at once, for an admin, before decision day.
 *
 * Three answers, asked in the pooled applicants page's order: the tree's own
 * gate, then not found for somebody with no role on the form, then a plain
 * "this is an admin's" for a lead or a reviewer, before anything about an
 * applicant is read.
 *
 * The first plan is the site's own draft, made on the server with nothing
 * sent to Claude (`planIntake` with `askClaude: false`). Everything Claude is
 * asked, and every decision Apply makes, goes through a route that asks the
 * same questions again.
 */
export default async function IntakePage({ params }: { params: Promise<{ roundId: string }> }) {
  const [{ roundId }, user] = await Promise.all([params, requireAdmissionsPage()]);

  const db = getAdminDb();
  if (!db) notFound();

  const form = await loadForm(db, roundId);
  if (!form || !canSeeForm(user, form)) notFound();

  if (!canRunTerm(user)) {
    return (
      <AdminsOnly
        roundId={roundId}
        what="An admin plans who goes on which programme across the whole term. You can still read and decide your own programme’s applications."
      />
    );
  }

  const planned = await planIntake(db, user, form.round.id, { askClaude: false });
  return (
    <Page
      roundId={form.round.id}
      title="Plan the intake"
      chips={<Pill>Admins only</Pill>}
      lede="Every programme at once: who goes where, who should facilitate, and the decisions that would make it so. Nothing changes until you press Apply, and nobody is emailed."
    >
      {planned.ok ? (
        <IntakePlan roundId={form.round.id} initial={planned.intake} />
      ) : (
        <p role="alert">{planned.error}</p>
      )}
    </Page>
  );
}
