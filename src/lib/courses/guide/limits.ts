/**
 * The caps on a programme's Start here and Glossary (`./model.ts`), the two
 * pages of the fellow guide that are not weeks.
 *
 * They are their own, not a week's: read as a week, one real Glossary is
 * over two of a week's caps (a 74-row table against a week's 60, and 8,851
 * characters of text against a prose field's 8,000), and Start here's case
 * study section would read as a case block. Each number is a ceiling with
 * room over the two fellow guides of autumn 2026, never a target:
 *
 *  - Start here: 6,151 and 8,560 characters of Markdown, at most 7
 *    sections, the largest 2,469 characters, the longest line 399.
 *  - Glossary: 35 and 74 terms, the longest term 60 characters, the longest
 *    definition 271, the whole 4,224 and 9,479 characters.
 *
 * Everything inside a section's text (paragraphs, lists, tables, a line's
 * changes of style) keeps the week's own caps (`WEEK_BLOCK_LIMITS`), so the
 * one renderer draws both inside the same bounds.
 *
 * Only the server writes the two documents (`PUT /api/courses/runs/[runId]/
 * guide/[doc]`), and it refuses one over any of these. The read side cuts a
 * stored document down to them, so a document that reached Firestore some
 * other way still draws inside them.
 */
export const GUIDE_LIMITS = {
  /** A pasted document, in characters: more than ten times either real file. */
  pasteChars: 100_000,
  /** One document as stored (JSON), in characters: the run's document stays far under Firestore's 1 MiB with both beside its other fields. */
  storedChars: 100_000,
  /** The guide's title line ("… Fellowship: fellow guide"), kept for the copy and never drawn. */
  title: 200,

  // ---- Start here ----
  /** All the text of Start here: three and a half times the larger real one. */
  startHereChars: 30_000,
  /** Sections (a `##` or `###` heading and what follows it): the real ones have 7. */
  maxSections: 24,
  /** A section's heading. */
  heading: 160,
  /** A section's text: the week's prose cap, three times the largest real section. */
  sectionChars: 8000,
  /** The paragraphs under the title, before the first section: seven times the longer real one. */
  leadChars: 2000,
  /** The credit line at the foot ("Adapted from …"): one line of text, as a week's. */
  creditChars: 1000,

  // ---- Glossary ----
  /** Terms: over three times the longer real Glossary's 74. */
  maxTerms: 250,
  /** One term: twice the longest real one. */
  term: 120,
  /** One definition: one line of text, as a week's, over three times the longest real one. */
  definition: 1000,
  /** All the text of the Glossary's terms and definitions: over four times the larger real one. */
  glossaryChars: 40_000,
  /** The words heading each of the table's two columns ("Term", "In plain words"). */
  column: 60,
  /** The text under the title, before the table, and the text after it. */
  glossaryLeadChars: 2000,
} as const;
