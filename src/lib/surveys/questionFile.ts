import { toCSV } from "@/lib/csv";
import type { ResultRow } from "./adminView";
import { chartGroupsOf } from "./charts";

/**
 * "DOWNLOAD THIS QUESTION": one question's totals as a
 * spreadsheet, built from the very result its chart is drawn from, so the
 * two can never say different things. Its bars (each answer's count and
 * share of the people who answered it), a block per line of a grid or for
 * "which mattered most", and a comments question's comments, by their words.
 *
 * It names nobody: a result holds no name, account id or address, so the file
 * cannot. So it is not a download the site records (`dataExports` is for files
 * of named people, the five the privacy policy lists), as This term in numbers'
 * file of totals is not.
 *
 * Every cell goes through `toCSV`, which stops a comment being read as a
 * formula when the file is opened.
 *
 * Pure.
 */
export function questionTotalsCsv(surveyName: string, result: ResultRow, counted: { who: string; answers: number }): string {
  const head = toCSV(
    ["Survey", "Question", "Counted", "Answers counted"],
    [[surveyName, `${result.number}. ${result.title}`, counted.who, counted.answers]],
  );
  const blocks = [head];
  if (result.kind === "comments") {
    blocks.push(toCSV(["Comment"], result.comments.map((comment) => [comment])));
  } else {
    for (const group of chartGroupsOf(result)) {
      const rows = group.bars.map((bar) => [bar.label, bar.count, `${bar.percent}%`]);
      blocks.push(toCSV([group.heading ? `${group.heading}: answer` : "Answer", `Count, of ${group.of}`, "Share"], rows));
    }
  }
  return `${blocks.join("\n\n")}\n`;
}
