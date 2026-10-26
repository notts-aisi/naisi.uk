import {
  SOURCE_KIND_LABEL,
  type CasesBlock,
  type ChecklistBlock,
  type ChooseOneBlock,
  type FillInBlock,
  type GivenBy,
  type GoFurtherItem,
  type PartBlock,
  type PartChild,
  type ReflectionBlock,
  type SourceFields,
  type TableBlock,
  type ThisWeekBlock,
  type TopBlock,
  type WeekBlock,
  type When,
  type WrittenAnswerBlock,
} from "./model";
import type { Prose, Run, TableCell } from "./prose";

/**
 * A WEEK WRITTEN OUT AS MARKDOWN ("Copy as Markdown"), in the fellow
 * guide's own shape with every id written in, so the week can be edited
 * and pasted back with its answers kept. `docs/course-weeks.md` is the
 * contract; `markdownRead.ts` reads this and the guide's export alike.
 *
 * THE ROUND TRIP. What this writes, read back, is the same blocks with the
 * same ids: `readPastedWeek(weekToMarkdown(week))` gives back `week`.
 * `tests/course-week-blocks-markdown.test.mjs` holds that for a week with
 * every kind of block in it. Two things make it hold:
 *
 *  - every id goes at the end of the line that opens its block or item
 *    (`{#src-k3j9x2ab4c}`), or on a line of its own just before a block that
 *    has no line of its own (plain text, a table, a checklist);
 *  - every character Markdown would read as markup is escaped, so a line of
 *    text reads back as the same text.
 *
 * Where the guide's export has no line for something the site keeps (who
 * gives packs out, the written answer's word range and due rule, a talk to
 * get ready for), this writes one: "**Choose one** · given out by your
 * facilitator", "**Written answer** · 250 to 350 words · due by the end of
 * the day before the session", "**Talk:** a 2-minute pitch".
 *
 * Pure. Nothing here reads a clock or a store.
 */

export type WriteOptions = {
  /**
   * The course's time for work due on the day before a session ("12:00"),
   * or null for the end of the day: the words a This week row and a written
   * answer use for `dayBefore`. A course setting, never typed here.
   */
  dayBeforeTime?: string | null;
};

/** "noon", "5pm", "9:30am" for a 24-hour "HH:MM"; null when it is not one. */
function clockWords(time: string): string | null {
  const found = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!found) return null;
  const hour = Number(found[1]);
  const minute = found[2];
  if (hour === 12 && minute === "00") return "noon";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute === "00" ? "" : `:${minute}`}${hour < 12 ? "am" : "pm"}`;
}

/** "by the end of the day before", "by noon the day before". */
export function dayBeforeWords(dayBeforeTime: string | null | undefined): string {
  const clock = dayBeforeTime ? clockWords(dayBeforeTime) : null;
  return clock ? `by ${clock} the day before` : "by the end of the day before";
}

/** What a This week row says for each `When`, in session `n`'s words. */
function whenWords(when: When, n: number, options: WriteOptions): string {
  if (when === "before") return `Before session ${n}`;
  if (when === "atSession") return `At session ${n}`;
  return `To your facilitator ${dayBeforeWords(options.dayBeforeTime)} session ${n}`;
}

/** A written answer's due words: "due by the end of the day before the session". */
function dueWords(when: When, options: WriteOptions): string {
  if (when === "before") return "due before the session";
  if (when === "atSession") return "due at the session";
  return `due ${dayBeforeWords(options.dayBeforeTime)} the session`;
}

/** How a Choose one or a talk says who gives it out. */
const GIVEN_WORDS: Record<GivenBy, string> = {
  fellow: "picked by each person",
  facilitator: "given out by your facilitator",
};

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/** Text with every character Markdown would read as markup escaped. */
export function escapeMarkdownText(text: string, inTable = false): string {
  let out = text
    .replace(/\\/g, "\\\\")
    .replace(/([*_`[\]<>~])/g, "\\$1")
    .replace(/\{#/g, "\\{#")
    .replace(/&(?=#?[A-Za-z0-9]+;)/g, "\\&");
  if (inTable) out = out.replace(/\|/g, "\\|");
  return out;
}

/** A line that would open a heading, a list, a quote, a rule or a table, made plain. */
function plainLineStart(text: string): string {
  return text
    .replace(/^(#{1,6})(?=\s|$)/, (hashes) => `\\${hashes}`)
    .replace(/^([-+])(?=\s|$)/, "\\$1")
    .replace(/^(-{3,}|={3,})/, "\\$1")
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2")
    .replace(/^\|/, "\\|");
}

/** An address as a link's destination: in angle brackets when it holds a bracket or a space. */
function destination(url: string): string {
  return /[()\s]/.test(url) ? `<${url}>` : url;
}

function markRun(run: Run, inTable: boolean): string {
  const text = escapeMarkdownText(run.text, inTable);
  if (run.bold && run.italic) return `***${text}***`;
  if (run.bold) return `**${text}**`;
  if (run.italic) return `*${text}*`;
  return text;
}

/** One line of runs as Markdown: neighbours with one link share its brackets. */
export function runsToMarkdown(runs: readonly Run[], inTable = false): string {
  let out = "";
  for (let i = 0; i < runs.length; ) {
    const href = runs[i].href;
    if (!href) {
      out += markRun(runs[i], inTable);
      i += 1;
      continue;
    }
    let inner = "";
    while (i < runs.length && runs[i].href === href) {
      inner += markRun(runs[i], inTable);
      i += 1;
    }
    out += `[${inner}](${destination(href)})`;
  }
  return plainLineStart(out);
}

/** Plain words as a line of Markdown. */
function plain(text: string, inTable = false): string {
  return plainLineStart(escapeMarkdownText(text, inTable));
}

/** An id, as the end of a line writes it. */
function idMark(id: string): string {
  return ` {#${id}}`;
}

/** "About 25 minutes" as a heading's bracket writes it: "(about 25 minutes)". */
function bracketTime(time: string): string {
  const first = time.charAt(0);
  const second = time.charAt(1);
  const lowered = /[A-Z]/.test(first) && !/[A-Z0-9]/.test(second) ? first.toLowerCase() + time.slice(1) : time;
  return ` (${escapeMarkdownText(lowered)})`;
}

/** A table as Markdown rows; `ids[r]` goes at the end of row r's cell in column `idColumn`. */
function tableLines(
  header: readonly TableCell[],
  rows: ReadonlyArray<{ cells: readonly TableCell[] }>,
  ids: readonly string[] = [],
  idColumn = 0,
): string {
  const line = (cells: string[]) => `| ${cells.map((cell) => cell || " ").join(" | ")} |`.replace(/ {2,}\|/g, " |");
  return [
    line(header.map((cell) => runsToMarkdown(cell.runs, true))),
    line(header.map(() => "---")),
    ...rows.map((row, r) =>
      line(row.cells.map((cell, c) => `${runsToMarkdown(cell.runs, true)}${c === idColumn && ids[r] ? idMark(ids[r]) : ""}`)),
    ),
  ].join("\n");
}

/**
 * How a list was written: its kind and its marker. Two lists of one kind
 * with only a blank line between them read back as ONE list, so a list that
 * follows another of its kind changes its marker ("-" to "*", "1." to "1)"),
 * which Markdown reads as a new list.
 */
type ListMark = "-" | "*" | "." | ")";

/** The marker for a list of `kind` written straight after `before`. */
function listMark(kind: "ul" | "ol", before: ListMark | null): ListMark {
  if (kind === "ul") return before === "-" ? "*" : "-";
  return before === "." ? ")" : ".";
}

/** Prose as Markdown, with the marker of the list it ends on (null when it ends on something else). */
function proseOut(prose: Prose, before: ListMark | null): { lines: string[]; last: ListMark | null } {
  const lines: string[] = [];
  let last = before;
  for (const paragraph of prose) {
    if (paragraph.type === "ul" || paragraph.type === "ol") {
      const mark = listMark(paragraph.type, last);
      lines.push(
        paragraph.items
          .map((item, i) => `${paragraph.type === "ul" ? mark : `${i + 1}${mark}`} ${runsToMarkdown(item.runs)}`)
          .join("\n"),
      );
      last = mark;
      continue;
    }
    lines.push(...proseToMarkdown([paragraph]));
    last = null;
  }
  return { lines, last };
}

/**
 * Writes prose arrays that sit one after another with nothing between them,
 * so a list at the end of one and a list at the start of the next stay two
 * lists. `list()` writes a list of the writer's own (links, items) in turn.
 */
function inTurn(): { prose: (prose: Prose) => string[]; list: (kind: "ul" | "ol", items: string[]) => string; mark: () => ListMark | null } {
  let last: ListMark | null = null;
  return {
    prose(prose) {
      if (prose.length === 0) return [];
      const out = proseOut(prose, last);
      last = out.last;
      return out.lines;
    },
    list(kind, items) {
      const mark = listMark(kind, last);
      last = mark;
      return items.map((item, i) => `${kind === "ul" ? mark : `${i + 1}${mark}`} ${item}`).join("\n");
    },
    mark: () => last,
  };
}

/** Prose as Markdown paragraphs, lists, tables and code, a blank line between each. */
export function proseToMarkdown(prose: Prose): string[] {
  const out: string[] = [];
  let last: ListMark | null = null;
  for (const paragraph of prose) {
    switch (paragraph.type) {
      case "p":
        out.push(runsToMarkdown(paragraph.runs));
        last = null;
        break;
      case "ul":
      case "ol": {
        const listed = proseOut([paragraph], last);
        out.push(...listed.lines);
        last = listed.last;
        break;
      }
      case "table":
        out.push(tableLines(paragraph.header, paragraph.rows));
        last = null;
        break;
      case "code": {
        last = null;
        // A fence longer than any run of backticks in the code, so it closes where it should.
        const longest = Math.max(2, ...(paragraph.text.match(/`+/g) ?? []).map((ticks) => ticks.length));
        const fence = "`".repeat(longest + 1);
        out.push(`${fence}${paragraph.lang}\n${paragraph.text}\n${fence}`);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// One block at a time
// ---------------------------------------------------------------------------

function thisWeek(block: ThisWeekBlock, n: number, options: WriteOptions): string[] {
  const cells = (items: string[]) => `| ${items.map((item) => item || " ").join(" | ")} |`.replace(/ {2,}\|/g, " |");
  const rows = block.rows.map((row) =>
    row.type === "task"
      ? cells([plain(row.what, true), plain(row.time, true), plain(row.whenText || whenWords(row.when, n, options), true)])
      : cells([plain(row.what, true), plain(row.time, true), plain(row.note, true)]),
  );
  const total = block.total ? [cells(["**In all**", `**${escapeMarkdownText(block.total, true)}**`, ""])] : [];
  return [`## This week${idMark(block.id)}`, ["| Do this | Time | When |", "| --- | --- | --- |", ...rows, ...total].join("\n"), ...proseToMarkdown(block.note)];
}

/**
 * A source line, as the guide writes one: "**Read:** [Title](https://...),
 * Ada Example, 2024. 22 minutes. A note." (and "**Read:** METR's time
 * horizons. Start with ..." for a source with no link of its own).
 */
function sourceLine(source: Omit<SourceFields, "note"> & { note: readonly Run[] }): string {
  const kind = `**${SOURCE_KIND_LABEL[source.kind]}:**`;
  const note = source.note.length > 0 ? ` ${runsToMarkdown(source.note)}` : "";
  // With no link of its own, words before the title are the kind's own ("**Listen, after the session:**").
  if (!source.url) {
    const label = source.lead ? `**${SOURCE_KIND_LABEL[source.kind]}, ${escapeMarkdownText(source.lead)}:**` : kind;
    return `${label} ${escapeMarkdownText(source.title)}.${note}`;
  }
  const lead = source.lead ? `${escapeMarkdownText(source.lead)} ` : "";
  const who = [source.by, source.date].filter(Boolean).map((part) => escapeMarkdownText(part)).join(", ");
  const time = source.time ? ` ${escapeMarkdownText(source.time)}.` : "";
  const compute = source.compute ? ` ${escapeMarkdownText(source.compute)}.` : "";
  return `${kind} ${lead}[${escapeMarkdownText(source.title)}](${destination(source.url)})${who ? `, ${who}` : ""}.${time}${compute}${note}`;
}

function reflection(block: ReflectionBlock): string[] {
  return [`**Reflect**${idMark(block.id)}`, block.prompts.map((prompt) => `- ${plain(prompt.text)}${idMark(prompt.id)}`).join("\n")];
}

/** A Choose one written as a table: its line, its questions, then a row per pack. */
function chooseOneTable(block: ChooseOneBlock): string[] {
  const head = `**Choose one** · ${GIVEN_WORDS[block.givenBy]}${block.time ? ` · ${escapeMarkdownText(block.time)}` : ""}${idMark(block.id)}`;
  const withNote = block.noteHeading !== "";
  const header: TableCell[] = [
    { runs: [{ text: block.title || "Pack" }] },
    ...(withNote ? [{ runs: [{ text: block.noteHeading }] }] : []),
    { runs: [{ text: "Read" }] },
    { runs: [{ text: "Time" }] },
  ];
  const rows = block.packs.map((pack) => ({
    cells: [{ runs: [{ text: pack.name }] }, ...(withNote ? [{ runs: pack.note }] : []), { runs: pack.read }, { runs: pack.time ? [{ text: pack.time }] : [] }],
  }));
  return [head, ...proseToMarkdown(block.questions), tableLines(header, rows, block.packs.map((pack) => pack.id), 0)];
}

/** A Choose one written as a list item: "**Read:** one career review that fits you, 15 to 35 minutes:" and its options. */
function chooseOneItem(block: ChooseOneBlock, marker: string): string {
  const pad = " ".repeat(marker.length);
  const head = `${marker}**${SOURCE_KIND_LABEL[block.kind]}:** ${escapeMarkdownText(block.title)}${block.time ? `, ${escapeMarkdownText(block.time)}` : ""}:${idMark(block.id)}`;
  const options = block.packs.map((pack) => `${pad}- ${runsToMarkdown(pack.read)}${pack.note.length > 0 ? `, ${runsToMarkdown(pack.note)}` : ""}${idMark(pack.id)}`);
  return [head, ...options].join("\n");
}

function table(block: TableBlock): string[] {
  return [`{#${block.id}}`, tableLines(block.header, block.rows)];
}

function writtenAnswer(block: WrittenAnswerBlock, options: WriteOptions): string[] {
  const head = [
    "**Written answer**",
    ...(block.words ? [`${block.words.min} to ${block.words.max} words`] : []),
    dueWords(block.due, options),
  ].join(" · ");
  const turn = inTurn();
  const prompt = turn.prose(block.prompt);
  const boxes = block.boxes.length > 0
    ? [turn.list("ol", block.boxes.map((box) => `**${escapeMarkdownText(box.label)}:**${box.hint ? ` ${escapeMarkdownText(box.hint)}` : ""}${idMark(box.id)}`))]
    : [];
  return [`${head}${idMark(block.id)}`, ...prompt, ...boxes, ...turn.prose(block.guidance)];
}

function talkLine(block: CasesBlock, withId: boolean): string {
  const talk = block.talk ? `a ${block.talk.minutes}-minute ${escapeMarkdownText(block.talk.name)}` : "none";
  return `**Talk:** ${talk} · ${GIVEN_WORDS[block.givenBy]}${withId ? idMark(block.id) : ""}`;
}

/** The cases as one table: a group column when they have groups, Case, What happened and the start column. */
function caseTable(block: CasesBlock): string[] {
  if (block.groups.length === 0) return [];
  const grouped = block.groupLabel !== "" || block.groups.some((group) => group.name !== "");
  const header: TableCell[] = [
    ...(grouped ? [{ runs: [{ text: block.groupLabel || "Group" }] }] : []),
    { runs: [{ text: "Case" }] },
    { runs: [{ text: "What happened" }] },
    { runs: [{ text: block.startLabel || "Start here" }] },
  ];
  const rows: Array<{ cells: TableCell[] }> = [];
  const ids: string[] = [];
  for (const group of block.groups) {
    for (const item of group.cases) {
      const what: Run[] = item.contentNote ? [...item.what, { text: ` Content note: ${item.contentNote}` }] : item.what;
      rows.push({ cells: [...(grouped ? [{ runs: [{ text: group.name }] }] : []), { runs: [{ text: item.title }] }, { runs: what }, { runs: item.start }] });
      ids.push(item.id);
    }
  }
  // Each case's id goes in its Case column: after the group column when there is one.
  return [tableLines(header, rows, ids, grouped ? 1 : 0)];
}

function cases(block: CasesBlock, inPart: boolean): string[] {
  const head = inPart ? [talkLine(block, true)] : [`## ${plain(block.heading || "Your case study")}${idMark(block.id)}`, talkLine(block, false)];
  const turn = inTurn();
  const before = [...turn.prose(block.intro), ...turn.prose(block.prepare)];
  const table = caseTable(block);
  const after = table.length > 0 ? proseToMarkdown(block.note) : turn.prose(block.note);
  return [...head, ...before, ...table, ...after];
}

function fillIn(block: FillInBlock): string[] {
  const groups = block.groups.map((group, i) => {
    const number = `${i + 1}. `;
    const single = group.boxes.length === 1 && group.boxes[0].label === "";
    if (single) return `${number}${plain(group.heading)}${idMark(group.boxes[0].id)}`;
    const pad = " ".repeat(number.length);
    return [`${number}${plain(group.heading)}`, ...group.boxes.map((box) => `${pad}- ${plain(box.label)}${idMark(box.id)}`)].join("\n");
  });
  return [`**Fill in${block.title ? `: ${escapeMarkdownText(block.title)}` : ""}**${idMark(block.id)}`, groups.join("\n")];
}

function checklist(block: ChecklistBlock): string[] {
  const items = block.items.map((item) => `- [ ] ${plain(item.title)}${idMark(item.id)}${item.detail ? `\n  ${plain(item.detail)}` : ""}`);
  return [`**Checklist**${idMark(block.id)}`, items.join("\n")];
}

function goFurtherItem(item: GoFurtherItem): string {
  if (!item.title) return `**${SOURCE_KIND_LABEL[item.kind]}:** ${runsToMarkdown(item.why)}`;
  return sourceLine({ ...item, note: item.why });
}

function partChildren(blocks: readonly PartChild[], options: WriteOptions, before: ListMark | null = null): string[] {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const isListed = (child: PartChild | undefined) => child?.type === "source" || (child?.type === "chooseOne" && child.form === "list");
    if (isListed(block)) {
      // Neighbouring sources (and a list of options to choose from) are one numbered list, as the guide writes them.
      const items: string[] = [];
      // Straight after a numbered list in the part's framing, a new marker keeps the two apart.
      const mark = i === 0 ? listMark("ol", before) : ".";
      let n = 1;
      for (; isListed(blocks[i]); i += 1) {
        const child = blocks[i];
        const marker = `${n}${mark} `;
        if (child.type === "source") items.push(`${marker}${sourceLine(child)}${idMark(child.id)}`);
        else if (child.type === "chooseOne") items.push(chooseOneItem(child, marker));
        n += 1;
      }
      i -= 1;
      out.push(items.join("\n"));
      continue;
    }
    switch (block.type) {
      case "text":
        out.push(block.heading ? `#### ${plain(block.heading)}${idMark(block.id)}` : `{#${block.id}}`, ...proseToMarkdown(block.body));
        break;
      case "reflection":
        out.push(...reflection(block));
        break;
      case "chooseOne":
        out.push(...chooseOneTable(block));
        break;
      case "table":
        out.push(...table(block));
        break;
      case "writtenAnswer":
        out.push(...writtenAnswer(block, options));
        break;
      case "cases":
        out.push(...cases(block, true));
        break;
      case "fillIn":
        out.push(...fillIn(block));
        break;
      case "checklist":
        out.push(...checklist(block));
        break;
      default:
        break;
    }
  }
  return out;
}

function part(block: PartBlock, number: number, options: WriteOptions): string[] {
  const framing = proseOut(block.framing, null);
  return [
    `### Part ${number}: ${plain(block.title)}${block.time ? bracketTime(block.time) : ""}${idMark(block.id)}`,
    ...framing.lines,
    ...partChildren(block.blocks, options, framing.last),
  ];
}

function topBlock(block: TopBlock, partNumber: number, underWhy: boolean, weekNumber: number, options: WriteOptions): string[] {
  switch (block.type) {
    case "thisWeek":
      return thisWeek(block, weekNumber, options);
    case "text": {
      if (block.role === "plain") return [`{#${block.id}}`, ...proseToMarkdown(block.body)];
      const heading = block.heading || (block.role === "why" ? "Why this week" : block.role === "before" ? "Before the session" : "");
      const time = block.role === "before" && block.time ? bracketTime(block.time) : "";
      return [`## ${plain(heading)}${time}${idMark(block.id)}`, ...proseToMarkdown(block.body)];
    }
    case "outcomes": {
      const items = block.items.map((item) => `- ${plain(item)}`).join("\n");
      // Straight after Why this week it is the guide's "After this week you can:" line; anywhere else, a heading.
      return underWhy
        ? [`${plain(block.heading || "After this week you can")}:${idMark(block.id)}`, items]
        : [`### ${plain(block.heading || "After this week you can")}${idMark(block.id)}`, items];
    }
    case "contentNote": {
      const turn = inTurn();
      return [
        `## Content note${idMark(block.id)}`,
        ...turn.prose(block.body),
        ...(block.links.length > 0
          ? [turn.list("ul", block.links.map((link) => `[${escapeMarkdownText(link.label)}](${destination(link.url)})${link.detail ? `: ${escapeMarkdownText(link.detail)}` : ""}`))]
          : []),
      ];
    }
    case "part":
      return part(block, partNumber, options);
    case "cases":
      return cases(block, false);
    case "inTheSession": {
      const turn = inTurn();
      return [`## In the session${idMark(block.id)}`, ...turn.prose(block.body), ...turn.prose(block.beforeYouCome)];
    }
    case "goFurther": {
      const turn = inTurn();
      return [`## ${plain(block.heading || "Go further (optional)")}${idMark(block.id)}`, ...turn.prose(block.intro), turn.list("ul", block.items.map(goFurtherItem))];
    }
    case "handsOn":
      return [`## ${plain(block.heading || "Hands-on route (optional, for coders)")}${idMark(block.id)}`, ...proseToMarkdown(block.body)];
  }
}

/**
 * The week as Markdown: its title line, then each block in order, a blank
 * line between each. Ends with a newline.
 */
export function weekToMarkdown(
  week: { weekNumber: number; title: string; blocks: readonly WeekBlock[] },
  options: WriteOptions = {},
): string {
  const lines: string[] = [`# Week ${week.weekNumber}: ${plain(week.title)}`];
  let partNumber = 0;
  week.blocks.forEach((block, i) => {
    if (block.type === "part") partNumber += 1;
    // The outcomes are the guide's line under Why this week when they follow it.
    const previous = week.blocks[i - 1];
    const underWhy = block.type === "outcomes" && previous?.type === "text" && previous.role === "why";
    lines.push(...topBlock(block as TopBlock, partNumber, underWhy, week.weekNumber, options));
  });
  return `${lines.filter((text) => text !== "").join("\n\n")}\n`;
}
