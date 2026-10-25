/**
 * The caps on a week written as blocks (`CourseWeekDoc.blocks`), one per
 * kind of block and per field.
 *
 * They live in their own module, with no imports, so the block model and
 * `COURSE_FIELD_LIMITS` in `src/lib/firestore/courses.ts` can both read them
 * without importing each other: `COURSE_FIELD_LIMITS` spreads this object in,
 * which is where a reader of the courses model finds them.
 *
 * Each number is a ceiling a real week stays well inside, not a target. The
 * fellow guide's heaviest week (week 3: four parts, four packs of sources,
 * 22 cases in four groups, 45 links) is tens of kilobytes; the whole list is
 * also capped as JSON (`maxWeekBlocksChars`) so a week's document stays far
 * under Firestore's 1 MiB with its other fields beside it.
 *
 * Only the server writes `blocks` (`PUT /api/courses/runs/[runId]/weeks/
 * [weekId]/blocks`), and it refuses a week over any of these. The read side
 * (`sanitizeWeekBlocks`) cuts a stored week down to them, so a document that
 * reached Firestore some other way still draws inside them.
 */
export const WEEK_BLOCK_LIMITS = {
  /** Blocks at the top of a week (parts count once each). */
  maxWeekBlocks: 40,
  /** Blocks inside one part. */
  maxPartBlocks: 30,
  /** The whole `blocks` list as JSON, in characters. */
  maxWeekBlocksChars: 300_000,
  /** A block's or an item's id. */
  blockId: 48,

  // ---- Rich text ("prose") ----
  /** Paragraphs and lists in one prose field. */
  maxProseParagraphs: 40,
  /** Items in one list inside prose. */
  maxProseListItems: 40,
  /** Runs (stretches of text with one style) in one line. */
  maxRuns: 200,
  /** All the text of one prose field. */
  proseChars: 8000,
  /** One line of rich text: a source's note, a Go further item's line, a case's "what happened". */
  inlineChars: 1000,
  /** A link's address. */
  linkUrl: 500,

  // ---- This week ----
  maxThisWeekRows: 8,
  thisWeekWhat: 300,
  thisWeekTime: 80,
  /** The words in a row with nothing to do ("You’ll draw your first case at the end of session 1"). */
  thisWeekRowNote: 300,

  // ---- Text ----
  textHeading: 160,
  textTime: 120,

  // ---- Outcomes ----
  maxOutcomes: 8,
  outcome: 300,

  // ---- Content note ----
  maxSupportLinks: 8,
  supportLabel: 120,
  supportDetail: 200,

  // ---- Part ----
  partTitle: 200,
  partTime: 120,

  // ---- Source (also a pack's sources and a Go further item) ----
  sourceTitle: 300,
  sourceBy: 200,
  sourceDate: 40,
  sourceTime: 80,

  // ---- Reflection stop ----
  minReflectionPrompts: 1,
  maxReflectionPrompts: 2,
  reflectionPrompt: 600,

  // ---- Choose one ----
  chooseOneTitle: 200,
  minPacks: 2,
  maxPacks: 24,
  packName: 160,
  maxPackSources: 8,

  // ---- Table ----
  maxTableColumns: 8,
  maxTableRows: 60,

  // ---- Written answer ----
  /** The most words a word range may ask for. */
  maxAnswerWords: 5000,

  // ---- Cases ----
  casesHeading: 160,
  /** The longest talk, in minutes. */
  maxTalkMinutes: 60,
  talkName: 40,
  maxCaseGroups: 12,
  /** Cases in one Cases block, across its groups. */
  maxCases: 60,
  caseGroupName: 160,
  caseTitle: 200,
  maxCaseLinks: 6,
  caseLinkLabel: 120,

  // ---- Fill-in boxes ----
  fillInTitle: 160,
  maxFillInGroups: 12,
  /** Boxes in one Fill-in block, across its groups. */
  maxFillInBoxes: 30,
  fillInHeading: 200,
  fillInLabel: 200,

  // ---- Checklist (the existing item shape; the same lengths as a week's own checklist) ----
  maxChecklistBlockItems: 15,
  checklistItemTitle: 160,
  checklistItemDetail: 500,

  // ---- Go further ----
  goFurtherHeading: 160,
  maxGoFurther: 20,
} as const;
