import { notFound } from "next/navigation";
import { AdminsOnly } from "@/features/applications/decisionDay/parts";
import SendBoard from "@/features/applications/decisionDay/SendBoard";
import { canRunTerm, canSeeForm } from "@/lib/applications/access";
import { buildSendBoard } from "@/lib/applications/decisionDay/send";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * Decision day for one application form: whether the term is ready, who is in
 * each group, each email as it will read, and the send.
 *
 * Rendered on the server from the Admin SDK, because every collection behind
 * it is closed to browsers. What the browser receives is the object
 * `buildSendBoard` builds field by field: people are named, and no email
 * address is in it.
 *
 * The same three answers as the pooled applicants page, in the same order:
 * the tree's own gate, not found for somebody with no role on this form, and
 * a plain "this page is for admins" for a lead or a reviewer, before anything
 * about an applicant has been read. The routes behind the two buttons apply
 * the same rule for themselves.
 */
export default async function SendDecisionsPage({
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
      <AdminsOnly what="An admin sends every programme’s decisions together, on one day. You can change a decision for your own programme until they do." />
    );
  }

  const board = await buildSendBoard(db, form, new Date());
  return <SendBoard initial={board} />;
}
