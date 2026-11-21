import {
  allBlocks,
  type Case,
  type CaseGroup,
  type CasesBlock,
  type ChooseOneBlock,
  type Pack,
  type WeekBlock,
} from "../weekBlocks/model";
import { weekTaskNeeds } from "../weekBlocks/progress";

/**
 * PACKS, CASES AND TALKS IN A WEEK WRITTEN AS BLOCKS:
 * which blocks keep a record per person, which of them a facilitator gives
 * out (the draw), and which cases a person may be given.
 *
 *  - A CHOOSE ONE keeps the pack a person has. A facilitator gives it out
 *    when its `givenBy` is "facilitator" (week 3's pathways, week 5's rival
 *    plans); the person picks it on the week page otherwise (week 6's career
 *    review), until their session starts.
 *  - A TALK (a Cases block: the case study, or a talk inside a part) keeps
 *    the case a facilitator gave the person, when it has cases, and the
 *    person's own "Ready for my talk".
 *
 * THE DRAW is what a facilitator hands out on paper at the end of a session
 * and then types into the group page: every Choose one given out, and every
 * talk given out that has cases. A talk with no cases has nothing to hand
 * out. Each case list only offers the cases of the person's pack (a case
 * group names its pack, `CaseGroup.packId`), whether a facilitator gave that
 * pack out or the person PICKED it on their week page (the draw then reads
 * the pick and shows it as words, `WeekDraw.picked`). A case with a content
 * note stays out of every list a facilitator types from, unless the person
 * asked for one: the facilitator ticks "Asked for this one" on their row,
 * and only then is it offered and accepted (`CaseOptionsAsk`).
 *
 * Pure: the week page, the draw page, the group page and the routes all ask
 * these, so the list a facilitator sees and the check the route makes are
 * the same list.
 */

/** Every Choose one of a week, in page order. */
export function chooseOnesOf(blocks: readonly WeekBlock[]): ChooseOneBlock[] {
  return allBlocks(blocks).filter((block): block is ChooseOneBlock => block.type === "chooseOne");
}

/** Every talk of a week, in page order: the case study, and a talk or pitch inside a part. */
export function talksOf(blocks: readonly WeekBlock[]): CasesBlock[] {
  return allBlocks(blocks).filter((block): block is CasesBlock => block.type === "cases");
}

/** Every case of a talk, in its groups' order. */
export function casesIn(talk: CasesBlock): Case[] {
  return talk.groups.flatMap((group) => group.cases);
}

/** A case of a talk and the group it is in, by the case's id. */
export function findCase(talk: CasesBlock, caseId: string | null): { group: CaseGroup; item: Case } | null {
  if (!caseId) return null;
  for (const group of talk.groups) {
    const item = group.cases.find((candidate) => candidate.id === caseId);
    if (item) return { group, item };
  }
  return null;
}

/** A pack of a Choose one, by its id. */
export function findPack(chooseOne: ChooseOneBlock, packId: string | null): Pack | null {
  if (!packId) return null;
  return chooseOne.packs.find((pack) => pack.id === packId) ?? null;
}

/**
 * What one week's draw holds: the Choose ones and the talks a facilitator
 * gives out, and the Choose ones each person picks whose packs the cases
 * given out are grouped by (`picked`). A picked one is never typed in: the
 * draw reads each person's pick and offers that pack's cases.
 */
export type WeekDraw = {
  packs: ChooseOneBlock[];
  cases: CasesBlock[];
  picked: ChooseOneBlock[];
};

/** The week's draw. Empty when a facilitator gives nothing out this week. */
export function drawOf(blocks: readonly WeekBlock[]): WeekDraw {
  const cases = talksOf(blocks).filter((block) => block.givenBy === "facilitator" && casesIn(block).length > 0);
  const picked: ChooseOneBlock[] = [];
  for (const talk of cases) {
    const keying = keyingChooseOne(blocks, talk);
    if (!keying || keying.givenBy === "facilitator" || keying.packs.length === 0) continue;
    if (!picked.some((block) => block.id === keying.id)) picked.push(keying);
  }
  return {
    packs: chooseOnesOf(blocks).filter((block) => block.givenBy === "facilitator" && block.packs.length > 0),
    cases,
    picked,
  };
}

/**
 * The titles of the Choose ones a week gives out whose pack counts towards
 * the week: a This week task covers it, so the week is done only once the
 * pack the person holds is ticked (`weekDone`). What a late save into the
 * week says it changes (`lateSaveChangesWords`).
 */
export function countedPackTitlesOf(blocks: readonly WeekBlock[], draw: WeekDraw): string[] {
  const counted = new Set(weekTaskNeeds(blocks).flatMap((needs) => needs.chooseOneIds));
  return draw.packs.filter((chooseOne) => counted.has(chooseOne.id)).map((chooseOne) => chooseOne.title);
}

/** Whether a facilitator gives anything out for this week. */
export function hasDraw(draw: WeekDraw): boolean {
  return draw.packs.length > 0 || draw.cases.length > 0;
}

/**
 * The Choose one whose packs a talk's case groups name (week 3: the cases
 * grouped by pathway, each group naming its pathway's pack), or null when
 * the talk's cases are not grouped by pack.
 */
export function keyingChooseOne(blocks: readonly WeekBlock[], talk: CasesBlock): ChooseOneBlock | null {
  const named = new Set(talk.groups.map((group) => group.packId).filter((id): id is string => Boolean(id)));
  if (named.size === 0) return null;
  return chooseOnesOf(blocks).find((chooseOne) => chooseOne.packs.some((pack) => named.has(pack.id))) ?? null;
}

/** Whether a case is in the draw's lists by default: never one with a content note. */
export function isDrawable(item: Case): boolean {
  return item.contentNote.trim() === "";
}

/**
 * A talk as the draw needs it, and no more: its cases' ids and titles, by
 * group, each group's pack and name, whether each case is in the lists by
 * default and its content note when it has one, and the Choose one whose
 * packs its groups name. The draw page's editor is handed this (never the
 * week), and the route checks a save against the same shape, so the list a
 * facilitator types from and the check are one rule.
 */
export type DrawTalk = {
  id: string;
  /** The Choose one whose packs the case groups name, or null when the cases are not grouped by pack. */
  keyedBy: string | null;
  groups: Array<{
    packId: string | null;
    /** The group's heading ("Misuse"), for the line that counts its cases with a content note. */
    name: string;
    cases: Array<{ id: string; title: string; drawable: boolean; note: string }>;
  }>;
};

export function drawTalkOf(blocks: readonly WeekBlock[], talk: CasesBlock): DrawTalk {
  const keying = keyingChooseOne(blocks, talk);
  const packIds = new Set(keying ? keying.packs.map((pack) => pack.id) : []);
  return {
    id: talk.id,
    keyedBy: keying ? keying.id : null,
    groups: talk.groups.map((group) => ({
      // A group naming a pack of another Choose one, or none, is offered to everybody.
      packId: group.packId && packIds.has(group.packId) ? group.packId : null,
      name: group.name,
      cases: group.cases.map((item) => ({ id: item.id, title: item.title, drawable: isDrawable(item), note: item.contentNote.trim() })),
    })),
  };
}

/**
 * The cases a person may be given in a talk, from the pack they have:
 *  - a talk whose cases are grouped by pack offers only their pack's group
 *    (and any group that names no pack), and nothing until they have a pack
 *    (`pack-first`: "Choose Chloe’s pathway first", or, for a pack the
 *    person picks, "Waits for a pathway");
 *  - a talk whose cases are not grouped by pack offers them all;
 *  - a case with a content note is offered only when the person asked for
 *    one (`asked`: the facilitator ticked "Asked for this one" on their
 *    row), never otherwise.
 */
export type CaseOptions =
  | { kind: "cases"; cases: Array<{ id: string; title: string }> }
  | { kind: "pack-first"; chooseOneId: string };

/** Whether the person asked for a case with a content note: the row's tick, sent with the save, never stored. */
export type CaseOptionsAsk = { asked?: boolean };

/** The cases of the person's own groups in a talk, with a content note or not. Null until they have a pack. */
function casesOfTheirGroups(talk: DrawTalk, packOf: (chooseOneId: string) => string | null): DrawTalk["groups"] | null {
  const pack = talk.keyedBy ? packOf(talk.keyedBy) : null;
  if (talk.keyedBy && !pack) return null;
  return talk.groups.filter((group) => !talk.keyedBy || group.packId === null || group.packId === pack);
}

export function caseOptions(
  talk: DrawTalk,
  packOf: (chooseOneId: string) => string | null,
  ask: CaseOptionsAsk = {},
): CaseOptions {
  const groups = casesOfTheirGroups(talk, packOf);
  if (!groups) return { kind: "pack-first", chooseOneId: talk.keyedBy as string };
  return {
    kind: "cases",
    cases: groups
      .flatMap((group) => group.cases)
      .filter((item) => item.drawable || ask.asked === true)
      .map((item) => ({ id: item.id, title: item.title })),
  };
}

/** The cases of the person's own list that have a content note, with the note: what "Asked for this one" adds. */
export function notedCasesFor(
  talk: DrawTalk,
  packOf: (chooseOneId: string) => string | null,
): Array<{ id: string; title: string; note: string }> {
  return (casesOfTheirGroups(talk, packOf) ?? [])
    .flatMap((group) => group.cases)
    .filter((item) => !item.drawable)
    .map((item) => ({ id: item.id, title: item.title, note: item.note }));
}

/** A case of a talk as the draw holds it, with the pack its group names, by id. */
export function drawCaseOf(
  talk: DrawTalk,
  caseId: string | null,
): { id: string; title: string; drawable: boolean; note: string; packId: string | null } | null {
  if (!caseId) return null;
  for (const group of talk.groups) {
    const item = group.cases.find((candidate) => candidate.id === caseId);
    if (item) return { ...item, packId: group.packId };
  }
  return null;
}

/**
 * Whether `caseId` may be given to a person with these packs: the route's
 * check, the list's own rule. A case with a content note only with `asked`.
 */
export function mayBeGiven(
  talk: DrawTalk,
  caseId: string,
  packOf: (chooseOneId: string) => string | null,
  ask: CaseOptionsAsk = {},
): boolean {
  const options = caseOptions(talk, packOf, ask);
  return options.kind === "cases" && options.cases.some((item) => item.id === caseId);
}

/** How many sources a pack's reading holds: its links, as the board counts "2 sources". */
export function packSourceCount(pack: Pack): number {
  return pack.read.filter((run) => Boolean(run.href)).length;
}
