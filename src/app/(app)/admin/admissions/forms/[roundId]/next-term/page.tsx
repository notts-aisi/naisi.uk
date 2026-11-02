import { notFound } from "next/navigation";
import { AdminsOnly, Page, Pill } from "@/features/applications/decisionDay/parts";
import WhoToAsk from "@/features/applications/nextTerm/WhoToAsk";
import { canRunTerm, canSeeForm } from "@/lib/applications/access";
import { loadNextTerm } from "@/lib/applications/nextTerm/load";
import { NEXT_TERM_WORDS } from "@/lib/applications/nextTerm/words";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * Next term: who to ask. The people a saved note written this term suggests
 * for facilitating, an incubator or the committee, with the team's ratings
 * and words, for an admin. It sends nothing and writes nothing.
 *
 * Three answers, asked in the pooled applicants page's order: the tree's own
 * gate, then not found for somebody with no role on the form, then a plain
 * "this is an admin's" for a lead or a reviewer, before anything about
 * anybody is read. The loader asks `canRunTerm` again before its first read.
 *
 * Rendered on the server from the Admin SDK, because every collection behind
 * it is closed to browsers. What the browser receives is the view
 * `buildNextTerm` builds field by field: names and words, and no account,
 * note, rating or application whole.
 */
export default async function NextTermPage({ params }: { params: Promise<{ roundId: string }> }) {
  const [{ roundId }, user] = await Promise.all([params, requireAdmissionsPage()]);

  const db = getAdminDb();
  if (!db) notFound();

  const form = await loadForm(db, roundId);
  if (!form || !canSeeForm(user, form)) notFound();

  if (!canRunTerm(user)) {
    return <AdminsOnly roundId={roundId} what={NEXT_TERM_WORDS.adminsOnly} />;
  }

  const loaded = await loadNextTerm(db, user, form);
  if (loaded.status !== "ok") {
    return <AdminsOnly roundId={roundId} what={NEXT_TERM_WORDS.adminsOnly} />;
  }
  return (
    <Page
      roundId={form.round.id}
      title={NEXT_TERM_WORDS.title}
      chips={<Pill>{NEXT_TERM_WORDS.chip}</Pill>}
      lede={NEXT_TERM_WORDS.lede(loaded.view.term)}
    >
      <WhoToAsk view={loaded.view} />
    </Page>
  );
}
