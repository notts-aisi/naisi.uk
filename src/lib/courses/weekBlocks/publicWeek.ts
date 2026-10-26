import { SOURCE_KIND_LABEL, partsOf, type WeekBlock } from "./model";
import type { Prose, Run } from "./prose";

/**
 * WHAT THE PUBLIC COURSE PAGES SHOW OF A BLOCK WEEK (Q40): its Why this week,
 * After this week you can, and the sources with their times, part by part.
 * Everything else stays behind sign-in: reflection prompts, the written
 * answer, the case study and its cases, content notes, fill-in boxes,
 * checklists, a part's own text, Go further and the hands-on route.
 *
 * A projection, built field by field: a public page is handed this, never the
 * week's blocks, so nothing the list below leaves out can reach the page's
 * HTML by accident. The week's title is the page's own (`CourseWeekDoc.title`).
 */

export type PublicSource = {
  /** "Read", "Watch", ... */
  kindLabel: string;
  /** Words before the title ("section 2, “Counting”, of"), or "". */
  lead: string;
  title: string;
  /** An https address, or "" for a source with no single link of its own. */
  url: string;
  by: string;
  date: string;
  /** "22 minutes", or "". */
  time: string;
};

/** One option of a Choose one: its name, what to read as written, and its time. */
export type PublicPack = { name: string; read: Run[]; time: string };

export type PublicPartItem =
  | { type: "source"; source: PublicSource }
  | {
      type: "choose";
      /** A table of named packs, or a list whose options are their own links. */
      form: "table" | "list";
      /** "Pathway", or the list's line ("one career review that fits you"). */
      title: string;
      kindLabel: string;
      /** One time for every option, or "" when each has its own. */
      time: string;
      packs: PublicPack[];
    };

export type PublicPart = {
  /** Its place among the parts, from 1. */
  number: number;
  title: string;
  time: string;
  items: PublicPartItem[];
};

export type PublicBlockWeek = {
  why: Prose;
  outcomes: { heading: string; items: string[] } | null;
  /** Before the session's time ("About 70 minutes, plus your threat model"), or "". */
  beforeTime: string;
  parts: PublicPart[];
};

function publicSource(source: {
  kind: keyof typeof SOURCE_KIND_LABEL;
  lead: string;
  title: string;
  url: string;
  by: string;
  date: string;
  time: string;
}): PublicSource {
  return {
    kindLabel: SOURCE_KIND_LABEL[source.kind],
    lead: source.lead,
    title: source.title,
    url: source.url,
    by: source.by,
    date: source.date,
    time: source.time,
  };
}

/** The public view of a block week's blocks. */
export function publicBlockWeek(blocks: readonly WeekBlock[]): PublicBlockWeek {
  const why = blocks.find((block) => block.type === "text" && block.role === "why");
  const outcomes = blocks.find((block) => block.type === "outcomes");
  const before = blocks.find((block) => block.type === "text" && block.role === "before");
  return {
    why: why && why.type === "text" ? why.body : [],
    outcomes:
      outcomes && outcomes.type === "outcomes"
        ? { heading: outcomes.heading || "After this week you can", items: [...outcomes.items] }
        : null,
    beforeTime: before && before.type === "text" ? before.time : "",
    parts: partsOf(blocks)
      .map((part, index) => ({
        number: index + 1,
        title: part.title,
        time: part.time,
        items: part.blocks.flatMap((child): PublicPartItem[] => {
          if (child.type === "source") return [{ type: "source", source: publicSource(child) }];
          if (child.type === "chooseOne") {
            return [
              {
                type: "choose",
                form: child.form,
                title: child.title,
                kindLabel: SOURCE_KIND_LABEL[child.kind],
                time: child.time,
                packs: child.packs.map((pack) => ({ name: pack.name, read: pack.read.map((run) => ({ ...run })), time: pack.time })),
              },
            ];
          }
          return [];
        }),
      }))
      // A part with nothing to read (a reflection alone, the written answer) says nothing in public.
      .filter((part) => part.items.length > 0),
  };
}
