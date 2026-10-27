import { toCSV } from "@/lib/csv";
import type { TermView } from "./model";
import { TERM_WORDS, unmatchedWords } from "./words";

/**
 * "DOWNLOAD TOTALS (CSV)": the page's numbers as a spreadsheet, built from
 * the very view the page draws, so the two cannot say different things.
 * Three blocks, a blank line between them: the term and its numbers, its
 * events, its programmes. Counts and the board's words only: the view holds
 * no name, account id, address or answer's words, so the file cannot.
 *
 * Every cell goes through `toCSV`, which stops a title typed into an event
 * being read as a formula when the file is opened.
 *
 * Pure.
 */

const AT_THE_START = `${TERM_WORDS.considering}: at the start`;
const AT_THE_END = `${TERM_WORDS.considering}: at the end`;

export function termTotalsCsv(view: TermView): string {
  const tiles = view.tiles;
  const term = toCSV(
    ["Term", "Events", "Programmes", TERM_WORDS.checkIns, "At events", TERM_WORDS.differentPeople, TERM_WORDS.cameTwice, TERM_WORDS.note],
    [
      [
        view.label,
        view.events.length,
        view.programmes.length,
        tiles?.checkIns ?? "",
        tiles?.atEvents ?? "",
        tiles?.people ?? "",
        tiles?.cameTwice ?? "",
        tiles ? (tiles.unmatched ? unmatchedWords(tiles.people, tiles.cameTwice) : "") : TERM_WORDS.nobodyCheckedIn,
      ],
    ],
  );
  const events = toCSV(
    [TERM_WORDS.date, TERM_WORDS.event, TERM_WORDS.came, TERM_WORDS.surveyAnswers, TERM_WORDS.howWasIt, TERM_WORDS.note],
    view.events.map((row) => [
      row.date,
      row.title,
      row.cameCell,
      row.survey ? row.survey.answers : TERM_WORDS.noSurvey,
      row.survey ? row.survey.average : "",
      row.note,
    ]),
  );
  // The stage at each end, and how many people that is of: the page's "0 → 1 of 2".
  const programmes = toCSV(
    [
      TERM_WORDS.programme,
      TERM_WORDS.started,
      TERM_WORDS.finished,
      TERM_WORDS.answeredBoth,
      AT_THE_START,
      AT_THE_END,
      TERM_WORDS.consideringOf,
      TERM_WORDS.afterSurvey,
    ],
    [
      ...view.programmes.map((row) => [
        row.name,
        row.started,
        row.finished ?? TERM_WORDS.notYet,
        row.answeredBoth ?? "",
        row.considering?.start ?? "",
        row.considering?.end ?? "",
        row.considering?.of ?? "",
        row.afterSurvey,
      ]),
      [TERM_WORDS.footnote],
    ],
  );
  return `${term}\n\n${events}\n\n${programmes}\n`;
}

/** "this-term-in-numbers-autumn-2026-2026-12-10.csv". */
export function termTotalsFilename(label: string, today: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `this-term-in-numbers-${slug ? `${slug}-` : ""}${today}.csv`;
}
