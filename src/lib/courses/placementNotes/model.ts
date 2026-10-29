/**
 * A NOTE FOR SOMEBODY PLACED OUTSIDE THE TIMES THEY GAVE, and where it stands.
 *
 * When Publish is about to tell somebody their group and that group meets at
 * a time they said they cannot make (`placedOutsideTheirTimes`,
 * `src/lib/courses/outsideTheirTimes.ts`), a person decides what they hear
 * first: a few sentences of our own, written by hand or drafted by Claude and
 * then edited and saved, or "Send without a note". Publish waits until each
 * such person has one or the other (`notesNeeded` on the plan).
 *
 * ## A choice belongs to one person in one group, until it is sent
 *
 * What was saved counts only for the group it was saved for: moving them to
 * another group voids it, and the next press asks again. Once the press that
 * told them has sent it (`sentAt`), it is spent: should they be moved away
 * and back, the next "Your group" email is a new one, and is asked for again.
 *
 * ## Where the words go
 *
 * Only in that person's own "Your group" email, as a section above the site's
 * own details: after its first paragraph when that paragraph is the greeting
 * ("Hi Ana,"), and at the very top otherwise (`withPlacementNote`). The email
 * stays the site's: the group, the day, the time, how long, the facilitators,
 * and the room when the group has one. The note says nothing the site does
 * not, and the site writes nothing in it.
 *
 * Pure, with one import (a type, which nothing runs), so a page, a route and
 * a test read the same answers.
 */
import type { Block } from "@/lib/firestore/newsletterBlocks";

/**
 * The server-only collection a choice is kept in, one document per person per
 * run (`./store.ts`). Named here, where nothing reaches the server, so the
 * run's destroy and the account's deletion can name it without importing
 * the store.
 */
export const PLACEMENT_NOTES_COLLECTION = "coursePlacementNotes";

/** The longest note: the invitation note's limit, for the same few sentences. */
export const PLACEMENT_NOTE_LIMIT = 1200;

/** What a person chose for somebody, as stored. */
export type PlacementChoice = "note" | "none";

/** The part of a stored record the standing reads. */
export type StoredChoice = {
  groupId: string | null;
  choice: PlacementChoice | null;
  text: string;
  savedByName: string | null;
  savedAt: Date | null;
  sentAt: Date | null;
};

export type NoteStanding =
  /** Words to go above the details, saved by `by`. */
  | { state: "noted"; text: string; by: string | null; at: Date | null }
  /** "Send without a note", chosen by `by`. */
  | { state: "without"; by: string | null; at: Date | null }
  /** Nothing chosen for this group yet, or what was chosen is spent or for another group. */
  | { state: "missing" };

/** Where somebody in `groupId` stands, from what is stored for them. */
export function noteStandingFor(stored: StoredChoice | null | undefined, groupId: string): NoteStanding {
  if (!stored || stored.groupId !== groupId || stored.sentAt !== null) return { state: "missing" };
  if (stored.choice === "none") return { state: "without", by: stored.savedByName, at: stored.savedAt };
  if (stored.choice === "note" && stored.text.trim()) {
    return { state: "noted", text: stored.text, by: stored.savedByName, at: stored.savedAt };
  }
  return { state: "missing" };
}

/**
 * A note as it is kept: no dash of either kind, whatever was typed or
 * drafted, no trailing space on a line, and never longer than a note may be.
 */
export function tidyPlacementNote(text: string): string {
  return text
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, PLACEMENT_NOTE_LIMIT)
    .trim();
}

/** Typed words as paragraphs: cut at blank lines, as every typed wording is. */
export function noteParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * One typed paragraph as the email prints it: escaped, its single line breaks
 * kept, and a curly bracket printed as a round one, as every typed value in a
 * course email is (`placementEmail.ts`), so nothing typed can look like a
 * token to the mail door.
 */
function paragraphHtml(paragraph: string): string {
  const escaped = paragraph
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  return `<p>${escaped.replace(/\n/g, "<br />")}</p>`;
}

const GREETING = /^\s*<p>\s*(Hi|Hello|Dear)\b[^<]*<\/p>/i;

/**
 * The email with the note as a section above the site's own details: after
 * the greeting, when the email opens with one, else first. Nothing else in
 * the email changes. An empty note leaves it exactly as it was.
 */
export function withPlacementNote(
  email: { subject: string; blocks: readonly Block[] },
  note: string,
): { subject: string; blocks: Block[] } {
  const paragraphs = noteParagraphs(note);
  if (paragraphs.length === 0) return { subject: email.subject, blocks: [...email.blocks] };
  const html = paragraphs.map(paragraphHtml).join("");
  const [first, ...rest] = email.blocks;
  if (first && first.type === "richText") {
    const greeting = GREETING.exec(first.html);
    if (greeting) {
      const at = greeting[0].length;
      return {
        subject: email.subject,
        blocks: [{ ...first, html: `${first.html.slice(0, at)}${html}${first.html.slice(at)}` }, ...rest],
      };
    }
  }
  return { subject: email.subject, blocks: [{ id: "placement-note", type: "richText", html }, ...email.blocks] };
}
