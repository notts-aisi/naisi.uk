import { proseText, runsText } from "@/lib/courses/weekBlocks/prose";
import { MAX_GUIDE_WEEK, type GuideBlock, type GuideDocument } from "./model";
import { characterName, undrawableIn } from "./printablesGlyphs";

/**
 * A COURSE'S PRINTABLES, SESSION BY SESSION: which parts of the course's
 * Printables document (the facilitator guide's `printables` place) go in
 * which session's PDF, read from the document's own "##" headings as the
 * course docs write them.
 *
 *  - "Session 1: credence card", "Session 1, Option C: the brief", "Actor
 *    cards (session 1)", "Intervention cards (session 4, Option B)": that
 *    session.
 *  - "Case slips (end of sessions 1 to 4)", "Briefing card (sessions 2 to
 *    5)", "Sessions 2 and 3: ...": each session named, a range taken whole.
 *  - "Every week: ..." (or each week, every session, each session, all
 *    sessions, all weeks): every session's PDF.
 *  - A heading that names no session goes only in the PDF of the whole
 *    document, and the loader says so when the printables are loaded
 *    (`noSessionCheck`), so nothing goes missing from a session in silence.
 *
 * A section is its "##" heading and everything under it to the next "##",
 * its "###" headings with it. What comes before the first "##" (the
 * document's own lines on how to print it) goes in every session's PDF, as it
 * does in the whole document's.
 *
 * NOTHING IS REWORDED OR ADDED. A session's document is the stored
 * document's own title and blocks, in its order, with the sections for other
 * sessions left out. The PDF is drawn from it each time it is asked for
 * (`printablesPdf.ts`) and is never stored.
 *
 * HOW MANY SESSIONS: as many weeks as the guide's place picker offers
 * (`guideWeekCount` in `model.ts`): the longest week plan of the course's
 * runs, and never fewer than a week already loaded.
 *
 * Pure, with no server import, so the pages, the route and the loader read it
 * alike.
 */

// ---------------------------------------------------------------------------
// Which sessions a heading names
// ---------------------------------------------------------------------------

/** Which sessions a section's heading names: every one, some, or none. */
export type SessionsNamed = { kind: "every" } | { kind: "some"; sessions: number[] } | { kind: "none" };

/** "Every week", "each session", "all sessions", "all the weeks". */
const EVERY_SESSION = /\b(?:every|each)\s+(?:week|session)\b|\ball\s+(?:the\s+)?(?:weeks|sessions)\b/i;

/** What may stand between two numbers of one list: a comma, "and", "or", "&", or a range ("to", "through", a hyphen, an en dash). */
const BETWEEN = String.raw`\s*(?:,\s*(?:and\s+|or\s+)?|\band\b|\bor\b|&|\bto\b|\bthrough\b|-|\u2013)\s*`;

/** "session 3", "sessions 1 to 4", "sessions 2, 3 and 5": the word, then its list of numbers. */
const NAMED_SESSIONS = new RegExp(String.raw`\bsessions?\s+(\d{1,3}(?:${BETWEEN}\d{1,3})*)`, "gi");

/** A separator that makes a range of the numbers either side of it. */
const RANGE = /\bto\b|\bthrough\b|-|\u2013/i;

/** The sessions in one list: "1 to 4" is 1, 2, 3 and 4; "2, 3 and 5" is those three. */
function numbersOf(list: string): number[] {
  const out: number[] = [];
  let before: number | null = null;
  let range = false;
  for (const part of list.split(/(\d+)/)) {
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (range && before !== null && n > before && n - before <= MAX_GUIDE_WEEK) {
        for (let k = before + 1; k <= n; k += 1) out.push(k);
      } else {
        out.push(n);
      }
      before = n;
      range = false;
    } else if (part) {
      range = RANGE.test(part);
    }
  }
  return out;
}

/**
 * The sessions a "##" heading names. "Every week" (and its kin) is every
 * session, whatever numbers the heading also carries; otherwise each number
 * after "session" or "sessions", from 1 to the last week a guide can have.
 */
export function sessionsNamedIn(heading: string): SessionsNamed {
  const text = heading.replace(/\s+/g, " ").trim();
  if (EVERY_SESSION.test(text)) return { kind: "every" };
  const sessions = new Set<number>();
  for (const match of text.matchAll(NAMED_SESSIONS)) {
    for (const n of numbersOf(match[1])) if (n >= 1 && n <= MAX_GUIDE_WEEK) sessions.add(n);
  }
  return sessions.size > 0 ? { kind: "some", sessions: [...sessions].sort((a, b) => a - b) } : { kind: "none" };
}

/** Does a section with this heading go in session `session`'s PDF? */
export function namesSession(named: SessionsNamed, session: number): boolean {
  return named.kind === "every" || (named.kind === "some" && named.sessions.includes(session));
}

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

/** One "##" section: its heading's words, the sessions it names, and its blocks (the heading first). */
export type PrintablesSection = { heading: string; named: SessionsNamed; blocks: GuideBlock[] };

/** A printables document in its parts: what comes before the first "##", then each section in order. */
export type PrintablesSplit = { preamble: GuideBlock[]; sections: PrintablesSection[] };

/** The document's blocks in their sections, in order. Every block is in exactly one part. */
export function splitPrintables(blocks: readonly GuideBlock[]): PrintablesSplit {
  const preamble: GuideBlock[] = [];
  const sections: PrintablesSection[] = [];
  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      const heading = runsText(block.runs);
      sections.push({ heading, named: sessionsNamedIn(heading), blocks: [block] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].blocks.push(block);
    } else {
      preamble.push(block);
    }
  }
  return { preamble, sections };
}

/** The sections a session's PDF carries, in the document's order. */
export function sectionsOfSession(doc: GuideDocument, session: number): PrintablesSection[] {
  return splitPrintables(doc.blocks).sections.filter((section) => namesSession(section.named, session));
}

/**
 * One session's printables, as a document of its own: the title, what comes
 * before the first "##", and the sections that name the session, each as
 * written and in the document's order.
 */
export function printablesOfSession(doc: GuideDocument, session: number): GuideDocument {
  const { preamble, sections } = splitPrintables(doc.blocks);
  return {
    title: doc.title,
    blocks: [...preamble, ...sections.filter((section) => namesSession(section.named, session)).flatMap((section) => section.blocks)],
  };
}

/** Each session from 1 to `sessions`, with how many sections its PDF carries (0: nothing to print). */
export function printablesBySession(doc: GuideDocument, sessions: number): { session: number; sections: number }[] {
  const { sections } = splitPrintables(doc.blocks);
  const out: { session: number; sections: number }[] = [];
  for (let session = 1; session <= Math.min(Math.max(0, Math.floor(sessions)), MAX_GUIDE_WEEK); session += 1) {
    out.push({ session, sections: sections.filter((section) => namesSession(section.named, session)).length });
  }
  return out;
}

/** The "##" headings that name no session, in order: what goes only in the whole document's PDF. */
export function headingsNamingNoSession(blocks: readonly GuideBlock[]): string[] {
  return splitPrintables(blocks)
    .sections.filter((section) => section.named.kind === "none")
    .map((section) => section.heading);
}

/**
 * The loader's thing to check when the printables name no session under a
 * heading, or null when every heading names one. Worth a look, never a
 * reason to refuse: the section still prints, in the whole document's PDF.
 */
export function noSessionCheck(headings: readonly string[]): string | null {
  if (headings.length === 0) return null;
  if (headings.length === 1) return `“${headings[0]}” names no session, so it goes only in the PDF of all the printables.`;
  return `${headings.length} headings name no session, so they go only in the PDF of all the printables: ${headings.map((heading) => `“${heading}”`).join(", ")}.`;
}

/** Every word a printables document draws, its title first: what its PDF needs a glyph for. */
export function printablesText(doc: GuideDocument): string {
  const blocks = doc.blocks.map((block) => {
    if (block.type === "heading") return runsText(block.runs);
    if (block.type === "quote") return proseText(block.body);
    if (block.type === "checklist") return block.items.map((item) => runsText(item.runs)).join("\n");
    return proseText([block]);
  });
  return [doc.title, ...blocks].join("\n");
}

/**
 * The loader's thing to check when the printables carry a character neither
 * of the PDF's fonts can draw (`printablesGlyphs.ts`), naming each one, or
 * null when there is none. The PDF still prints, with an empty box where each
 * one is, so the sentence says so before anybody prints it.
 */
export function undrawableCheck(doc: GuideDocument): string | null {
  const boxes = undrawableIn(printablesText(doc));
  if (boxes.length === 0) return null;
  if (boxes.length === 1) return `The PDF can’t draw ${characterName(boxes[0])}, so it prints as an empty box.`;
  return `The PDF can’t draw ${boxes.length} characters, so they print as empty boxes: ${boxes.map(characterName).join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Where a PDF is asked for, and what it is called
// ---------------------------------------------------------------------------

/** The route that draws the PDF: one session's, or the whole document's when `session` is null. */
export function printablesPdfPath(courseId: string, session: number | null): string {
  const base = `/api/courses/${encodeURIComponent(courseId)}/facilitator-guide/printables/pdf`;
  return session === null ? base : `${base}?session=${session}`;
}

/**
 * The `session` a request asks for: null when it asks for none (the whole
 * document), the number when it is a whole number from 1 to the last week a
 * guide can have, written plainly ("3", never "03" or "3.0"), and "bad" for
 * anything else.
 */
export function parseSessionParam(raw: string | null): number | null | "bad" {
  if (raw === null) return null;
  if (!/^[1-9]\d?$/.test(raw)) return "bad";
  const session = Number(raw);
  return session <= MAX_GUIDE_WEEK ? session : "bad";
}

/** A course's title as the start of a file name: "agi-strategy-fellowship". Letters and digits only, never empty. */
function fileWords(courseTitle: string): string {
  const words = courseTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return words || "course";
}

/** The name the PDF is saved under, naming the course and the session: "naisi-agi-strategy-fellowship-session-3-printables.pdf". */
export function printablesFileName(courseTitle: string, session: number | null): string {
  const course = fileWords(courseTitle);
  return session === null ? `naisi-${course}-printables.pdf` : `naisi-${course}-session-${session}-printables.pdf`;
}

/** The PDF's own title, which a reader shows in its title bar. */
export function printablesPdfTitle(courseTitle: string, session: number | null): string {
  const course = courseTitle.trim() || "A course";
  return session === null ? `${course}: printables` : `${course}: printables for session ${session}`;
}
