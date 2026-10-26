import { marked, type Tokens } from "marked";

/**
 * WHAT A DOCUMENT IS, FROM ITS OWN WORDS: a session's plan, a week's notes,
 * a week of the fellow guide, or something else. Read from the title line
 * and the section headings the course docs' export gives each kind
 * (`docs/course-facilitator-guide.md`, "Telling the documents apart").
 *
 * Two loaders ask it, for opposite reasons:
 *
 *  - the facilitator guide's loader, so a document pasted into the wrong
 *    place ("Session 4" into week 3, a week of the fellow guide into the
 *    Handbook) is refused before it replaces the right one;
 *  - the week loader (`src/lib/courses/weekBlocks/paste.ts`), so facilitator
 *    material is NEVER written into a week, which anyone signed in can read.
 *    A session plan has no "Week 3:" title, so without this check the week
 *    loader would read one as a week of plain sections and save it.
 *
 * Pure.
 */

export type DocumentTitle =
  | { kind: "plan"; weekNumber: number }
  | { kind: "notes"; weekNumber: number }
  | { kind: "week"; weekNumber: number }
  | { kind: "course" }
  | { kind: "other" };

/**
 * The titles the course docs' export gives the facilitator guide's own tabs:
 * "...: session plans" (How to use these plans), "...: facilitator guide"
 * (the Handbook), "Case studies and feedback", "Printables", and the two
 * parent tabs, "Sessions" and "Week notes".
 */
const COURSE_DOCUMENT_TITLES: readonly RegExp[] = [
  /:\s*session plans$/i,
  /:\s*facilitator guide$/i,
  /^case studies and feedback$/i,
  /^printables$/i,
  /^sessions$/i,
  /^week notes$/i,
];

/**
 * "Session 3: What could go wrong" is week 3's plan; "Week 3 notes: ..." its
 * notes; "Week 3: ..." a week of the fellow guide; "...: facilitator guide"
 * and the other course documents' titles, a course document.
 */
export function readDocumentTitle(title: string): DocumentTitle {
  const text = title.replace(/\s+/g, " ").trim();
  const plan = /^session\s+(\d{1,2})\s*[:.·-]/i.exec(text);
  if (plan) return { kind: "plan", weekNumber: Number(plan[1]) };
  const notes = /^week\s+(\d{1,2})\s+notes\b/i.exec(text);
  if (notes) return { kind: "notes", weekNumber: Number(notes[1]) };
  const week = /^week\s+(\d{1,2})\s*[:.·-]/i.exec(text);
  if (week) return { kind: "week", weekNumber: Number(week[1]) };
  if (COURSE_DOCUMENT_TITLES.some((pattern) => pattern.test(text))) return { kind: "course" };
  return { kind: "other" };
}

/**
 * Section headings only facilitator material has: a session plan's run sheet
 * and its "If it goes differently", a week's notes' "The point of the week",
 * and any answer key. A week of the fellow guide has none of them.
 */
const FACILITATOR_ONLY_HEADINGS: readonly RegExp[] = [
  /^run sheet\b/i,
  /^if it goes differently\b/i,
  /^the point of the week\b/i,
  /\banswer keys?\b/i,
];

/** The words of every heading in some Markdown, code blocks left alone. */
function headingsOf(markdown: string): string[] {
  const out: string[] = [];
  const walk = (tokens: readonly unknown[]) => {
    for (const token of tokens as Array<{ type: string; text?: string; tokens?: unknown[] }>) {
      if (token.type === "heading") out.push(String((token as Tokens.Heading).text ?? "").replace(/\s+/g, " ").trim());
      else if (token.type === "blockquote" && Array.isArray(token.tokens)) walk(token.tokens);
    }
  };
  walk(marked.lexer(markdown, { gfm: true }));
  return out;
}

/**
 * Why this Markdown is facilitator material, in a sentence for the week
 * loader to refuse it with, or null when nothing says so. Its title line
 * first (the first heading of all), then its section headings.
 */
export function facilitatorMaterialIn(markdown: string): string | null {
  const headings = headingsOf(markdown);
  const title = readDocumentTitle(headings[0] ?? "");
  const where = "Facilitator material never goes in a week, which anyone signed in can read: load it in the course’s facilitator guide.";
  if (title.kind === "plan") return `This is session ${title.weekNumber}’s plan, for facilitators. ${where}`;
  if (title.kind === "notes") return `These are week ${title.weekNumber}’s notes for facilitators. ${where}`;
  if (title.kind === "course") return `“${headings[0]}” is one of the facilitator guide’s own documents. ${where}`;
  const marker = facilitatorOnlyHeading(headings);
  if (marker) return `“${marker}” is a heading only facilitator material has. ${where}`;
  return null;
}

/** The first heading that marks a document as facilitator material, or null. */
export function facilitatorOnlyHeading(headings: readonly string[]): string | null {
  return headings.find((heading) => FACILITATOR_ONLY_HEADINGS.some((pattern) => pattern.test(heading))) ?? null;
}
