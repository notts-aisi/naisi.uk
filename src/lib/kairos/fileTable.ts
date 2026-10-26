import {
  FACILITATOR_QUESTIONS,
  MENTOR_QUESTIONS,
  type RatingAnswers,
  type RatingQuestion,
  type RatingsProgrammeKind,
} from "@/lib/ratings/model";

/**
 * THE KAIROS FILE'S LAYOUT: one row per person on a programme at its end who
 * has not said no to sharing with Kairos, holding only what the privacy
 * policy says goes to Kairos: their name, the programme, the sessions they
 * came to, whether they finished, and the ratings they were given at the end.
 * Never an email address, never who gave a rating, never a survey answer.
 *
 * Somebody rated by more than one person (two co-facilitators, or a
 * facilitator and the lead) has each rating's answer in its column, in the
 * order they were given, with "; " between them.
 *
 * Pure: the route reads the records and hands them over.
 */

export type KairosFilePerson = {
  name: string;
  /** Sessions they came to, from the register, of the ones marked (`of`). */
  came: number;
  of: number;
  /** Whether they finished, as the programme's lead decided it (or the rule suggested it). */
  finished: boolean;
  /** Every rating they were given, oldest first. */
  ratings: RatingAnswers[];
};

/** The columns every file starts with, before the ratings. */
export const KAIROS_FILE_COLUMNS = ["Name", "Programme", "Sessions attended", "Of", "Finished", "Ratings"] as const;

function columnOf(question: RatingQuestion): string {
  const name = question.short.charAt(0).toUpperCase() + question.short.slice(1);
  return question.kind === "scale" ? `${name} (${question.min} to ${question.max})` : name;
}

function valuesOf(ratings: readonly RatingAnswers[], question: RatingQuestion): string {
  const out: string[] = [];
  for (const rating of ratings) {
    const value = new Map<string, unknown>(Object.entries(rating)).get(question.key);
    if (value === undefined) continue;
    if (question.kind === "choice") out.push(question.options.find((option) => option.id === value)?.label ?? "");
    else out.push(String(value));
  }
  return out.filter((value) => value !== "").join("; ");
}

/** The file's header and rows, for one programme. An incubator's file adds the mentor rating's columns. */
export function kairosFileTable(
  programmeName: string,
  kind: RatingsProgrammeKind,
  people: readonly KairosFilePerson[],
): { header: string[]; rows: (string | number)[][] } {
  const questions = kind === "incubator" ? [...FACILITATOR_QUESTIONS, ...MENTOR_QUESTIONS] : [...FACILITATOR_QUESTIONS];
  const header = [...KAIROS_FILE_COLUMNS, ...questions.map(columnOf)];
  const rows = [...people]
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"))
    .map((person) => [
      person.name,
      programmeName,
      person.came,
      person.of,
      person.finished ? "Yes" : "No",
      person.ratings.length,
      ...questions.map((question) => valuesOf(person.ratings, question)),
    ]);
  return { header, rows };
}

/** "kairos-agi-strategy-2026-12-10.csv". */
export function kairosFilename(programmeName: string, today: string): string {
  const slug = programmeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `kairos-${slug || "programme"}-${today}.csv`;
}
