import type { StoredGrade, StoredHand, StoredTheme } from "@/lib/firestore/courseWeekReviews";
import type { GradesInput, HandsInput, ThemesInput } from "./input";

/**
 * WHAT COMES BACK FROM CLAUDE, CHECKED BEFORE ANY OF IT IS KEPT (privacy
 * v15). Claude's answer is held to what was sent: an id it was never sent is
 * dropped, a grade that is no whole number from 1 to 10 is dropped, an
 * answer graded twice keeps its first grade, and so on. Three rules matter
 * more than the rest, because they are what keeps a check-in where the
 * policy puts it:
 *
 *  - A HAND NEVER RESTS ON A CHECK-IN. The hands request is sent no
 *    check-in at all; a hand that cites one anyway (an id like "C4", or the
 *    word), or cites nothing that was sent, is dropped whole.
 *  - A THEME NEVER QUOTES A CHECK-IN. A title or a line that repeats six
 *    words in a row of any check-in's own words is not kept: the page never
 *    shows what a check-in said.
 *  - A THEME'S GROUPS ARE THE SITE'S, worked out from the items it cites,
 *    never Claude's list: a group nothing cited came from is never named.
 *
 * Pure: the tests hand these every malformed answer they can think of.
 */

type Raw = Record<string, unknown>;

const record = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const oneLine = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const ids = (value: unknown): string[] => list(value).map((id) => oneLine(id, 12)).filter(Boolean);

/** The most themes and hands kept from one answer. */
export const MOST_THEMES = 6;
export const MOST_HANDS = 15;

/** How many words in a row of a check-in make a quotation of it. */
export const QUOTE_WORDS = 6;

/** The draft grades Claude gave, kept to the answers it was sent. */
export function readGrades(value: unknown, input: Pick<GradesInput, "items">): StoredGrade[] {
  const out: StoredGrade[] = [];
  const seen = new Set<string>();
  for (const entry of list(record(value).grades)) {
    const id = oneLine(record(entry).answer, 12);
    const grade = record(entry).grade;
    const item = input.items.get(id);
    if (!item || seen.has(id)) continue;
    if (typeof grade !== "number" || !Number.isInteger(grade) || grade < 1 || grade > 10) continue;
    seen.add(id);
    out.push({ uid: item.uid, rowId: item.rowId, questionKey: item.questionKey, grade, hash: item.hash });
  }
  return out;
}

/** Lower-case words, for telling a quotation. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** Whether `text` repeats `QUOTE_WORDS` words in a row of any of `sources`. */
export function quotesAny(text: string, sources: readonly string[]): boolean {
  const said = wordsOf(text);
  if (said.length < QUOTE_WORDS) return false;
  const runs = new Set<string>();
  for (let at = 0; at + QUOTE_WORDS <= said.length; at += 1) runs.add(said.slice(at, at + QUOTE_WORDS).join(" "));
  for (const source of sources) {
    const words = wordsOf(source);
    for (let at = 0; at + QUOTE_WORDS <= words.length; at += 1) {
      if (runs.has(words.slice(at, at + QUOTE_WORDS).join(" "))) return true;
    }
  }
  return false;
}

/**
 * What people found hard, kept to what was sent: each theme's cited answers,
 * check-ins and reports among those sent, at least one of them; its groups
 * from what it cites, in meeting order; its part only one that was named; and
 * never a title or a line that quotes a check-in.
 */
export function readThemes(value: unknown, input: Pick<ThemesInput, "answers" | "checkIns" | "reports" | "parts" | "groupLabels" | "checkInWords">): StoredTheme[] {
  const order = Object.values(input.groupLabels);
  const out: StoredTheme[] = [];
  for (const entry of list(record(value).themes)) {
    if (out.length === MOST_THEMES) break;
    const theme = record(entry);
    const title = oneLine(theme.title, 120);
    if (!title || quotesAny(title, input.checkInWords)) continue;
    const answers = [...new Set(ids(theme.answers))].flatMap((id) => {
      const answer = input.answers.get(id);
      return answer ? [answer] : [];
    });
    const checkIns = [...new Set(ids(theme.checkIns))].filter((id) => input.checkIns.has(id));
    const reports = [...new Set(ids(theme.reports))].filter((id) => input.reports.has(id));
    if (answers.length + checkIns.length + reports.length === 0) continue;
    const groups = new Set<string>([
      ...answers.flatMap((answer) => (answer.groupId ? [answer.groupId] : [])),
      ...checkIns.map((id) => input.checkIns.get(id) as string),
      ...reports.map((id) => input.reports.get(id) as string),
    ]);
    const detail = oneLine(theme.detail, 300);
    out.push({
      title,
      partId: input.parts.get(oneLine(theme.part, 12)) ?? null,
      groupIds: order.filter((groupId) => groups.has(groupId)),
      answers: answers.map(({ uid, rowId }) => ({ uid, rowId })),
      checkIns: checkIns.length,
      reports: reports.length,
      detail: quotesAny(detail, input.checkInWords) ? "" : detail,
    });
  }
  return out;
}

/** Whether a fellow's label is in some words as itself ("Fellow 3", never "Fellow 31"). */
function names(words: string, label: string): boolean {
  return new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b(?!\\d)`).test(words);
}

/**
 * Who might need a hand, kept to what was sent: a fellow's label that was
 * sent, citing at least one of their own answers or a report that speaks of
 * them, and nothing else. A hand that cites a check-in, or mentions one, is
 * dropped whole. One a person.
 */
export function readHands(value: unknown, input: Pick<HandsInput, "labels" | "answers" | "reports">): StoredHand[] {
  const out: StoredHand[] = [];
  for (const entry of list(record(value).hands)) {
    if (out.length === MOST_HANDS) break;
    const hand = record(entry);
    const label = oneLine(hand.fellow, 20);
    const uid = Object.prototype.hasOwnProperty.call(input.labels, label) ? input.labels[label] : undefined;
    const why = oneLine(hand.why, 240);
    if (!uid || !why || out.some((other) => other.uid === uid)) continue;
    const cited = [...ids(hand.answers), ...ids(hand.reports)];
    // Never a check-in, by id or by word: the request had none to cite.
    if (cited.some((id) => /^C\d+$/i.test(id)) || /check[\s-]?in|\bC\d+\b/i.test(why)) continue;
    const answers = [...new Set(ids(hand.answers))].filter((id) => input.answers.get(id) === uid);
    const reports = [...new Set(ids(hand.reports))].filter((id) => {
      const said = input.reports.get(id);
      return said !== undefined && names(said, label);
    });
    if (answers.length + reports.length === 0) continue;
    out.push({ uid, why, answers: answers.length, reports: reports.length });
  }
  return out;
}
