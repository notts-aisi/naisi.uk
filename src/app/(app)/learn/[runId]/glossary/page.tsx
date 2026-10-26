import Glossary from "@/features/courses/guide/Glossary";
import { openGuidePage } from "@/features/courses/guide/pageGate";
import { loadRunGuide } from "@/lib/courses/guide/load";

/**
 * A programme's Glossary (boards wk-glossary, wk-glossary-phone): the run's
 * own document (`loadRunGuide`), open to exactly the people the run's week 1
 * opens to (`openGuidePage`).
 */

export const dynamic = "force-dynamic";

export default async function GlossaryPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const page = await openGuidePage(runId, "glossary");
  const guide = page.db ? await loadRunGuide(page.db, page.access.run.id) : { startHere: null, glossary: null };
  return <Glossary backHref={page.backHref} programmeName={page.programmeName} eyebrow={page.eyebrow} doc={guide.glossary} />;
}
