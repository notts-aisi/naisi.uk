import type {
  ChecklistItem,
  CourseWeekDoc,
  MaterialType,
} from "@/lib/firestore/courses";
import {
  SOURCE_KIND_LABEL,
  isBlockWeek,
  type GoFurtherItem,
  type PartBlock,
  type SourceFields,
  type SourceKind,
  type ThisWeekBlock,
  type ThisWeekRow,
  type When,
  type WeekBlock,
  type WordRange,
} from "./model";
import { proseText, runsText } from "./prose";
import { weekIsReady } from "../weekReady";

/**
 * THE ONE READER OF A WEEK'S CONTENT, FOR BOTH SHAPES OF WEEK.
 *
 * A week written before blocks keeps its sources in `materials`, its
 * questions in `exercises` and its steps in `checklist`; a block week keeps
 * them in its blocks (`model.ts`). Every server-side reader that asks "what
 * can a person tick, answer or read in this week" asks here, so the two
 * shapes can never be counted two ways. On a week written before blocks
 * every answer below is exactly what the old arrays held, in their order.
 *
 * WHAT COUNTS AS THE PATH. A block week's sources are the ones in its parts
 * (and any outside a part), and every pack, each pack one source ticked as
 * one (its reading is one line with as many links as it has) and tagged
 * with its own id, because which pack is a person's is a per-person record
 * and not the week's. Go further is never on the path and never counted
 * (`weekGoFurther` lists it apart).
 *
 * Structural parameter types throughout, so a normalised `CourseWeekDoc` or a
 * group's copy of one passes straight in, and so this file can be read from
 * a browser as well as a server: it imports no server module.
 */

/** The fields of a week this reader reads. */
export type ReadableWeek = Pick<CourseWeekDoc, "summary" | "materials" | "exercises" | "checklist"> & {
  blocks?: WeekBlock[];
  ready?: boolean;
  published?: boolean;
  guideBlocks?: CourseWeekDoc["guideBlocks"];
};

/** One source on a week's path. */
export type WeekSource = {
  id: string;
  title: string;
  /** Its address, or null (a note on a week written before blocks has none). */
  url: string | null;
  /** The word a page shows for its kind: "Read", "Watch", ... or, on a week written before blocks, "Reading", "Video", "Link", "Note". */
  kindLabel: string;
  /** A block week's kind; null on a week written before blocks. */
  kind: SourceKind | null;
  /** A week written before blocks' material type; null on a block week. */
  legacyType: MaterialType | null;
  by: string;
  date: string;
  /** "22 minutes", "About 35 minutes", or "" (a block week's time is words). */
  time: string;
  /** Whole minutes where the week stores a number (weeks written before blocks), else null. */
  minutes: number | null;
  /**
   * An optional material on a week written before blocks: excluded from
   * completion, as it always was. Always false on a block week, whose
   * optional sources are Go further, which is not on the path.
   */
  optional: boolean;
  /** The pack it belongs to, or null when it is on everybody's path. */
  packId: string | null;
  /** The part it sits in, or null. */
  partId: string | null;
  /** Its note in plain text, or "". */
  note: string;
};

/** One written answer (a week written before blocks: one exercise). */
export type WeekWrittenAnswer = {
  id: string;
  /** The question, in plain text. */
  prompt: string;
  /** A block week's labelled boxes (week 6's one-page plan), or none: an answer of one box. */
  boxes: Array<{ id: string; label: string }>;
  /** A block week's word range, or null. */
  words: WordRange | null;
  /** An exercise's cap in characters, or null on a block week (which counts words). */
  maxLength: number | null;
  /** An exercise's own switch; a block week's written answer is always the week's one. */
  required: boolean;
  /** A block week's due rule (`due.ts` gives each group its moment), or null. */
  due: When | null;
  /** The part it sits in, or null. */
  partId: string | null;
};

/** One reflection prompt: a box a person writes in. Weeks written before blocks have none. */
export type WeekReflectionPrompt = {
  id: string;
  /** The stop it is in. */
  stopId: string;
  partId: string | null;
  text: string;
};

/** Every block of a block week with the part it sits in, in page order. */
function placed(blocks: readonly WeekBlock[]): Array<{ block: WeekBlock; part: PartBlock | null }> {
  const out: Array<{ block: WeekBlock; part: PartBlock | null }> = [];
  for (const block of blocks) {
    if (block.type === "part") {
      out.push({ block, part: null });
      for (const child of block.blocks) out.push({ block: child, part: block });
    } else {
      out.push({ block, part: null });
    }
  }
  return out;
}

function fromSource(
  id: string,
  source: SourceFields,
  part: PartBlock | null,
  packId: string | null,
): WeekSource {
  return {
    id,
    title: source.title,
    url: source.url || (source.note.find((run) => run.href)?.href ?? null),
    kindLabel: SOURCE_KIND_LABEL[source.kind],
    kind: source.kind,
    legacyType: null,
    by: source.by,
    date: source.date,
    time: source.time,
    minutes: null,
    optional: false,
    packId,
    partId: part?.id ?? null,
    note: runsText(source.note),
  };
}

const LEGACY_KIND_LABEL: Record<MaterialType, string> = {
  reading: "Reading",
  video: "Video",
  link: "Link",
  note: "Note",
};

/**
 * The sources on a week's path, in page order: a block week's Source blocks
 * and every pack, each pack one source ticked as one (its reading is one
 * line, with as many links as it has), never Go further; a week written
 * before blocks' materials, every one, as stored.
 */
export function weekSources(week: ReadableWeek): WeekSource[] {
  if (isBlockWeek(week)) {
    const out: WeekSource[] = [];
    for (const { block, part } of placed(week.blocks)) {
      if (block.type === "source") out.push(fromSource(block.id, block, part, null));
      if (block.type === "chooseOne") {
        for (const pack of block.packs) {
          out.push({
            id: pack.id,
            title: pack.name,
            url: pack.read.find((run) => run.href)?.href ?? null,
            kindLabel: SOURCE_KIND_LABEL[block.kind],
            kind: block.kind,
            legacyType: null,
            by: "",
            date: "",
            time: pack.time || block.time,
            minutes: null,
            optional: false,
            packId: pack.id,
            partId: part?.id ?? null,
            note: runsText(pack.read),
          });
        }
      }
    }
    return out;
  }
  return week.materials.map((material) => ({
    id: material.id,
    title: material.title,
    url: material.type === "note" ? null : material.url,
    kindLabel: LEGACY_KIND_LABEL[material.type],
    kind: null,
    legacyType: material.type,
    by: material.type === "reading" ? (material.author ?? "") : "",
    date: "",
    time: "",
    minutes: typeof material.estimatedMinutes === "number" ? material.estimatedMinutes : null,
    optional: material.optional === true,
    packId: null,
    partId: null,
    note: material.type === "note" ? material.body : material.type === "link" ? (material.description ?? "") : "",
  }));
}

/** Is this a source to read: a block week's "Read", or a reading on a week written before blocks. */
export function isReading(source: WeekSource): boolean {
  return source.kind === "read" || source.legacyType === "reading";
}

/** The week's written answers: a block week's Written answer blocks; otherwise its exercises, as stored. */
export function weekWrittenAnswers(week: ReadableWeek): WeekWrittenAnswer[] {
  if (isBlockWeek(week)) {
    return placed(week.blocks).flatMap(({ block, part }) =>
      block.type === "writtenAnswer"
        ? [
            {
              id: block.id,
              prompt: proseText(block.prompt),
              boxes: block.boxes.map((box) => ({ id: box.id, label: box.label })),
              words: block.words,
              maxLength: null,
              required: true,
              due: block.due,
              partId: part?.id ?? null,
            },
          ]
        : [],
    );
  }
  return week.exercises.map((exercise) => ({
    id: exercise.id,
    prompt: exercise.prompt,
    boxes: [],
    words: null,
    maxLength: exercise.maxLength,
    required: exercise.required,
    due: null,
    partId: null,
  }));
}

/** The week's reflection prompts, in page order. A week written before blocks has none. */
export function weekReflectionPrompts(week: ReadableWeek): WeekReflectionPrompt[] {
  if (!isBlockWeek(week)) return [];
  return placed(week.blocks).flatMap(({ block, part }) =>
    block.type === "reflection"
      ? block.prompts.map((prompt) => ({ id: prompt.id, stopId: block.id, partId: part?.id ?? null, text: prompt.text }))
      : [],
  );
}

/** The week's checklist items: a block week's Checklist blocks' items; otherwise its checklist, as stored. */
export function weekChecklistItems(week: ReadableWeek): ChecklistItem[] {
  if (!isBlockWeek(week)) return week.checklist;
  return placed(week.blocks).flatMap(({ block }) => (block.type === "checklist" ? block.items : []));
}

/** A block week's Go further items, every list in order. Never counted. Weeks written before blocks have none. */
export function weekGoFurther(week: ReadableWeek): GoFurtherItem[] {
  if (!isBlockWeek(week)) return [];
  return week.blocks.flatMap((block) => (block.type === "goFurther" ? block.items : []));
}

/** A block week's This week block, or null. */
export function weekThisWeek(week: ReadableWeek): ThisWeekBlock | null {
  if (!isBlockWeek(week)) return null;
  return (week.blocks.find((block) => block.type === "thisWeek") as ThisWeekBlock | undefined) ?? null;
}

/** This week's tasks (rows with something to do), or none. */
export function weekTasks(week: ReadableWeek): Extract<ThisWeekRow, { type: "task" }>[] {
  return (weekThisWeek(week)?.rows ?? []).filter(
    (row): row is Extract<ThisWeekRow, { type: "task" }> => row.type === "task",
  );
}

/**
 * The week's summary in plain text: its own `summary` when it has one;
 * otherwise, on a block week, the first paragraph of Why this week. The My
 * Work mirror's description and next week's email read this.
 */
export function weekSummaryText(week: { summary?: string | null; blocks?: readonly WeekBlock[] | null }): string {
  const own = (week.summary ?? "").trim();
  if (own || !Array.isArray(week.blocks)) return own;
  const why = week.blocks.find((block) => block.type === "text" && block.role === "why");
  if (!why || why.type !== "text") return "";
  const first = why.body[0];
  return first ? proseText([first]).trim() : "";
}

/**
 * Where a week stands on a lead's list of weeks (board pr-weeks): Ready once
 * the lead has marked it (`weekIsReady`, the one answer: marked, on a
 * published week), Empty while there is nothing in it, Draft otherwise.
 */
export function weekReadiness(week: ReadableWeek): "ready" | "draft" | "empty" {
  if (weekIsReady(week)) return "ready";
  const empty = isBlockWeek(week)
    ? week.blocks.length === 0
    : week.materials.length === 0 &&
      week.exercises.length === 0 &&
      week.checklist.length === 0 &&
      (week.guideBlocks?.length ?? 0) === 0;
  return empty ? "empty" : "draft";
}
