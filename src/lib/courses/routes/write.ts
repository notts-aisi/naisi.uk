import { escapeMarkdownText, proseToMarkdown, runsToMarkdown } from "@/lib/courses/weekBlocks/markdownWrite";
import type { ProseParagraph, Run, TableCell } from "@/lib/courses/weekBlocks/prose";
import type { CourseRoutes, RouteGroup } from "./model";
import { ROLLING, checkedOnWords, longDateWords } from "./words";

/**
 * A COURSE'S ROUTES AS MARKDOWN, in the guide's own shape ("Where to go next"
 * in Technical AI Safety's week 6), so the course editor's card shows what is
 * stored as text to copy, change and paste back:
 *
 *   Checked on 25 October 2026. Dates change, so check each route's own page.
 *
 *   **Part-time, alongside a degree**
 *
 *   | Route | What it is | Deadline | Next round |
 *   | --- | --- | --- | --- |
 *   | [SPAR](https://example.org/spar) | Three months, remote. | 1 December 2026 | Spring round |
 *
 *   **Funding:** words after the last table, as written.
 *
 * Each table has Route and What it is, then Who it suits, Deadline and Next
 * round only where one of its routes has one, so the guide's own tables copy
 * out as they were written. `readRoutesMarkdown` (`markdown.ts`) reads this
 * back as the same list: the format suite holds the round trip.
 *
 * Pure, so the card in the browser writes it.
 */

const cell = (runs: readonly Run[]): TableCell => ({ runs: [...runs] });
const words = (text: string): TableCell => ({ runs: text ? [{ text }] : [] });

/** One group's table, with the columns its routes use. */
function tableOf(group: RouteGroup): ProseParagraph {
  const withSuits = group.routes.some((route) => route.suits.length > 0);
  const withDeadline = group.routes.some((route) => route.rolling || route.deadline !== null);
  const withNext = group.routes.some((route) => route.nextRound.length > 0);
  const header: TableCell[] = [words("Route"), words("What it is")];
  if (withSuits) header.push(words("Who it suits"));
  if (withDeadline) header.push(words("Deadline"));
  if (withNext) header.push(words("Next round"));
  return {
    type: "table",
    header,
    rows: group.routes.map((route) => {
      const cells: TableCell[] = [cell([{ text: route.name, href: route.url }]), cell(route.what)];
      if (withSuits) cells.push(cell(route.suits));
      if (withDeadline) cells.push(words(route.rolling ? ROLLING : route.deadline ? longDateWords(route.deadline) : ""));
      if (withNext) cells.push(cell(route.nextRound));
      return { cells };
    }),
  };
}

/** The list as Markdown, ending in a new line. */
export function routesToMarkdown(routes: CourseRoutes): string {
  const blocks: string[] = [];
  const [first, ...rest] = routes.intro;
  const checked = checkedOnWords(routes.checkedOn);
  if (first && first.type === "p") {
    blocks.push(`${checked} ${runsToMarkdown(first.runs)}`);
    blocks.push(...proseToMarkdown(rest));
  } else {
    blocks.push(checked);
    blocks.push(...proseToMarkdown(routes.intro));
  }
  for (const group of routes.groups) {
    if (group.heading) blocks.push(`**${escapeMarkdownText(group.heading)}**`);
    blocks.push(...proseToMarkdown([tableOf(group)]));
  }
  blocks.push(...proseToMarkdown(routes.after));
  return `${blocks.join("\n\n")}\n`;
}
