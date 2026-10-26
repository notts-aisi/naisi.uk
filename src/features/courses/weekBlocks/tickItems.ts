import { SOURCE_KIND_LABEL, allBlocks, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import type { TickItem } from "../weekly/TickRows";

/**
 * THE SOURCES OF A WEEK WRITTEN AS BLOCKS, AS ROWS TO TICK where a page lists
 * a week's reading without drawing the week (Home's card, wk-home-phone, and
 * the programme home before the first session, st-programme): the sources on
 * the path, in page order. Never Go further, which is never counted. Of a
 * Choose one's packs, only the one the person has (`packs`, by the Choose
 * one's id, as the overview hands it): the others are not on their path. A
 * tick here is the same row the week page writes (`useMaterialTicks`).
 *
 * A row has one line and one way to open it: the words the guide writes
 * before a title ("section 2 of") go in front of the title, and a source
 * whose note carries its links opens its note's first link, as the one
 * reader of a week's sources (`weekSources`) gives it.
 */
export function blockTickItemsOf(blocks: readonly WeekBlock[], packs: Readonly<Record<string, string>> = {}): TickItem[] {
  const items: TickItem[] = [];
  for (const block of allBlocks(blocks)) {
    if (block.type === "source") {
      items.push({
        id: block.id,
        kind: "material",
        title: [block.lead.trim(), block.title.trim()].filter(Boolean).join(" "),
        chip: SOURCE_KIND_LABEL[block.kind],
        minutes: null,
        time: block.time || null,
        source: [block.by, block.date].map((part) => part.trim()).filter(Boolean).join(" · ") || null,
        href: safeSourceUrl(block.url || (block.note.find((run) => run.href)?.href ?? "")),
        body: null,
        optional: false,
      });
    } else if (block.type === "chooseOne") {
      const pack = block.packs.find((candidate) => candidate.id === packs[block.id]);
      if (!pack) continue;
      // A pack is ticked as one, on its id: its name, and its first link.
      items.push({
        id: pack.id,
        kind: "material",
        title: pack.name,
        chip: SOURCE_KIND_LABEL[block.kind],
        minutes: null,
        time: pack.time || block.time || null,
        source: null,
        href: safeSourceUrl(pack.read.find((run) => run.href)?.href ?? ""),
        body: null,
        optional: false,
      });
    }
  }
  return items;
}
