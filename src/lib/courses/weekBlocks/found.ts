import {
  partsOf,
  type ChooseOneBlock,
  type PartBlock,
  type WeekBlock,
} from "./model";
import { proseLinks, proseText, runsLinks, type Prose } from "./prose";

/**
 * WHAT A PASTED WEEK WAS READ AS, AND WHAT TO CHECK (board pr-weeks,
 * Option B: "What we found in week 3" and "5 things to check"), in the
 * board's words.
 *
 * Pure: the loader's route asks this of a paste it has read and settled the
 * ids of, and hands the rows and sentences to the page.
 */

export type FoundState = "found" | "missing" | "check";

/** One row of "What we found": a tick, "Not in the Markdown", or a warning to look at it. */
export type FoundRow = {
  state: FoundState;
  label: string;
  detail: string;
  /** A part, drawn under Before the session. */
  indent: boolean;
};

/**
 * Sites that refuse automatic link checkers though their pages open in a
 * browser (board pr-weeks: "7 of 45 links can’t be checked automatically
 * (openai.com, weforum.org). They work in a browser."). A link on one of
 * these, or on any address under one, is named so the lead opens it by hand.
 */
export const LINK_CHECKER_BLOCKED_HOSTS = ["openai.com", "weforum.org"] as const;

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 paragraph", "2 paragraphs, 1 list, 2 tables": what a prose field holds. */
function paragraphs(prose: Prose): string {
  const count = (type: Prose[number]["type"]) => prose.filter((p) => p.type === type).length;
  const lists = count("ul") + count("ol");
  const parts = [
    ...(count("p") > 0 || prose.length === 0 ? [plural(count("p"), "paragraph")] : []),
    ...(lists > 0 ? [plural(lists, "list")] : []),
    ...(count("table") > 0 ? [plural(count("table"), "table")] : []),
    ...(count("code") > 0 ? [plural(count("code"), "block of code", "blocks of code")] : []),
  ];
  return parts.join(", ");
}

/**
 * The words a Choose one's packs go by: "pathway packs" from a table headed
 * "Pathway", "plans" from "Plan", "packs" from "Pack" or a header that is not
 * one word, "options" for a list.
 */
function packNoun(block: ChooseOneBlock): string {
  if (block.form === "list") return "options";
  const title = block.title.trim().toLowerCase();
  if (!title || !/^[a-z]+$/.test(title) || title === "pack" || title === "packs") return "packs";
  if (title === "plan") return "plans";
  return title.endsWith("s") ? title : `${title} packs`;
}

/** Did this part's packs come from a table that gives one time a pack, over packs of several sources? */
function packsWithOneTime(part: PartBlock, fromTable: boolean): boolean {
  if (!fromTable) return false;
  return part.blocks.some(
    (block) =>
      block.type === "chooseOne" &&
      block.packs.every((pack) => pack.time !== "") &&
      block.packs.some((pack) => runsLinks(pack.read).length > 1),
  );
}

function partDetail(part: PartBlock, fromTable: boolean): string {
  const answer = part.blocks.find((block) => block.type === "writtenAnswer");
  if (answer && answer.type === "writtenAnswer") {
    if (answer.boxes.length > 0) return `The written answer, in ${plural(answer.boxes.length, "box", "boxes")}`;
    return answer.words ? `The written answer, ${answer.words.min} to ${answer.words.max} words` : "The written answer";
  }
  const count = (type: WeekBlock["type"]) => part.blocks.filter((block) => block.type === type).length;
  const contents: string[] = [];
  if (count("source") > 0) contents.push(plural(count("source"), "source"));
  if (count("reflection") > 0) contents.push(plural(count("reflection"), "reflection stop"));
  for (const block of part.blocks) {
    if (block.type === "chooseOne") contents.push(`choose one of ${block.packs.length} ${packNoun(block)}${fromTable ? ", from its table" : ""}`);
    if (block.type === "checklist") contents.push(plural(block.items.length, "step") + " to tick");
    if (block.type === "fillIn") contents.push(plural(block.groups.reduce((n, group) => n + group.boxes.length, 0), "box", "boxes") + " to fill in");
    if (block.type === "table") contents.push("a table");
    if (block.type === "cases" && block.talk) contents.push(`a ${block.talk.minutes}-minute ${block.talk.name}`);
  }
  return [part.time, contents.join(", ")].filter(Boolean).join(" · ");
}

/**
 * The rows of "What we found", in the board's order: the title, This week,
 * Why this week, After this week you can, the content note, Before the
 * session and each part under it, the case study, In the session, Go
 * further, then any section of the guide's own.
 */
export function foundRows(
  week: { title: string; weekNumber: number; blocks: readonly WeekBlock[] },
  packTables: readonly number[],
): FoundRow[] {
  const { blocks } = week;
  const rows: FoundRow[] = [];
  const row = (state: FoundState, label: string, detail: string, indent = false) => rows.push({ state, label, detail, indent });
  const missing = (label: string) => row("missing", label, "Not in the Markdown");

  if (week.title) row("found", "Title", `Week ${week.weekNumber}: ${week.title}`);
  else missing("Title");

  const thisWeek = blocks.find((block) => block.type === "thisWeek");
  if (thisWeek?.type === "thisWeek") {
    const tasks = thisWeek.rows.filter((r) => r.type === "task").length;
    const optional = thisWeek.rows.filter((r) => r.type === "optional").length;
    row(
      "found",
      "This week",
      [plural(tasks, "task"), ...(thisWeek.total ? [`In all: ${thisWeek.total}`] : []), ...(optional > 0 ? [`${optional} optional, not counted`] : [])].join(" · "),
    );
  } else missing("This week");

  const why = blocks.find((block) => block.type === "text" && block.role === "why");
  if (why?.type === "text") row("found", "Why this week", paragraphs(why.body));
  else missing("Why this week");

  const outcomes = blocks.find((block) => block.type === "outcomes");
  if (outcomes?.type === "outcomes") row("found", outcomes.heading || "After this week you can", plural(outcomes.items.length, "outcome"));
  else missing("After this week you can");

  const note = blocks.find((block) => block.type === "contentNote");
  if (note?.type === "contentNote") row("found", "Content note", `With ${plural(note.links.length, "support link")}`);
  else missing("Content note");

  const parts = partsOf(blocks);
  const before = blocks.find((block) => block.type === "text" && block.role === "before");
  if (parts.length > 0 || before) {
    const time = before?.type === "text" ? before.time : "";
    row(parts.length > 0 ? "found" : "check", "Before the session", [plural(parts.length, "part"), ...(time ? [time] : [])].join(" · "));
  } else missing("Before the session");
  parts.forEach((part, i) => {
    const number = i + 1;
    const fromTable = packTables.includes(number);
    row(packsWithOneTime(part, fromTable) ? "check" : "found", `Part ${number}: ${part.title}`, partDetail(part, fromTable), true);
  });

  for (const block of blocks) {
    if (block.type !== "cases") continue;
    const cases = block.groups.reduce((n, group) => n + group.cases.length, 0);
    const grouped = block.groups.length > 1 || block.groups.some((group) => group.name !== "");
    const detail = cases > 0
      ? grouped ? `${plural(cases, "case")} in ${plural(block.groups.length, "group")}` : plural(cases, "case")
      : block.talk ? `A ${block.talk.minutes}-minute ${block.talk.name}` : "";
    row("found", block.heading || "Your case study", detail);
  }

  const session = blocks.find((block) => block.type === "inTheSession");
  if (session?.type === "inTheSession") {
    row("found", "In the session", [paragraphs(session.body), ...(session.beforeYouCome.length > 0 ? ["and Before you come"] : [])].join(", "));
  } else missing("In the session");

  const further = blocks.find((block) => block.type === "goFurther");
  if (further?.type === "goFurther") row("found", "Go further", plural(further.items.length, "source"));
  else missing("Go further");

  for (const block of blocks) {
    if (block.type !== "handsOn") continue;
    const code = block.body.filter((p) => p.type === "code").length;
    const links = proseLinks(block.body).length;
    const holds = [...(links > 0 ? [plural(links, "link")] : []), ...(code > 0 ? [plural(code, "block of code", "blocks of code")] : [])];
    row("found", block.heading || "Hands-on route", [holds.length > 0 ? holds.join(", ") : paragraphs(block.body), "optional, not counted"].join(" · "));
  }

  for (const block of blocks) {
    if (block.type === "text" && block.role === "section") row("found", block.heading, paragraphs(block.body));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Things to check
// ---------------------------------------------------------------------------

/** Every link in a week, in page order, one per place it appears. */
export function weekLinks(blocks: readonly WeekBlock[]): string[] {
  const out: string[] = [];
  const prose = (value: Prose) => out.push(...proseLinks(value));
  const visit = (block: WeekBlock) => {
    switch (block.type) {
      case "thisWeek":
        prose(block.note);
        break;
      case "text":
        prose(block.body);
        break;
      case "contentNote":
        prose(block.body);
        out.push(...block.links.map((link) => link.url));
        break;
      case "part":
        prose(block.framing);
        block.blocks.forEach(visit);
        break;
      case "source":
        out.push(...(block.url ? [block.url] : []), ...runsLinks(block.note));
        break;
      case "chooseOne":
        prose(block.questions);
        for (const pack of block.packs) out.push(...runsLinks(pack.note), ...runsLinks(pack.read));
        break;
      case "table":
        for (const cell of [...block.header, ...block.rows.flatMap((row) => row.cells)]) out.push(...runsLinks(cell.runs));
        break;
      case "writtenAnswer":
        prose(block.prompt);
        prose(block.guidance);
        break;
      case "cases":
        prose(block.intro);
        prose(block.prepare);
        prose(block.note);
        for (const group of block.groups) for (const item of group.cases) out.push(...runsLinks(item.what), ...runsLinks(item.start));
        break;
      case "inTheSession":
        prose(block.body);
        prose(block.beforeYouCome);
        break;
      case "handsOn":
        prose(block.body);
        break;
      case "goFurther":
        prose(block.intro);
        for (const item of block.items) out.push(...(item.url ? [item.url] : []), ...runsLinks(item.why));
        break;
      default:
        break;
    }
  };
  blocks.forEach(visit);
  return out;
}

/** The host a link checker cannot read, if this address is on one. */
function blockedHost(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return LINK_CHECKER_BLOCKED_HOSTS.find((blocked) => host === blocked || host.endsWith(`.${blocked}`)) ?? null;
}

/** "It’s the heaviest week of the course", from the sentence of Why this week that says so. */
function heavyClause(why: Prose): string | null {
  for (const sentence of proseText(why).split(/(?<=[.!?])\s+/)) {
    if (!/\bheav(?:y|ier|iest)\b/i.test(sentence)) continue;
    return sentence.split(/[:;]/)[0].replace(/[.!?,\s]+$/, "").trim();
  }
  return null;
}

/**
 * The guide's lines the site words differently (HANDOFF's guide edits): the
 * written answer called "the week's one exercise", and "the Start here tab".
 * A week's paste and a guide page's paste both ask this, in these words.
 */
export function guideWordsToCheck(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  // The guide's own words for its written answer, not every "exercise" (a hands-on route's "Exercises" are ARENA's).
  const exercise = lines.filter((text) => /\b(?:one|the week[\u2019']s) exercise\b/i.test(text)).length;
  const tab = lines.filter((text) => /\bStart here tab\b|\bunder this tab\b/i.test(text)).length;
  const exerciseWords = `${exercise} ${exercise === 1 ? "line calls" : "lines call"} the written answer “the week’s one exercise”`;
  const tabWords = `${tab} ${tab === 1 ? "points" : "point"} to “the Start here tab”`;
  if (exercise > 0 && tab > 0) return [`${exerciseWords}, and ${tabWords}. Change them in the guide?`];
  if (exercise > 0) return [`${exerciseWords}. Change ${exercise === 1 ? "it" : "them"} in the guide?`];
  if (tab > 0) return [`${tab} ${tab === 1 ? "line points" : "lines point"} to “the Start here tab”. Change ${tab === 1 ? "it" : "them"} in the guide?`];
  return [];
}

/** The host a link checker cannot read, if this address is on one (`LINK_CHECKER_BLOCKED_HOSTS`). */
export function linkCheckerBlockedHost(url: string): string | null {
  return blockedHost(url);
}

/**
 * The things to check, in the board's words and order: packs with one time
 * each, links a checker cannot read, no In the session, a heavy week with no
 * content note, and the guide's "exercise" and "Start here tab" lines. Then
 * a task this week that names nothing it covers, and anything left out.
 */
export function thingsToCheck(input: {
  markdown: string;
  blocks: readonly WeekBlock[];
  packTables: readonly number[];
  leftOut: readonly string[];
}): string[] {
  const { blocks } = input;
  const out: string[] = [];

  partsOf(blocks).forEach((part, i) => {
    if (packsWithOneTime(part, input.packTables.includes(i + 1))) out.push(`Part ${i + 1}’s packs give one time each, not one per source.`);
  });

  const links = weekLinks(blocks);
  const blocked = links.map(blockedHost).filter((host): host is string => host !== null);
  if (blocked.length > 0) {
    out.push(`${blocked.length} of ${links.length} links can’t be checked automatically (${[...new Set(blocked)].join(", ")}). They work in a browser.`);
  }

  if (!blocks.some((block) => block.type === "inTheSession")) out.push("No “In the session” section: add one or leave it out.");

  const why = blocks.find((block) => block.type === "text" && block.role === "why");
  const heavy = why?.type === "text" ? heavyClause(why.body) : null;
  if (heavy && !blocks.some((block) => block.type === "contentNote")) {
    out.push(`“${heavy}”, says Why this week, but there’s no content note: add one with support links.`);
  }

  out.push(...guideWordsToCheck(input.markdown));

  for (const block of blocks) {
    if (block.type !== "thisWeek") continue;
    for (const row of block.rows) {
      if (row.type === "task" && row.covers.length === 0) {
        out.push(`This week’s “${row.what}” doesn’t name what it covers: write “Part 2”, “Parts 1 to 3”, “your case study” or “the written answer” in it.`);
      }
    }
  }
  out.push(...input.leftOut);
  return out;
}
