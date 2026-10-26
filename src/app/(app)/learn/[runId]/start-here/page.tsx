import StartHere from "@/features/courses/guide/StartHere";
import { reflectionReadersFor } from "@/features/courses/guide/door";
import { openGuidePage } from "@/features/courses/guide/pageGate";
import { loadRunGuide } from "@/lib/courses/guide/load";
import { onThisSiteWords } from "@/lib/courses/guide/words";

/**
 * A programme's Start here (boards wk-start, wk-start-phone): the run's own
 * document (`loadRunGuide`), open to exactly the people the run's week 1
 * opens to (`openGuidePage`). The box under "Reflections." names who reads
 * this reader's reflections from records: their group's facilitators and the
 * programme's lead, or the line's general form before they have a group.
 */

export const dynamic = "force-dynamic";

export default async function StartHerePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const page = await openGuidePage(runId, "start-here");
  const [guide, readers] = page.db
    ? await Promise.all([loadRunGuide(page.db, page.access.run.id), reflectionReadersFor(page.db, page.access)])
    : [{ startHere: null, glossary: null }, { facilitatorFirstNames: [], asFacilitator: false }];
  return (
    <StartHere
      backHref={page.backHref}
      programmeName={page.programmeName}
      eyebrow={page.eyebrow}
      doc={guide.startHere}
      onThisSite={onThisSiteWords({ ...readers, leadFirstName: page.leadFirstName })}
      glossaryHref={guide.glossary ? `/learn/${encodeURIComponent(runId)}/glossary` : null}
    />
  );
}
