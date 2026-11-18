import { couldBeFollowed } from "../followable";
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
 * group's letter ("Grp K"). Only the rows handed in are candidates: the
 * programmes the reader may see, as the page shows them that week.
 *
 * A ROOM is the text after the group, trimmed, held to the room field's limit
 * and refused when it holds a link, as the writer refuses one.
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
  // Narrowed by a programme named in front, when one is.
  const named = byLetter.filter((candidate) => programmeAliases(candidate.programmeName).some((alias) => startsWith(words, alias)));
  const pool = named.length > 0 ? named : byLetter;
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
export function splitLine(line: string, candidates: readonly PasteCandidate[]): { group: string; room: string } {
  if (line.includes("\t")) {
    const [group, ...rest] = line.split("\t");
    const room = rest.find((cell) => cell.trim() !== "") ?? "";
    return { group: group.trim(), room: room.trim() };
  }
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

/** Every line of what was pasted that holds anything, split and matched. */
export function readPasted(text: string, candidates: readonly PasteCandidate[]): PastedLine[] {
  const out: PastedLine[] = [];
  text.split(/\r?\n/).forEach((raw) => {
    if (raw.trim() === "") return;
    const { group, room } = splitLine(raw, candidates);
    out.push({ number: out.length + 1, group, room, match: matchGroup(group, candidates) });
  });
  return out;
}

/** What a pasted room says about itself: null when it is a room the writer would take. */
export function roomProblem(room: string): "noRoom" | "tooLong" | "roomLink" | "roomLine" | null {
  if (room.trim() === "") return "noRoom";
  if (/[\r\n]/.test(room)) return "roomLine";
  if (room.trim().length > GROUP_ROOM_LIMIT) return "tooLong";
  if (couldBeFollowed(room)) return "roomLink";
  return null;
}

/** Where one line stands, once the person's own choices are laid over its match. */
export type LineOutcome =
  | { kind: "new"; key: string; room: string }
  | { kind: "change"; key: string; room: string; was: string }
  | { kind: "same"; key: string }
  | { kind: "notHere"; key: string; why: string }
  | { kind: "duplicate"; key: string; firstLine: number }
  | { kind: "room"; key: string | null; problem: "noRoom" | "tooLong" | "roomLink" | "roomLine" }
  | { kind: "ask"; match: LineMatch };

/**
 * Each line's outcome: matched (or chosen) to one row, a room the writer
 * would take, a row whose room is changed here, and not the same row as an
 * earlier line. `chosen` maps a line's number to the row the person picked.
 */
export function outcomesOf(
  lines: readonly PastedLine[],
  candidates: readonly PasteCandidate[],
  chosen: ReadonlyMap<number, string>,
): LineOutcome[] {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate] as const));
  const firstLineOf = new Map<string, number>();
  return lines.map((line): LineOutcome => {
    const picked = chosen.get(line.number);
    const key = picked && byKey.has(picked) ? picked : line.match.kind === "matched" ? line.match.key : null;
    if (!key) return { kind: "ask", match: line.match };
    const problem = roomProblem(line.room);
    if (problem) return { kind: "room", key, problem };
    const first = firstLineOf.get(key);
    if (first !== undefined) return { kind: "duplicate", key, firstLine: first };
    firstLineOf.set(key, line.number);
    const row = byKey.get(key)!;
    if (row.notHere) return { kind: "notHere", key, why: row.notHere };
    const room = line.room.trim();
    if (room === row.room) return { kind: "same", key };
    return row.room === "" ? { kind: "new", key, room } : { kind: "change", key, room, was: row.room };
  });
}

/** The box's count line: how many lines, how many ready, how many need the person. */
export function pasteCounts(outcomes: readonly LineOutcome[]): { lines: number; changes: number; unchanged: number; needYou: number } {
  const changes = outcomes.filter((each) => each.kind === "new" || each.kind === "change").length;
  const unchanged = outcomes.filter((each) => each.kind === "same").length;
  return { lines: outcomes.length, changes, unchanged, needYou: outcomes.length - changes - unchanged };
}
