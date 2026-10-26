import { SOURCE_KIND_LABEL, allBlocks, type SourceBlock, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import type { TickItem } from "../weekly/TickRows";

/**
 * THE SOURCES OF A WEEK WRITTEN AS BLOCKS, AS ROWS TO TICK where a page lists
 * a week's reading without drawing the week (Home's card, wk-home-phone, and
 * the programme home before the first session, st-programme): the sources on
 * the path, in page order. Never Go further, which is never counted, and not
 * a Choose one's packs, which wait for the page that knows a person's pack.
 * A tick here is the same row the week page writes (`useMaterialTicks`).
 *
 * A row has one line and one way to open it: the words the guide writes
 * before a title ("section 2 of") go in front of the title, and a source
 * whose note carries its links opens its note's first link, as the one
 * reader of a week's sources (`weekSources`) gives it.
 */
export function blockTickItemsOf(blocks: readonly WeekBlock[]): TickItem[] {
  return allBlocks(blocks)
    .filter((block): block is SourceBlock => block.type === "source")
    .map((source) => ({
      id: source.id,
      kind: "material",
      title: [source.lead.trim(), source.title.trim()].filter(Boolean).join(" "),
      chip: SOURCE_KIND_LABEL[source.kind],
      minutes: null,
      time: source.time || null,
      source: [source.by, source.date].map((part) => part.trim()).filter(Boolean).join(" · ") || null,
      href: safeSourceUrl(source.url || (source.note.find((run) => run.href)?.href ?? "")),
      body: null,
      optional: false,
    }));
}
