/**
 * A COURSE'S RUBRIC FOR WRITTEN ANSWERS (boards wk-review, wk-feedback-phone):
 * rows, each a name ("A clear position"), by levels ("Not yet", "Solid",
 * "Strong"), with one descriptor in each cell ("States a view"). A
 * facilitator gives each row of an answer one level and writes a short
 * comment; the fellow reads the level of each row with its descriptor.
 *
 * COURSEWORK NEVER GETS A MARK, A SCORE OR A TOTAL (board j-access). A level
 * is a word and nothing else: nothing here or anywhere numbers the levels,
 * adds them up or ranks one answer above another, and no field stores a
 * number for one.
 *
 * ONE RECORD, ON THE COURSE (`CourseDoc.rubric`), set by an admin in the
 * course's details, by pasting the guide's own table (`rubricMarkdown.ts`
 * reads it) or by typing one. Every run of the course gives feedback on the
 * same rows. A course with no rubric is allowed: its review page offers the
 * comment alone and says why.
 *
 * ONE READER: `rubricOf(course)`, for every page and route that needs it.
 *
 * Pure: no reads, no clock, nothing a browser cannot import.
 */

/** The caps on a rubric, checked by `rubricProblems` and held by the route that saves one. */
export const RUBRIC_LIMITS = {
  /** Levels across: the guides have three. */
  minLevels: 2,
  maxLevels: 5,
  /** Rows down: the guides have four. */
  maxRows: 8,
  levelName: 40,
  rowName: 80,
  descriptor: 300,
  /** The most a pasted table may be, in characters. */
  pasteChars: 20_000,
} as const;

/** One row of a rubric: its name, and one descriptor per level, in the levels' order. */
export type RubricRow = {
  name: string;
  descriptors: string[];
};

export type CourseRubric = {
  /** The levels' names, from the first column's right ("Not yet", "Solid", "Strong"). */
  levels: string[];
  rows: RubricRow[];
};

/** One row's level as feedback holds it: the row, the level given and that cell's descriptor, as given. */
export type GivenLevel = {
  row: string;
  level: string;
  descriptor: string;
};

/** One line of plain text, its spaces folded, cut to `max`. */
function line(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A stored rubric, read: null for none, for anything that is not one, and
 * for one with fewer than two levels or no rows (there is nothing to give
 * feedback on). Each row keeps a descriptor per level, "" where the cell is
 * empty. Never throws.
 */
export function normalizeRubric(raw: unknown): CourseRubric | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as { levels?: unknown; rows?: unknown };
  if (!Array.isArray(data.levels) || !Array.isArray(data.rows)) return null;
  const levels = data.levels
    .slice(0, RUBRIC_LIMITS.maxLevels)
    .map((level) => line(level, RUBRIC_LIMITS.levelName))
    .filter(Boolean);
  if (levels.length < RUBRIC_LIMITS.minLevels) return null;
  const rows: RubricRow[] = [];
  for (const value of data.rows.slice(0, RUBRIC_LIMITS.maxRows)) {
    if (!value || typeof value !== "object") continue;
    const row = value as { name?: unknown; descriptors?: unknown };
    const name = line(row.name, RUBRIC_LIMITS.rowName);
    if (!name) continue;
    const cells = Array.isArray(row.descriptors) ? row.descriptors : [];
    rows.push({ name, descriptors: levels.map((_, index) => line(cells[index], RUBRIC_LIMITS.descriptor)) });
  }
  return rows.length > 0 ? { levels, rows } : null;
}

/**
 * What stops a rubric being saved, each in a sentence that says what to
 * change. Empty when it can be saved.
 */
export function rubricProblems(rubric: CourseRubric): string[] {
  const out: string[] = [];
  if (rubric.levels.length < RUBRIC_LIMITS.minLevels) {
    out.push(`A rubric needs at least ${RUBRIC_LIMITS.minLevels} levels across the top, such as Not yet, Solid and Strong.`);
  }
  if (rubric.levels.length > RUBRIC_LIMITS.maxLevels) {
    out.push(`A rubric has at most ${RUBRIC_LIMITS.maxLevels} levels. This one has ${rubric.levels.length}.`);
  }
  if (rubric.rows.length === 0) out.push("A rubric needs at least one row, each with a name in its first cell.");
  if (rubric.rows.length > RUBRIC_LIMITS.maxRows) {
    out.push(`A rubric has at most ${RUBRIC_LIMITS.maxRows} rows. This one has ${rubric.rows.length}.`);
  }
  const seenLevels = new Set<string>();
  for (const level of rubric.levels) {
    const key = level.trim().toLowerCase();
    if (!key) out.push("Every level needs a name.");
    else if (seenLevels.has(key)) out.push(`Two levels are called “${level.trim()}”. Give each its own name.`);
    seenLevels.add(key);
    if (level.length > RUBRIC_LIMITS.levelName) {
      out.push(`The level “${level.slice(0, 20)}…” is longer than ${RUBRIC_LIMITS.levelName} characters.`);
    }
  }
  const seenRows = new Set<string>();
  for (const row of rubric.rows) {
    const key = row.name.trim().toLowerCase();
    if (!key) {
      out.push("Every row needs a name in its first cell.");
      continue;
    }
    if (seenRows.has(key)) out.push(`Two rows are called “${row.name.trim()}”. Give each its own name.`);
    seenRows.add(key);
    if (row.name.length > RUBRIC_LIMITS.rowName) {
      out.push(`The row “${row.name.slice(0, 20)}…” is longer than ${RUBRIC_LIMITS.rowName} characters.`);
    }
    if (row.descriptors.length !== rubric.levels.length) {
      out.push(`“${row.name.trim()}” has ${row.descriptors.length} descriptions for ${rubric.levels.length} levels. Give it one for each level.`);
    }
    row.descriptors.forEach((descriptor, index) => {
      if (!descriptor.trim()) {
        out.push(`“${row.name.trim()}” has no description for ${rubric.levels[index] ?? "one level"}. Write one in that cell.`);
      } else if (descriptor.length > RUBRIC_LIMITS.descriptor) {
        out.push(`“${row.name.trim()}” at ${rubric.levels[index] ?? "one level"} is longer than ${RUBRIC_LIMITS.descriptor} characters.`);
      }
    });
  }
  return out;
}

/** THE ONE READER: a course's rubric, or null when it has none. */
export function rubricOf(course: { rubric?: unknown } | null | undefined): CourseRubric | null {
  if (!course) return null;
  return normalizeRubric(course.rubric);
}

/**
 * The levels a reviewer chose, read against the rubric as it stands: one
 * level for every row, each a level the rubric has, matched by name. Returns
 * the levels as feedback stores them (each with its cell's descriptor, so the
 * fellow reads what was given even if the rubric is changed later), or the
 * sentence that says what to change.
 */
export function givenLevelsOf(
  rubric: CourseRubric,
  chosen: ReadonlyArray<{ row: unknown; level: unknown }>,
): { ok: true; levels: GivenLevel[] } | { ok: false; error: string } {
  const out: GivenLevel[] = [];
  for (const row of rubric.rows) {
    const pick = chosen.find((entry) => typeof entry.row === "string" && entry.row === row.name);
    if (!pick || typeof pick.level !== "string" || !pick.level) {
      return { ok: false, error: `Choose a level for “${row.name}”.` };
    }
    const index = rubric.levels.indexOf(pick.level);
    if (index < 0) {
      return { ok: false, error: "The rubric changed while you were giving feedback. Reload the page and choose again." };
    }
    out.push({ row: row.name, level: rubric.levels[index], descriptor: row.descriptors[index] ?? "" });
  }
  if (chosen.length > rubric.rows.length) {
    return { ok: false, error: "The rubric changed while you were giving feedback. Reload the page and choose again." };
  }
  return { ok: true, levels: out };
}

/** Levels as stored on feedback, read: each a row, a level and its descriptor, or nothing for a malformed one. */
export function normalizeGivenLevels(raw: unknown): GivenLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: GivenLevel[] = [];
  for (const value of raw.slice(0, RUBRIC_LIMITS.maxRows)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as { row?: unknown; level?: unknown; descriptor?: unknown };
    const row = line(entry.row, RUBRIC_LIMITS.rowName);
    const level = line(entry.level, RUBRIC_LIMITS.levelName);
    if (!row || !level) continue;
    out.push({ row, level, descriptor: line(entry.descriptor, RUBRIC_LIMITS.descriptor) });
  }
  return out;
}

/**
 * "a clear position, reasons and evidence, the best objection, and so what":
 * the rows' names as one list in running text, each with its first letter
 * made small, for the week page's line about what feedback covers.
 */
export function rowsInWords(rubric: CourseRubric): string {
  return rowNamesInWords(rubric.rows.map((row) => row.name));
}

/** Row names as one list in running text, as `rowsInWords` says them. */
export function rowNamesInWords(rowNames: readonly string[]): string {
  const names = rowNames.map((name) => name.charAt(0).toLowerCase() + name.slice(1));
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
