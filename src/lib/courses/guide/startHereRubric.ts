import type { CourseRubric } from "../rubric";
import { runsText, type Prose } from "../weekBlocks/prose";
import type { StartHereDoc } from "./model";

/**
 * START HERE'S RUBRIC, HELD TO THE COURSE'S. The written answer's card and
 * the feedback page tell a fellow the levels are "the rubric on Start here",
 * while feedback is given on the course's own rubric record
 * (`CourseDoc.rubric`, set in the course's details). An admin pastes the
 * table twice, once in each place, so nothing else holds the two together.
 *
 * The guide loader reads a Start here paste against the course's rubric and
 * names, among the things to check, a rubric on Start here that is not the
 * course's. It is a check and never a refusal: the page is saved either way,
 * and the admin decides which of the two to change.
 *
 * Start here's rubric is its first table whose top left heading is empty, as
 * the guide writes one (`|  | Not yet | Solid | Strong |`): the levels across
 * the top, a row for each thing below, its name in the first cell. Two tables
 * are the same rubric when their levels, row names and descriptors read the
 * same, spaces folded.
 *
 * Pure, so the route and a test ask the same thing.
 */

/** A cell's words, spaces folded. */
function words(runs: Parameters<typeof runsText>[0]): string {
  return runsText(runs).replace(/\s+/g, " ").trim();
}

/** The first table of some prose whose top left heading is empty, read as a rubric, or null. */
function rubricIn(prose: Prose): CourseRubric | null {
  for (const block of prose) {
    if (block.type !== "table") continue;
    const header = block.header.map((cell) => words(cell.runs));
    if (header.length < 3 || header[0] !== "") continue;
    const levels = header.slice(1);
    return {
      levels,
      rows: block.rows.map((row) => ({
        name: words(row.cells[0]?.runs ?? []),
        descriptors: levels.map((_, i) => words(row.cells[i + 1]?.runs ?? [])),
      })),
    };
  }
  return null;
}

/** Start here's rubric: the first such table on the page, the opening first, then each section in order. */
export function startHereRubricOf(doc: StartHereDoc): CourseRubric | null {
  for (const prose of [doc.lead, ...doc.sections.map((section) => section.body)]) {
    const found = rubricIn(prose);
    if (found) return found;
  }
  return null;
}

/** “Not yet”, “Solid” and “Strong”. */
function quoted(items: readonly string[]): string {
  const marked = items.map((item) => `“${item}”`);
  if (marked.length <= 1) return marked[0] ?? "";
  return `${marked.slice(0, -1).join(", ")} and ${marked[marked.length - 1]}`;
}

const fold = (text: string) => text.replace(/\s+/g, " ").trim();
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item, i) => fold(item) === fold(b[i]));

/**
 * The thing to check when Start here's rubric is not the course's, or null
 * when they match or Start here has none. Words for the admin who pastes.
 */
export function startHereRubricCheck(doc: StartHereDoc, course: CourseRubric | null): string | null {
  const here = startHereRubricOf(doc);
  if (!here) return null;
  if (!course) {
    return "Start here has a rubric, and the course has none, so feedback is a comment alone. Set the course’s rubric in its details if feedback should use these levels.";
  }
  let detail: string;
  if (!same(here.levels, course.levels)) {
    detail = `its levels are ${quoted(here.levels)}, and the course’s are ${quoted(course.levels)}`;
  } else if (!same(here.rows.map((row) => row.name), course.rows.map((row) => row.name))) {
    detail = `its rows are ${quoted(here.rows.map((row) => row.name))}, and the course’s are ${quoted(course.rows.map((row) => row.name))}`;
  } else {
    const cells = here.rows.reduce(
      (count, row, i) => count + row.descriptors.filter((text, j) => fold(text) !== fold(course.rows[i]?.descriptors[j] ?? "")).length,
      0,
    );
    if (cells === 0) return null;
    detail = cells === 1 ? "1 of its cells says something else" : `${cells} of its cells say something else`;
  }
  return `Start here’s rubric isn’t the course’s, which feedback is given on: ${detail}. Make them the same, here or in the course’s details.`;
}
