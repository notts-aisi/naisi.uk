import { own } from "@/lib/applications/keys";
import type { CourseworkWeek, PersonWeek, QuestionStep } from "./model";
import { workKey } from "./model";

/**
 * ONE QUESTION, THE WHOLE GROUP (Fri 13 Nov 2026): the pure pieces of the page
 * that puts one question of a week in front of its reader with every person of
 * one group's answer to it. No reads, no clock, nothing server-only, so the
 * page and the tests import it as it is.
 *
 *  - THE WEEK'S QUESTIONS in its own order, and which one opens
 *    (`weekQuestionsOf`, `chosenQuestion`).
 *  - EACH ANSWER'S TWO STATES, at a glance and independent of each other
 *    (Zach, Fri 13 Nov: "both, separately"): opened or not ("Not read yet"
 *    until somebody on the team has opened it), and feedback or not ("No
 *    feedback yet", the feedback, or "Changed since feedback"). An answer
 *    with nothing written, or not shown to its readers in full yet, is
 *    neither read nor unread, and has nothing to give feedback on.
 *  - THE FILTERS (`readQuestionFilter`, `filterRows`, `filterCounts`):
 *    everybody; not read yet; no feedback yet; late. Any of the three may be
 *    combined with the others; each count is of the people this reader may
 *    read, whatever else is chosen.
 *  - WHICH ANSWERS A PAGE NAMES as put in front of its reader in full
 *    (`shownAnswerIds` for one person's week, `groupBoxesFirstRead` for the
 *    boxes under a group's This week's work), for the time each was first
 *    read; and
 *    what counts as read (`readStateOf`, `readableSinceOf`).
 *
 * Who may open the page, and whose answers it lists, is decided by the gates
 * the loader asks (`./questionLoad.ts`), never here.
 */

/** A question of the week, as the page asks it. */
export type WeekQuestion = QuestionStep & {
  /** The question's words. */
  text: string;
  /** Where it sits: "Part 1: Start with what you think", a fill-in box's heading, or "Written answer". */
  where: string;
};

/**
 * The week's questions in its own order (`CourseworkWeek.order`), each with
 * its words and where it sits. A question the week no longer asks is left out.
 */
export function weekQuestionsOf(week: CourseworkWeek, words: { part: (number: number, title: string) => string; answer: string }): WeekQuestion[] {
  const prompts = new Map(week.parts.flatMap((part) => part.prompts.map((prompt) => [prompt.id, { text: prompt.text, where: words.part(part.number, part.title) }] as const)));
  const boxes = new Map(week.boxes.map((box) => [box.id, { text: box.label ? `${box.heading}: ${box.label}` : box.heading, where: box.heading }] as const));
  const out: WeekQuestion[] = [];
  for (const step of week.order ?? []) {
    const found =
      step.kind === "reflection"
        ? prompts.get(step.id)
        : step.kind === "box"
          ? boxes.get(step.id)
          : week.answer && week.answer.id === step.id
            ? { text: week.answer.prompt, where: words.answer }
            : undefined;
    if (found) out.push({ ...step, ...found });
  }
  return out;
}

/**
 * The week's first question of a kind, as an address may ask for it without
 * its id (`first=answer`, `first=reflection`): its written answer, or its
 * first reflection. What the older pages' addresses forward to.
 */
export type FirstOfKind = "answer" | "reflection";

/** The kind of question an address asks to open on, or null. */
export function readFirstOfKind(value: unknown): FirstOfKind | null {
  return value === "answer" || value === "reflection" ? value : null;
}

/**
 * The question the address names, when the week asks it; else the week's
 * first question of the kind it asks for (`first`), when it asks one; else
 * the week's first. Null for a week that asks nothing written.
 */
export function chosenQuestion(questions: readonly WeekQuestion[], asked: unknown, first: FirstOfKind | null = null): WeekQuestion | null {
  const wanted = typeof asked === "string" ? asked : null;
  return (
    questions.find((question) => question.id === wanted) ??
    (first ? questions.find((question) => question.kind === first) : undefined) ??
    questions[0] ??
    null
  );
}

// ---------------------------------------------------------------------------
// The two states
// ---------------------------------------------------------------------------

/**
 * Opened or not: "unread" until somebody on the team has been shown it in
 * full, "read" since; null for an answer with nothing written, one its
 * readers may not read in full yet, or one nobody can say of (see
 * `readStateOf`).
 */
export type ReadState = "unread" | "read" | null;

/**
 * WHEN AN ANSWER BECAME READABLE IN THE WORDS SHOWN, which is what is held
 * against the instant the site began keeping read times: nothing could have
 * read those words before it. A reflection or a fill-in box: its last change
 * (`savedAt`), since its readers read it as it is typed. A written answer: the
 * later of the save of the words shown and, when those words were sent as
 * they are (`lastSentAt` at or after their save), their send; when they were
 * never sent as they are, the start of the session they are read from
 * (`sessionStart`), when its readers may first read words not sent. Null when
 * the save is not known.
 */
export function readableSinceOf(input: { savedAt: Date | null; lastSentAt?: Date | null; sessionStart?: Date | null; kind: "box" | "answer" }): Date | null {
  const { savedAt } = input;
  if (!savedAt) return null;
  if (input.kind === "box") return savedAt;
  const lastSent = input.lastSentAt ?? null;
  const sentAsShown = lastSent !== null && lastSent.getTime() >= savedAt.getTime();
  const other = sentAsShown ? lastSent : (input.sessionStart ?? null);
  return other && other.getTime() > savedAt.getTime() ? other : savedAt;
}

/**
 * Feedback or not, on an answer feedback can be on (the written answer):
 * "none" with no feedback yet, "given", or "changed" where the person changed
 * it after the feedback; null where there is nothing to give feedback on
 * (nothing written, not readable yet, or a reflection or a fill-in box, which
 * take no feedback of their own).
 */
export type FeedbackState = "none" | "given" | "changed" | null;

/**
 * WHETHER AN ANSWER HAS BEEN READ, from what the loader read, against
 * `keptFrom`, the instant this site began keeping read times (the store's
 * `readFirstReadsKeptFrom`; null before it has begun):
 *  - not shown to its readers in full (nothing written, or not readable yet):
 *    neither read nor unread;
 *  - a time is kept: read;
 *  - feedback on it, on any version: read, whatever is kept, because somebody
 *    on the team opened it to write that (a rating never counts: nothing is
 *    to be learnt from one by a reader who may not see ratings);
 *  - the site has not begun keeping read times, or the answer became readable
 *    in the words shown before it began (`readableSince`, `readableSinceOf`),
 *    or at a time nobody knows: nobody can say, so no state;
 *  - otherwise: unread.
 */
export function readStateOf(
  input: { shownInFull: boolean; readSince: Date | null | undefined; readableSince: Date | null; feedbackPieces: number },
  keptFrom: Date | null,
): ReadState {
  if (!input.shownInFull) return null;
  if (input.readSince) return "read";
  if (input.feedbackPieces > 0) return "read";
  if (!keptFrom || !input.readableSince || input.readableSince.getTime() < keptFrom.getTime()) return null;
  return "unread";
}

/** Feedback or not on a written answer its readers may read: none, given, or changed since. */
export function feedbackStateOf(input: { takesFeedback: boolean; pieces: number; changed: boolean }): FeedbackState {
  if (!input.takesFeedback) return null;
  if (input.pieces === 0) return "none";
  return input.changed ? "changed" : "given";
}

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------

/** The filters, as plain links: none chosen is everybody. */
export type QuestionFilter = { unread: boolean; noFeedback: boolean; late: boolean };

export const EVERYBODY_FILTER: QuestionFilter = { unread: false, noFeedback: false, late: false };

/** The filter asked for in the address. */
export function readQuestionFilter(query: { unread?: unknown; nofeedback?: unknown; late?: unknown }): QuestionFilter {
  return { unread: query.unread === "1", noFeedback: query.nofeedback === "1", late: query.late === "1" };
}

/** What a filter asks of a row. */
export type FilterRow = { read: ReadState; feedback: FeedbackState; late: boolean };

/** Whether a row is one the filter keeps: every chosen state at once. */
export function keeps(filter: QuestionFilter, row: FilterRow): boolean {
  return (!filter.unread || row.read === "unread") && (!filter.noFeedback || row.feedback === "none") && (!filter.late || row.late);
}

/** The rows a filter keeps, in their order. */
export function filterRows<T extends FilterRow>(rows: readonly T[], filter: QuestionFilter): T[] {
  return rows.filter((row) => keeps(filter, row));
}

/** Each filter's count, of every row this reader may read, whatever else is chosen. */
export function filterCounts(rows: readonly FilterRow[]): { everybody: number; unread: number; noFeedback: number; late: number } {
  return {
    everybody: rows.length,
    unread: rows.filter((row) => row.read === "unread").length,
    noFeedback: rows.filter((row) => row.feedback === "none").length,
    late: rows.filter((row) => row.late).length,
  };
}

/**
 * The page's address with a week, a question and a filter. `base` already
 * carries what the door needs (`?group=` on the programme's side). With no
 * week, the page opens its own; with no question, the week's first of the
 * kind `first` asks for, else its first.
 */
export function questionHref(
  base: string,
  at: { weekNumber: number | null; questionId: string | null; filter?: QuestionFilter; first?: FirstOfKind | null },
): string {
  const [path, existing = ""] = base.split("?");
  const params = new URLSearchParams(existing);
  if (at.weekNumber !== null) params.set("week", String(at.weekNumber));
  if (at.questionId) params.set("question", at.questionId);
  else if (at.first) params.set("first", at.first);
  const filter = at.filter ?? EVERYBODY_FILTER;
  if (filter.unread) params.set("unread", "1");
  if (filter.noFeedback) params.set("nofeedback", "1");
  if (filter.late) params.set("late", "1");
  return `${path}?${params.toString()}`;
}

/** A filter with one of its three switched: what each filter link leads to. */
export function toggled(filter: QuestionFilter, which: keyof QuestionFilter): QuestionFilter {
  return { ...filter, [which]: !filter[which] };
}

// ---------------------------------------------------------------------------
// What a page puts in front of its reader in full
// ---------------------------------------------------------------------------

/**
 * The answers of one person's week the reading view shows in full, by id: each
 * reflection with words, each fill-in box with words (only where the boxes
 * were read for this reader), and the written answer once its readers may read
 * it and it holds words. What the page names to be kept as first read.
 */
export function shownAnswerIds(week: PersonWeek): string[] {
  if (!week.counted) return [];
  const out: string[] = [];
  for (const part of week.parts) for (const prompt of part.prompts) if (prompt.answer?.text.trim()) out.push(prompt.id);
  for (const box of week.boxes ?? []) if (box.text?.trim()) out.push(box.id);
  if (week.answer && week.answer.words > 0) out.push(week.answer.id);
  return [...new Set(out)];
}

/**
 * What a group's week names as first read, person by person, once that
 * person's boxes under This week's work are opened ("Read it"): for each
 * person whose boxes the page draws (`loadGroupWeekBoxes`, the boxes' own
 * gate), the boxes they wrote in, in the week's order. Never the reader's own,
 * and nobody with nothing written. Null with nobody. The route asks its own
 * gates again.
 */
export function groupBoxesFirstRead(input: {
  weekId: string;
  readerUid: string;
  /** The week's boxes, in its order. */
  boxIds: readonly string[];
  /** The people whose boxes the page draws, with their words by box id. */
  people: ReadonlyArray<{ person: { uid: string }; answers: Readonly<Record<string, string>> }>;
}): { weekId: string; people: Array<{ uid: string; ids: string[] }> } | null {
  const people = input.people.flatMap(({ person, answers }) => {
    if (!person.uid || person.uid === input.readerUid) return [];
    const ids = [...new Set(input.boxIds)].filter((id) => (own(answers, id) ?? "").trim() !== "");
    return ids.length > 0 ? [{ uid: person.uid, ids }] : [];
  });
  return people.length > 0 ? { weekId: input.weekId, people } : null;
}

/** The id a person's row carries on the page of one question, for the switch from their week to land on them. */
export function personAnchorId(uid: string): string {
  return `p-${uid}`;
}

/** The id a question's answer carries on the reading view of one person's week, for the switch from the question to land on it. */
export function questionAnchorId(id: string): string {
  return `q-${id}`;
}

/** The key a person's answer to a question is stored under (`workKey`). */
export function answerKey(weekNumber: number, question: Pick<QuestionStep, "id">): string {
  return workKey(weekNumber, question.id);
}
