import { marked, type Token, type Tokens } from "marked";
import { RUBRIC_LIMITS, rubricProblems, type CourseRubric } from "./rubric";

/**
 * A RUBRIC AS A TABLE OF TEXT, read and written: how an admin sets a
 * course's rubric (`CourseDoc.rubric`) in its details, by pasting the guide's
 * own table or by typing one in the same shape:
 *
 * ```
 * |  | Not yet | Solid | Strong |
 * | --- | --- | --- | --- |
 * | **A clear position** | Describes the topic | States a view | States a specific view |
 * ```
 *
 * The header's first cell is empty (or anything: it is not read), the rest
 * of it names the levels; each row below names a row of the rubric in its
 * first cell and gives one descriptor per level. Bold, italics and links are
 * read as their words. Read with `marked`, the reader the week's Markdown
 * uses, so a table that pastes into a week pastes here.
 *
 * Nothing is cut short in silence: a cell over its cap is a problem with
 * its cap, and the rubric is not saved until it fits.
 */

/** The words of a line of inline tokens: marks dropped, a link read as its words. */
function wordsOf(tokens: readonly Token[] | undefined): string {
  let out = "";
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
      case "em":
      case "del":
      case "link":
        out += wordsOf((token as Tokens.Strong).tokens);
        break;
      case "codespan":
        out += (token as Tokens.Codespan).text;
        break;
      case "br":
        out += " ";
        break;
      case "text":
      case "escape":
        out += "tokens" in token && Array.isArray((token as Tokens.Text).tokens)
          ? wordsOf((token as Tokens.Text).tokens)
          : (token as Tokens.Text).text;
        break;
      default:
        out += "text" in token && typeof token.text === "string" ? token.text : "";
    }
  }
  return out;
}

/** A cell's words, entities read and spaces folded. Nothing is cut: the check names an overlong one. */
function cellWords(cell: Tokens.TableCell): string {
  return wordsOf(cell.tokens)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export type RubricRead =
  | { ok: true; rubric: CourseRubric; problems: string[] }
  | { ok: false; problems: string[] };

/**
 * A pasted or typed table, read as a rubric, with what stops it being saved.
 * The first table in the text is the one read; words around it are left
 * alone. `ok: false` when there is no table to read at all.
 */
export function readRubricMarkdown(text: string): RubricRead {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, problems: ["Paste the rubric's table, or type one: the levels across the top, a row for each thing."] };
  }
  if (text.length > RUBRIC_LIMITS.pasteChars) {
    return { ok: false, problems: [`That’s longer than a rubric can be (${RUBRIC_LIMITS.pasteChars} characters). Paste only its table.`] };
  }
  const table = marked.lexer(text).find((token): token is Tokens.Table => token.type === "table");
  if (!table) {
    return {
      ok: false,
      problems: ["We couldn’t find a table in that. A rubric is a table: a header row of levels, then a row for each thing, its name in the first cell."],
    };
  }
  const levels = table.header.slice(1).map(cellWords);
  const rows = table.rows.map((cells) => ({
    name: cells[0] ? cellWords(cells[0]) : "",
    descriptors: cells.slice(1, 1 + levels.length).map(cellWords),
  }));
  const rubric: CourseRubric = { levels, rows };
  return { ok: true, rubric, problems: rubricProblems(rubric) };
}

/** A cell's words written so a table reads them back as written. */
function cell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/([*_`[\]])/g, "\\$1");
}

/**
 * A rubric written as the guide's table, row names in bold, so reading it
 * back gives the same rubric. What the course's details show in the box
 * when a rubric is set, to be changed by typing.
 */
export function rubricToMarkdown(rubric: CourseRubric): string {
  const header = `|  | ${rubric.levels.map(cell).join(" | ")} |`;
  const rule = `| --- | ${rubric.levels.map(() => "---").join(" | ")} |`;
  const rows = rubric.rows.map((row) => `| **${cell(row.name)}** | ${row.descriptors.map(cell).join(" | ")} |`);
  return [header, rule, ...rows].join("\n");
}
