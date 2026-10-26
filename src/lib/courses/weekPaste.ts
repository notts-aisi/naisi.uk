import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";
import { dayBeforeWords } from "@/lib/courses/weekBlocks/markdownWrite";
import type { WeekBlock, WeekItem } from "@/lib/courses/weekBlocks/model";
import { MAX_PASTE_CHARS, readPastedWeek, type PastedWeek } from "@/lib/courses/weekBlocks/paste";

/**
 * A PASTED WEEK, READ AND COUNTED: the one set of checks behind both routes
 * that load a week from its Markdown (board pr-weeks, Q39), the run's own
 * week (`/api/courses/runs/[runId]/weeks/[weekId]/blocks`) and a group's own
 * copy of it (`/api/courses/groups/[groupId]/weeks/[weekId]/blocks`).
 *
 * Each route keeps its own gate and decides which stored week a paste is
 * read against; everything a paste is held to is here, so a group's copy is
 * held to exactly what the run's week is: the same body, the same reading
 * (`readPastedWeek`, ids kept on the same kind of thing), the same caps, and
 * the same count of answers on whatever the paste would take out.
 */

/** What a request to read or save a paste carries, or the sentence that says what is wrong with it. */
export type PasteBody = { markdown: string; confirmAnswers: number | null };

export async function pasteBodyOf(req: Request): Promise<PasteBody | { error: string }> {
  let body: { markdown?: unknown; confirmAnswers?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return { error: "Send the week’s Markdown as JSON." };
  }
  if (typeof body?.markdown !== "string" || body.markdown.trim() === "") {
    return { error: "Paste the week’s Markdown first." };
  }
  if (body.markdown.length > MAX_PASTE_CHARS) {
    return { error: `That is ${body.markdown.length} characters; a week’s Markdown can be at most ${MAX_PASTE_CHARS}.` };
  }
  const confirm = body.confirmAnswers;
  if (confirm !== undefined && confirm !== null && !(typeof confirm === "number" && Number.isInteger(confirm) && confirm >= 0)) {
    return { error: "The number of answers to confirm has to be a whole number." };
  }
  return { markdown: body.markdown, confirmAnswers: typeof confirm === "number" ? confirm : null };
}

/** The week a paste is read against: the blocks stored now (null for a week written before blocks), its number and the course's day-before time. */
export type PasteTarget = { blocks: WeekBlock[] | null; weekNumber: number; dayBeforeTime: string | null };

/** The paste, read against the week as stored, with the title's cap held too. */
export function readPasteAgainst(markdown: string, target: PasteTarget): PastedWeek {
  const read = readPastedWeek({
    markdown,
    weekNumber: target.weekNumber,
    stored: target.blocks,
    dayBeforeTime: target.dayBeforeTime,
  });
  if (read.title.length > COURSE_FIELD_LIMITS.weekTitle) {
    read.problems.push(`The title is ${read.title.length} characters; the most is ${COURSE_FIELD_LIMITS.weekTitle}.`);
  }
  return read;
}

/**
 * The answers on the items a paste takes out, by item id: ticks and ratings
 * (`courseProgress`), written answers and reflections (`courseExerciseResponses`,
 * this week's), and facilitators' notes on a source (`courseMaterialNotes`).
 *
 * `owners` narrows the count to the answers of the people who read the week
 * being pasted: null for the run's own week (every row of the run, which can
 * only over-count, never under-count, for a group that reads its own copy),
 * or a group's people and its facilitators for a group's own copy, whose
 * paste changes nothing anybody else reads.
 *
 * Each read is equality on the run alone, filtered here, so no read needs a
 * composite index. Nothing is read when nothing goes.
 */
export async function answersOnRemoved(
  db: Firestore,
  runId: string,
  weekId: string,
  removed: readonly WeekItem[],
  owners: ReadonlySet<string> | null = null,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const ids = new Set(removed.map((item) => item.id));
  if (ids.size === 0) return counts;
  const counted = (row: Record<string, unknown> | undefined) =>
    owners === null || (typeof row?.uid === "string" && owners.has(row.uid));
  const add = (id: unknown) => {
    if (typeof id === "string" && ids.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  const [progress, responses, notes] = await Promise.all([
    db.collection("courseProgress").where("runId", "==", runId).get(),
    db.collection("courseExerciseResponses").where("runId", "==", runId).get(),
    db.collection("courseMaterialNotes").where("runId", "==", runId).get(),
  ]);
  for (const doc of progress.docs) {
    const row = doc.data();
    if (counted(row)) add(row?.itemId);
  }
  for (const doc of responses.docs) {
    const row = doc.data();
    if (row?.weekId === weekId && counted(row)) add(row.exerciseId);
  }
  for (const doc of notes.docs) {
    const row = doc.data();
    if (counted(row)) add(row?.itemId);
  }
  return counts;
}

/** What "Read it" and a refused save show: the read, field by field, and the answers at stake. */
export function pasteAnswer(read: PastedWeek, counts: Map<string, number>, dayBeforeTime: string | null) {
  const answers = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return {
    /** The course's day-before rule in words ("by noon the day before"), for the line under the found list. */
    due: dayBeforeWords(dayBeforeTime),
    title: read.title,
    found: read.found.map((row) => ({ state: row.state, label: row.label, detail: row.detail, indent: row.indent })),
    checks: [...read.checks],
    problems: [...read.problems],
    removed: read.removed.map((item) => ({ id: item.id, kind: item.kind, label: item.label, answers: counts.get(item.id) ?? 0 })),
    answers,
    kept: read.kept,
    minted: read.minted,
    blockCount: read.blocks.length,
  };
}

export type PasteAnswer = ReturnType<typeof pasteAnswer>;

/** Whether a save must wait for the count it takes out to be confirmed, and the sentence that asks. */
export function unconfirmedAnswers(answer: PasteAnswer, confirmAnswers: number | null): string | null {
  if (answer.answers === 0 || confirmAnswers === answer.answers) return null;
  const items = answer.removed.filter((item) => item.answers > 0).length === 1 ? "an item" : "items";
  return `This paste takes out ${items} with ${answer.answers} ${answer.answers === 1 ? "answer" : "answers"}. Confirm to save it anyway.`;
}
