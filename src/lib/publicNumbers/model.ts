/**
 * PUBLIC NUMBERS: what a programme's public page says about how its last term
 * went, in its "Last term" block (sv-public, pub-agi). `docs/surveys.md`,
 * "Public numbers", is the contract this file implements.
 *
 *   publicNumbers/{roundId}__{programmeId}   one per programme of a term's form
 *
 * IT HOLDS EXACTLY WHAT IS PUBLISHED, AND NOTHING OF WHERE IT CAME FROM: each
 * number's figure, its words and the base it rests on, as they read when an
 * admin pressed Publish; each quote's words; the block's heading, the line
 * under each quote and the closing line; the term; and when and by whom.
 * Never a respondent, an answer, a survey or any id of one. So a published
 * quote is linked to nobody, an account's deletion has nothing of it to find,
 * and a later change to the surveys never moves a published number.
 *
 * SERVER-ONLY IN BOTH DIRECTIONS. `firestore.rules` shuts it to every
 * browser, an admin's included. It is written only by the publish route
 * (`/api/surveys/public-numbers`, an admin's, on the Admin SDK) and deleted
 * only by Take it down (`/api/surveys/public-numbers/take-down`). The public
 * page reads it on the server through `fetchLastTerm` (`./fetch.ts`), which
 * hands the block the fields it draws and nothing else.
 *
 * Pure: words and shapes only, so the block, the admins' page and the routes
 * all ask the same functions.
 */

export const PUBLIC_NUMBERS_COLLECTION = "publicNumbers";

/** One programme of one term's form has one record: its address. */
export function publicNumbersId(roundId: string, programmeId: string): string {
  return `${roundId}__${programmeId}`;
}

/** A number as the block shows it: one figure ("23 of 27"), or one at the start and one at the end. */
export type PublishedFigure = { kind: "one"; value: string } | { kind: "pair"; start: string; end: string };

export type PublishedNumber = {
  /** The measure it was made from, so the admins' page can show it as picked. */
  id: string;
  figure: PublishedFigure;
  /** The words under the figure: "fellows would recommend it". */
  words: string;
  /** How many answers it rests on. */
  n: number;
  /** Those answers in words: "From 27 answers", "From the 25 who answered both". */
  base: string;
};

/** A comment its writer ticked "You can quote this, without my name": its words alone. */
export type PublishedQuote = { text: string };

export type PublicNumbersDoc = {
  id: string;
  roundId: string;
  programmeId: string;
  /** The course whose public page draws the block. */
  courseId: string;
  /** The term, as its form names it: "Autumn 2026". */
  term: string;
  /** "YYYY-MM-DD": the day of the run's last session when it was published, so a course's page shows its latest term. */
  lastSessionOn: string | null;
  /** "How autumn 2026 went." */
  heading: string;
  numbers: PublishedNumber[];
  quotes: PublishedQuote[];
  /** The line under every quote: "Autumn 2026 fellow". */
  attribution: string;
  /** "From the fellowship’s own surveys, autumn 2026: 27 of 31 fellows answered at the end, 25 of them at the start too." */
  footer: string;
  publishedAt: Date | null;
  publishedByUid: string;
};

/**
 * What the "Last term" block draws, and nothing else: no id, no uid, no
 * date, no base. The public page and the admins' preview hand the block this.
 */
export type LastTermBlockData = {
  heading: string;
  numbers: { figure: PublishedFigure; words: string }[];
  quotes: string[];
  attribution: string;
  footer: string;
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export type ProgrammeKind = "fellowship" | "incubator";

export const LAST_TERM_WORDS = {
  eyebrow: "Last term",
  start: "at the start",
  end: "at the end",
} as const;

const SEASONS = ["autumn", "spring", "summer", "winter"];

/**
 * A term's name inside a sentence: a season is not capitalised there
 * ("autumn 2026"), and any other name is left as its form writes it.
 */
export function termInSentence(term: string): string {
  const trimmed = term.trim();
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  return SEASONS.includes(first) ? `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}` : trimmed;
}

/** "How autumn 2026 went." */
export function headingWords(term: string): string {
  return `How ${termInSentence(term)} went.`;
}

/** The people of a programme of each kind, one and many. */
export function peopleNoun(kind: ProgrammeKind, count: number): string {
  if (kind === "incubator") return count === 1 ? "person" : "people";
  return count === 1 ? "fellow" : "fellows";
}

/**
 * The line under every quote: who said it, by the term and nothing that
 * could narrow it further. "Autumn 2026 fellow"; an incubator's names the
 * programme instead of a person ("Autumn 2026, research incubator").
 */
export function attributionWords(term: string, kind: ProgrammeKind): string {
  const name = term.trim();
  return kind === "incubator" ? `${name}, research incubator` : `${name} fellow`;
}

/** What the closing line counts: the survey at the end's answers and sends, and how many of those answered at the start too. */
export type FooterFacts = {
  kind: ProgrammeKind;
  term: string;
  /** Answers to the survey at the end. */
  answeredEnd: number;
  /** People the survey at the end was sent to. */
  sentEnd: number;
  /** Of the people who answered at the end, how many answered the before survey too; null when there is no before survey. */
  both: number | null;
};

/**
 * "From the fellowship’s own surveys, autumn 2026: 27 of 31 fellows answered
 * at the end, 25 of them at the start too." The second half is left off when
 * the programme has no before survey.
 */
export function footerWords(facts: FooterFacts): string {
  const sent = Math.max(facts.sentEnd, facts.answeredEnd);
  const own = facts.kind === "incubator" ? "the incubator’s" : "the fellowship’s";
  const head = `From ${own} own surveys, ${termInSentence(facts.term)}: ${facts.answeredEnd} of ${sent} ${peopleNoun(facts.kind, sent)} answered at the end`;
  if (facts.both === null) return `${head}.`;
  return `${head}, ${facts.both === 0 ? "none" : facts.both} of them at the start too.`;
}

// ---------------------------------------------------------------------------
// Reading what is stored
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === "object" && !Array.isArray(value);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const obj = value as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function readFigure(raw: unknown): PublishedFigure | null {
  if (!isRaw(raw)) return null;
  if (raw.kind === "one" && typeof raw.value === "string" && raw.value) return { kind: "one", value: raw.value };
  if (raw.kind === "pair" && typeof raw.start === "string" && raw.start && typeof raw.end === "string" && raw.end) {
    return { kind: "pair", start: raw.start, end: raw.end };
  }
  return null;
}

function readNumbers(raw: unknown): PublishedNumber[] {
  if (!Array.isArray(raw)) return [];
  const out: PublishedNumber[] = [];
  for (const entry of raw) {
    if (!isRaw(entry)) continue;
    const figure = readFigure(entry.figure);
    const words = str(entry.words).trim();
    if (!figure || !words) continue;
    const n = typeof entry.n === "number" && Number.isInteger(entry.n) && entry.n >= 0 ? entry.n : 0;
    out.push({ id: str(entry.id), figure, words, n, base: str(entry.base) });
  }
  return out;
}

function readQuotes(raw: unknown): PublishedQuote[] {
  if (!Array.isArray(raw)) return [];
  const out: PublishedQuote[] = [];
  for (const entry of raw) {
    const text = isRaw(entry) ? str(entry.text).trim() : "";
    if (text) out.push({ text });
  }
  return out;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePublicNumbers(id: string, data: Raw): PublicNumbersDoc {
  const lastSessionOn = str(data.lastSessionOn);
  return {
    id,
    roundId: str(data.roundId),
    programmeId: str(data.programmeId),
    courseId: str(data.courseId),
    term: str(data.term),
    lastSessionOn: DATE_KEY.test(lastSessionOn) ? lastSessionOn : null,
    heading: str(data.heading),
    numbers: readNumbers(data.numbers),
    quotes: readQuotes(data.quotes),
    attribution: str(data.attribution),
    footer: str(data.footer),
    publishedAt: tsToDate(data.publishedAt),
    publishedByUid: str(data.publishedByUid),
  };
}

/**
 * What the block draws from a record, or null when there is nothing to draw:
 * no heading, or neither a number nor a quote. Field by field, so nothing
 * else of the record can reach a page.
 */
export function blockOf(doc: PublicNumbersDoc): LastTermBlockData | null {
  if (!doc.heading || (doc.numbers.length === 0 && doc.quotes.length === 0)) return null;
  return {
    heading: doc.heading,
    numbers: doc.numbers.map((number) => ({
      figure: number.figure.kind === "one" ? { kind: "one", value: number.figure.value } : { kind: "pair", start: number.figure.start, end: number.figure.end },
      words: number.words,
    })),
    quotes: doc.quotes.map((quote) => quote.text),
    attribution: doc.attribution,
    footer: doc.footer,
  };
}

/**
 * Which of a course's published records its page shows: the latest term's,
 * by the day its run's last session was, then by when it was published.
 */
export function latestOf(docs: readonly PublicNumbersDoc[]): PublicNumbersDoc | null {
  const sorted = [...docs].sort(
    (a, b) =>
      (b.lastSessionOn ?? "").localeCompare(a.lastSessionOn ?? "") ||
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return sorted[0] ?? null;
}
