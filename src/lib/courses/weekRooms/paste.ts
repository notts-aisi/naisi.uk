import { couldBeFollowed } from "../followable";
import { roomAsStored } from "../sessionChange/room";
import { GROUP_ROOM_LIMIT } from "./limits";

/**
 * THE PASTE BOX: two columns copied from a spreadsheet, group then room, for
 * the week shown, matched to that week's rows. PURE, and runs in the browser:
 * it changes nothing, and what it matches is put into the rows' fields, which
 * are saved through the same writer as a room typed into one.
 *
 * MATCHED LOOSELY, AND NEVER GUESSED. A line's group is matched in any case
 * and spacing, with or without its programme in front: the programme's short
 * name, its first word or its initials ("AGI", "TAIS", "Governance"), then
 * the group's name or the letter after "Group" ("AGI A", "tais group b",
 * "Group E"). A programme with one group may be named alone. A line that fits
 * one group is matched; one that fits two or more is asked about; one that
 * fits none is asked about too, with a suggestion when its last word is one
 * group's letter ("Grp K") and nothing in front of it names another
 * programme. Only the rows handed in are candidates: the programmes the
 * reader may see, as the page shows them that week (or one of them).
 *
 * A ROOM is the text after the group, trimmed, held to the room field's limit
 * and refused when it holds a link or runs over more than one line (a quoted
 * cell a spreadsheet copies with its line breaks), as the writer refuses one.
 * An empty room, "TBC", "to be confirmed" or "-" is no room: the week's room
 * is taken off and reads To be confirmed. A third column is ignored, and the
 * line says so.
 */

/** A row of the week as the paste box matches it. */
export type PasteCandidate = {
  key: string;
  programmeName: string;
  groupName: string;
  /** That week's room now, "" for none. */
  room: string;
  /** Why the row's room is not changed here ("Met"), or null when it is. */
  notHere: string | null;
};

export type LineMatch =
  | { kind: "matched"; key: string }
  | { kind: "suggest"; key: string }
  | { kind: "ambiguous"; keys: string[] }
  | { kind: "none" };

export type PastedLine = {
  /** 1 for the first line pasted. */
  number: number;
  /** The group as pasted. */
  group: string;
  /** The room as pasted, trimmed. */
  room: string;
  match: LineMatch;
  /** A column after the room held something, and was ignored. */
  ignored: boolean;
};

/** Words of a name, for matching: lower case, letters and digits only. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const JOINERS = new Set(["and", "of", "the", "in", "for", "on"]);

/**
 * What a programme may be called on a line: its short name, its first word,
 * and its initials, with a word already written in capitals kept whole
 * ("Technical AI Safety" is "TAIS") as well as letter by letter ("TAS").
 */
export function programmeAliases(programmeName: string): string[][] {
  const words = wordsOf(programmeName);
  if (words.length === 0) return [];
  const aliases = [words, [words[0]]];
  const raw = programmeName.split(/[^A-Za-z0-9]+/).filter((word) => word && !JOINERS.has(word.toLowerCase()));
  const letters = raw.map((word) => word[0].toLowerCase()).join("");
  const kept = raw.map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word.toLowerCase() : word[0].toLowerCase())).join("");
  for (const initials of new Set([kept, letters])) {
    if (initials.length >= 2 && !aliases.some((alias) => alias.length === 1 && alias[0] === initials)) aliases.push([initials]);
  }
  return aliases;
}

/** What a group may be called: its name, and the letter or word after "Group". */
export function groupAliases(groupName: string): string[][] {
  const words = wordsOf(groupName);
  if (words.length === 0) return [];
  const aliases = [words];
  if (words[0] === "group" && words.length === 2) aliases.push([words[1]]);
  return aliases;
}

const same = (a: readonly string[], b: readonly string[]) => a.join("") === b.join("");

function startsWith(words: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= words.length && prefix.every((word, i) => words[i] === word);
}

/** Every candidate a group's text names exactly. */
function exactKeys(text: string, candidates: readonly PasteCandidate[]): string[] {
  const words = wordsOf(text);
  if (words.length === 0) return [];
  const keys = new Set<string>();
  const byProgramme = new Map<string, PasteCandidate[]>();
  for (const candidate of candidates) {
    const list = byProgramme.get(candidate.programmeName) ?? [];
    list.push(candidate);
    byProgramme.set(candidate.programmeName, list);
  }
  for (const [programmeName, list] of byProgramme) {
    for (const alias of programmeAliases(programmeName)) {
      if (!startsWith(words, alias)) continue;
      const rest = words.slice(alias.length);
      // A programme with one group that week, named alone.
      if (rest.length === 0 && list.length === 1) keys.add(list[0].key);
      for (const candidate of list) {
        if (rest.length > 0 && groupAliases(candidate.groupName).some((each) => same(each, rest))) keys.add(candidate.key);
      }
    }
  }
  // The group alone, with no programme in front.
  for (const candidate of candidates) {
    if (groupAliases(candidate.groupName).some((each) => same(each, words))) keys.add(candidate.key);
  }
  return [...keys];
}

/** Words that say "group" before its letter, and name no programme. */
const GROUP_WORDS = new Set(["group", "grp", "gp", "g"]);

/** A line's group, matched to the candidates. */
export function matchGroup(text: string, candidates: readonly PasteCandidate[]): LineMatch {
  const exact = exactKeys(text, candidates);
  if (exact.length === 1) return { kind: "matched", key: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", keys: exact };
  // Nothing exact: the last word may be one group's letter ("Grp K").
  const words = wordsOf(text);
  const last = words[words.length - 1];
  if (!last) return { kind: "none" };
  const byLetter = candidates.filter((candidate) => {
    const aliases = groupAliases(candidate.groupName);
    return aliases.length > 1 && same(aliases[1], [last]);
  });
  // Narrowed by a programme named in front, when one is. Words in front that
  // name no programme here are another programme's: no suggestion crosses to
  // this one's group of the same letter.
  const front = words.slice(0, -1).filter((word) => !GROUP_WORDS.has(word));
  const named = byLetter.filter((candidate) => programmeAliases(candidate.programmeName).some((alias) => startsWith(words, alias)));
  const pool = front.length === 0 ? byLetter : named;
  if (pool.length === 1) return { kind: "suggest", key: pool[0].key };
  if (pool.length > 1) return { kind: "ambiguous", keys: pool.map((candidate) => candidate.key) };
  return { kind: "none" };
}

/**
 * One line split into group and room: at its first tab (a spreadsheet's
 * columns), else at a run of two or more spaces, else at the first place the
 * words before it name a group, else before the last word that is one
 * group's letter, else all of it as the group with no room.
 */
export function splitLine(line: string, candidates: readonly PasteCandidate[]): { group: string; room: string; ignored: boolean } {
  if (line.includes("\t")) return splitCells(line.split("\t"));
  return { ...splitWords(line, candidates), ignored: false };
}

/** A line already in a spreadsheet's columns: the group, the room (its first column that holds anything), and any column after it. */
function splitCells(cells: readonly string[]): { group: string; room: string; ignored: boolean } {
  const [group = "", ...rest] = cells;
  const at = rest.findIndex((cell) => cell.trim() !== "");
  const room = at < 0 ? "" : rest[at];
  const ignored = at >= 0 && rest.slice(at + 1).some((cell) => cell.trim() !== "");
  return { group: group.trim(), room: room.trim(), ignored };
}

function splitWords(line: string, candidates: readonly PasteCandidate[]): { group: string; room: string } {
  const spaced = /^(.*?\S)\s{2,}(\S.*)$/.exec(line.trim());
  if (spaced) return { group: spaced[1].trim(), room: spaced[2].trim() };
  const words = line.trim().split(/\s+/).filter(Boolean);
  for (let i = 1; i < words.length; i++) {
    const group = words.slice(0, i).join(" ");
    if (exactKeys(group, candidates).length > 0) return { group, room: words.slice(i).join(" ") };
  }
  for (let i = 1; i < words.length; i++) {
    const group = words.slice(0, i).join(" ");
    if (matchGroup(group, candidates).kind !== "none" && wordsOf(words[i - 1]).length === 1 && words[i - 1].length <= 2) {
      return { group, room: words.slice(i).join(" ") };
    }
  }
  return { group: line.trim(), room: "" };
}

/**
 * What a spreadsheet copies, as records of cells: a record a line, cells at
 * each tab, and a cell in double quotes kept whole across tabs and line
 * breaks (a quote inside it doubled), as a spreadsheet writes a cell holding
 * one. A line with no tab is one cell.
 */
export function readRecords(text: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = "";
  let i = 0;
  const end = () => {
    cells.push(cell);
    records.push(cells);
    cells = [];
    cell = "";
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' && cell === "") {
      // A quoted cell: up to its closing quote, a doubled quote kept as one.
      let j = i + 1;
      let quoted = "";
      let closed = false;
      while (j < text.length) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            quoted += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        quoted += text[j];
        j += 1;
      }
      // Only a closed quote followed by the cell's end is a quoted cell; anything else is plain text.
      const next = text[j];
      if (closed && (next === undefined || next === "\t" || next === "\n" || next === "\r")) {
        cell = quoted;
        i = j;
        continue;
      }
    }
    if (ch === "\t") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n") {
      end();
    } else if (ch !== "\r") {
      cell += ch;
    }
    i += 1;
  }
  if (cell !== "" || cells.length > 0) end();
  return records.filter((record) => record.some((each) => each.trim() !== ""));
}

/** Every line of what was pasted that holds anything, split and matched. */
export function readPasted(text: string, candidates: readonly PasteCandidate[]): PastedLine[] {
  return readRecords(text).map((record, index) => {
    const { group, room, ignored } = record.length > 1 ? splitCells(record) : { ...splitWords(record[0], candidates), ignored: false };
    return { number: index + 1, group, room, match: matchGroup(group, candidates), ignored };
  });
}

/** What a pasted room says about itself: null when it is a room the writer would take ("TBC" and the like among them, as no room). */
export function roomProblem(room: string): "tooLong" | "roomLink" | "roomLine" | null {
  if (/[\r\n]/.test(room.trim())) return "roomLine";
  if (roomAsStored(room).length > GROUP_ROOM_LIMIT) return "tooLong";
  if (couldBeFollowed(room)) return "roomLink";
  return null;
}

/** Where one line stands, once the person's own choices are laid over its match. */
export type LineOutcome =
  | { kind: "new"; key: string; room: string }
  | { kind: "change"; key: string; room: string; was: string }
  /** The room taken off: To be confirmed. */
  | { kind: "clear"; key: string; was: string }
  | { kind: "same"; key: string }
  | { kind: "notHere"; key: string; why: string }
  | { kind: "duplicate"; key: string; firstLine: number }
  | { kind: "room"; key: string | null; problem: "tooLong" | "roomLink" | "roomLine" }
  | { kind: "ask"; match: LineMatch };

/** What a person's choice for a line is kept under: the group as pasted, in words, so it survives more typing in the box. */
export function choiceKeyOf(line: Pick<PastedLine, "group">): string {
  return wordsOf(line.group).join(" ");
}

/**
 * Each line's outcome: matched (or chosen) to one row, a room the writer
 * would take, a row whose room is changed here, and not the same row as an
 * earlier line. `chosen` maps a line's group (`choiceKeyOf`) to the row the
 * person picked.
 */
export function outcomesOf(
  lines: readonly PastedLine[],
  candidates: readonly PasteCandidate[],
  chosen: ReadonlyMap<string, string>,
): LineOutcome[] {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate] as const));
  const firstLineOf = new Map<string, number>();
  return lines.map((line): LineOutcome => {
    const picked = chosen.get(choiceKeyOf(line));
    const key = picked && byKey.has(picked) ? picked : line.match.kind === "matched" ? line.match.key : null;
    if (!key) return { kind: "ask", match: line.match };
    const problem = roomProblem(line.room);
    if (problem) return { kind: "room", key, problem };
    const first = firstLineOf.get(key);
    if (first !== undefined) return { kind: "duplicate", key, firstLine: first };
    firstLineOf.set(key, line.number);
    const row = byKey.get(key)!;
    if (row.notHere) return { kind: "notHere", key, why: row.notHere };
    const room = roomAsStored(line.room);
    if (room === row.room) return { kind: "same", key };
    if (room === "") return { kind: "clear", key, was: row.room };
    return row.room === "" ? { kind: "new", key, room } : { kind: "change", key, room, was: row.room };
  });
}

/** The box's count line: how many lines, how many ready, how many need the person. */
export function pasteCounts(outcomes: readonly LineOutcome[]): { lines: number; changes: number; unchanged: number; needYou: number } {
  const changes = outcomes.filter((each) => each.kind === "new" || each.kind === "change" || each.kind === "clear").length;
  const unchanged = outcomes.filter((each) => each.kind === "same").length;
  return { lines: outcomes.length, changes, unchanged, needYou: outcomes.length - changes - unchanged };
}
