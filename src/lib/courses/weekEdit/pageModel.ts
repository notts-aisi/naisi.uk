import type { BlockType, SourceKind, When, WordRange } from "../weekBlocks/model";
import type { EditorFields, SourceEditorFields } from "./model";
import { COUNT_WORDS, PANEL_WORDS, PASTE_CHECK, listWords } from "./pageWords";
import { EDIT_REFUSAL } from "./words";

/**
 * THE PAGES OF THE IN-PLACE EDITOR, the pure half: what the count beside a
 * block says, what the side panel's boxes hold and what a save of them
 * sends, who a save reaches in words, which comparison two ticks in the
 * history ask for, the version a restore names, and what the paste's check
 * says about each block it changes or takes out.
 *
 * A SAVE SENDS ONLY WHAT CHANGED. The route keeps every field it is not
 * sent, so a save that names one field cannot put back an older value of
 * another that somebody changed meanwhile; and a changed link always says it
 * is the same reading at a new address (`reading: "same"`), which keeps
 * every tick. The block's fingerprint as loaded goes with it: the route
 * refuses a save of a block that changed since.
 *
 * Pure: no reads, no clock. The pages call the routes.
 */

export type Counts = { ticks: number; answers: number; sent: number };

/** The count beside a block people tick or answer ("7 ticked", "3 answers", "2 sent"); null for any other. */
export function countLine(type: BlockType, counts: Counts): string | null {
  switch (type) {
    case "source":
    case "checklist":
      return COUNT_WORDS.ticked(counts.ticks);
    case "chooseOne":
      return COUNT_WORDS.packs(counts.ticks);
    case "reflection":
    case "fillIn":
      return COUNT_WORDS.answers(counts.answers);
    case "writtenAnswer":
      return COUNT_WORDS.sent(counts.sent);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The side panel's boxes
// ---------------------------------------------------------------------------

/** What the panel's boxes hold: every box a string, as typed. */
export type Draft =
  | { type: "source"; fields: SourceEditorFields }
  | { type: "text"; fields: { heading: string; time: string; body: string } }
  | { type: "reflection"; fields: { prompts: Array<{ id: string; text: string }> } }
  | { type: "writtenAnswer"; fields: { heading: string; question: string; guidance: string; min: string; max: string; due: When } };

/** The boxes as the block stands, from the editor's fields. */
export function draftOf(stored: EditorFields): Draft {
  switch (stored.type) {
    case "source":
      return { type: "source", fields: { ...stored.fields } };
    case "text":
      return { type: "text", fields: { heading: stored.fields.heading, time: stored.fields.time, body: stored.fields.body } };
    case "reflection":
      return { type: "reflection", fields: { prompts: stored.fields.prompts.map((prompt) => ({ ...prompt })) } };
    case "writtenAnswer":
      return {
        type: "writtenAnswer",
        fields: {
          heading: stored.fields.heading ?? "",
          question: stored.fields.question,
          guidance: stored.fields.guidance,
          min: stored.fields.words ? String(stored.fields.words.min) : "",
          max: stored.fields.words ? String(stored.fields.words.max) : "",
          due: stored.fields.due,
        },
      };
  }
}

/** A save's fields: only what changed, and the reading choice a new link needs. */
export type Changes = { fields: Record<string, unknown>; reading?: "same" };

/** A word range from its two boxes: null for both empty; a refusal in words for anything but two whole numbers. */
export function rangeOf(min: string, max: string): { words: WordRange | null } | { error: string } {
  const a = min.trim();
  const b = max.trim();
  if (a === "" && b === "") return { words: null };
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return { error: EDIT_REFUSAL.wordsShape };
  return { words: { min: Number(a), max: Number(b) } };
}

function sameRange(a: WordRange | null, b: WordRange | null): boolean {
  return a === null || b === null ? a === b : a.min === b.min && a.max === b.max;
}

/**
 * What a save of the panel sends, against the block as it was loaded: only
 * the fields whose boxes differ, a changed link saying it is the same
 * reading at a new address. Null when no box differs ("nothing changed",
 * which saves nothing). A word range that is not two whole numbers is a
 * refusal in the route's own words, before anything is sent.
 */
export function changesOf(stored: EditorFields, draft: Draft): Changes | { error: string } | null {
  const fields: Record<string, unknown> = {};
  if (stored.type === "source" && draft.type === "source") {
    for (const key of ["kind", "title", "url", "by", "date", "time", "note"] as const) {
      if (draft.fields[key] !== stored.fields[key]) fields[key] = draft.fields[key];
    }
    if (Object.keys(fields).length === 0) return null;
    return "url" in fields ? { fields, reading: "same" } : { fields };
  }
  if (stored.type === "text" && draft.type === "text") {
    if (stored.fields.headingAllowed && draft.fields.heading !== stored.fields.heading) fields.heading = draft.fields.heading;
    if (stored.fields.timeAllowed && draft.fields.time !== stored.fields.time) fields.time = draft.fields.time;
    if (draft.fields.body !== stored.fields.body) fields.body = draft.fields.body;
    return Object.keys(fields).length === 0 ? null : { fields };
  }
  if (stored.type === "reflection" && draft.type === "reflection") {
    // Every prompt is sent, ids as loaded: the route keeps how many there are.
    const changed = draft.fields.prompts.some((prompt, at) => prompt.text !== stored.fields.prompts[at]?.text);
    return changed ? { fields: { prompts: draft.fields.prompts.map((prompt) => ({ id: prompt.id, text: prompt.text })) } } : null;
  }
  if (stored.type === "writtenAnswer" && draft.type === "writtenAnswer") {
    if (stored.fields.heading !== null && draft.fields.heading !== stored.fields.heading) fields.heading = draft.fields.heading;
    if (draft.fields.question !== stored.fields.question) fields.question = draft.fields.question;
    if (draft.fields.guidance !== stored.fields.guidance) fields.guidance = draft.fields.guidance;
    if (stored.fields.boxes.length === 0) {
      const range = rangeOf(draft.fields.min, draft.fields.max);
      if ("error" in range) return range;
      if (!sameRange(range.words, stored.fields.words)) fields.words = range.words;
    }
    if (draft.fields.due !== stored.fields.due) fields.due = draft.fields.due;
    return Object.keys(fields).length === 0 ? null : { fields };
  }
  return null;
}

/** The link's host, for "lesswrong.com": "" for anything that is not an address. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** "250 to 350 words", or "" for no range. */
export function rangeWords(words: WordRange | null): string {
  return words ? `${words.min} to ${words.max} words` : "";
}

/** Whether a kind of source is one the panel offers: every stored source is. */
export function isSourceKind(value: string, kinds: readonly SourceKind[]): value is SourceKind {
  return (kinds as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Who a save reaches
// ---------------------------------------------------------------------------

export type Reach = { groups: Array<{ id: string; name: string; ownCopy: boolean }>; reading: number; copies: string[] };

/** "Save for": the one choice this slice saves for, and the line under it. */
export function saveScope(reach: Reach, programme: string): { title: string; line: string } {
  const all = reach.groups.length;
  if (all === 0) return { title: PANEL_WORDS.everyGroup(programme, 0), line: PANEL_WORDS.noGroups };
  return {
    title: PANEL_WORDS.everyGroup(programme, all),
    line: reach.copies.length > 0 ? PANEL_WORDS.exceptCopies(reach.copies) : PANEL_WORDS.allRead(all),
  };
}

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

/** "Tue 10 Nov, 2:24pm" to "Tue 10 Nov": the version a restore names. */
export function versionLabel(when: string): string {
  return when.split(",")[0]?.trim() || when;
}

/**
 * What two ticks ask the comparison route for: one ticked is that save
 * against now (and only then can it be restored); two are the two saves,
 * whichever was ticked first; none or more than two ask for nothing.
 */
export function compareRequest(ticked: readonly string[]): { saveId: string; against: string } | null {
  if (ticked.length === 1) return { saveId: ticked[0], against: "now" };
  if (ticked.length === 2) return { saveId: ticked[0], against: ticked[1] };
  return null;
}

/** A tick on one more row: the newest two are kept, so a third tick lets the oldest go. */
export function tickRow(ticked: readonly string[], id: string, on: boolean): string[] {
  const without = ticked.filter((each) => each !== id);
  if (!on) return without;
  return [...without, id].slice(-2);
}

// ---------------------------------------------------------------------------
// Paste the week, then check it
// ---------------------------------------------------------------------------

/** "This week · Outcomes (4) · Content note · Part (4) · Source (6)". */
export function kindsLine(kinds: ReadonlyArray<{ label: string; count: number }>): string {
  return kinds.map((kind) => PASTE_CHECK.kind(kind.label, kind.count)).join(" · ");
}

/** The blocks a paste's check lists against the week now. */
export type PasteRow = { state: "changed" | "added" | "removed"; place: string; fields: string; keeps: string; answers: number };

/**
 * Each block the paste changes, adds or takes out, with what that does to
 * people's work: a changed block keeps its ticks and answers (the counts the
 * week's page loaded beside it), an added one has none yet, and a removed
 * one's answers stay with the people who wrote them (the check's own count
 * on each item it takes out).
 */
export function pasteRows(
  rows: ReadonlyArray<{ state: "changed" | "added" | "removed"; blockId: string; place: string; fields: string; itemsTakenOut: string[] }>,
  countsOf: (blockId: string) => Counts | null,
  removed: ReadonlyArray<{ id: string; answers: number }>,
): PasteRow[] {
  const answersOn = new Map(removed.map((item) => [item.id, item.answers] as const));
  return rows.map((row) => {
    const answers = row.itemsTakenOut.reduce((sum, id) => sum + (answersOn.get(id) ?? 0), 0);
    const counts = row.state === "changed" ? countsOf(row.blockId) : null;
    return {
      state: row.state,
      place: row.place,
      fields: row.fields,
      keeps: counts ? PASTE_CHECK.keeps(counts.ticks, counts.answers) : "",
      answers,
    };
  });
}

/** The paste's replace button: for how many groups, and the answers it takes out when it takes any. */
export function replaceLabel(weekNumber: number, reach: Pick<Reach, "groups" | "reading">, answers: number): string {
  const label = PASTE_CHECK.replace(weekNumber, reach.reading, reach.groups.length);
  return answers > 0 ? PASTE_CHECK.replaceTakingOut(label, answers) : label;
}

/** "Group K and Group L": names as a sentence lists them. */
/** How long a page holds a week with nobody typing, clicking or scrolling before it gives the hold back. */
export const LOCK_IDLE_MS = 10 * 60_000;

/** What a page holding a week for an open edit does on a beat of its keep-alive. */
export type LockBeat = "keep" | "letGo" | "takeAgain" | "wait";

/**
 * ONE BEAT OF A PAGE'S HOLD ON A WEEK, decided from what the page knows.
 *
 *  - The tab is hidden: the hold is given back (`letGo`), as the admin
 *    pages' own lock does, and never kept alive or taken again from a
 *    hidden tab (`wait`).
 *  - Nobody has typed, clicked or scrolled on the page for `idleMs` (ten
 *    minutes): the hold is given back, so a panel left open does not keep
 *    the week from everybody else for hours.
 *  - Given back by this page (`letGoAt`): the page says the hold ended and
 *    keeps what was typed (the same path as a hold that lapsed), and takes
 *    it again once the person is back: input after the let go, or the tab
 *    shown again (which the page counts as input).
 *  - Lost to somebody else (no `letGoAt`): tried again on every beat.
 *  - Otherwise, kept alive.
 */
export function lockBeat(input: {
  visible: boolean;
  lost: boolean;
  now: number;
  lastInputAt: number;
  letGoAt: number | null;
  idleMs?: number;
}): LockBeat {
  if (!input.visible) return input.lost ? "wait" : "letGo";
  if (input.lost) return input.letGoAt !== null && input.lastInputAt <= input.letGoAt ? "wait" : "takeAgain";
  if (input.now - input.lastInputAt >= (input.idleMs ?? LOCK_IDLE_MS)) return "letGo";
  return "keep";
}

export { listWords };
