import {
  allBlocks,
  type Case,
  type CaseGroup,
  type CasesBlock,
  type ChooseOneBlock,
  type Pack,
  type WeekBlock,
} from "../weekBlocks/model";

/**
 * PACKS, CASES AND TALKS IN A WEEK WRITTEN AS BLOCKS (plan item 8; Q32 A;
 * boards wk-cases, wk-week, wk-week-phone, wk-week6-phone, wk-fac-group):
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
 * group names its pack, `CaseGroup.packId`), and a case with a content note
 * is never in the draw: it stays out of every list a facilitator types from.
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

/** What one week's draw holds: the Choose ones and the talks a facilitator gives out. */
export type WeekDraw = {
  packs: ChooseOneBlock[];
  cases: CasesBlock[];
};

/** The week's draw. Empty when a facilitator gives nothing out this week. */
export function drawOf(blocks: readonly WeekBlock[]): WeekDraw {
  return {
    packs: chooseOnesOf(blocks).filter((block) => block.givenBy === "facilitator" && block.packs.length > 0),
    cases: talksOf(blocks).filter((block) => block.givenBy === "facilitator" && casesIn(block).length > 0),
  };
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

/** Whether a case may be in the draw: never one with a content note. */
export function isDrawable(item: Case): boolean {
  return item.contentNote.trim() === "";
}

/**
 * A talk as the draw needs it, and no more: its cases' ids and titles, by
 * group, each group's pack, whether each case may be in the draw, and the
 * Choose one whose packs its groups name. The draw page's editor is handed
 * this (never the week), and the route checks a save against the same shape,
 * so the list a facilitator types from and the check are one rule.
 */
export type DrawTalk = {
  id: string;
  /** The Choose one whose packs the case groups name, or null when the cases are not grouped by pack. */
  keyedBy: string | null;
  groups: Array<{ packId: string | null; cases: Array<{ id: string; title: string; drawable: boolean }> }>;
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
      cases: group.cases.map((item) => ({ id: item.id, title: item.title, drawable: isDrawable(item) })),
    })),
  };
}

/**
 * The cases a person may be given in a talk, from the pack they have:
 *  - a talk whose cases are grouped by pack offers only their pack's group
 *    (and any group that names no pack), and nothing until they have a pack
 *    (`pack-first`: "Choose a pathway first");
 *  - a talk whose cases are not grouped by pack offers them all;
 *  - a case with a content note is never offered.
 */
export type CaseOptions =
  | { kind: "cases"; cases: Array<{ id: string; title: string }> }
  | { kind: "pack-first"; chooseOneId: string };

export function caseOptions(talk: DrawTalk, packOf: (chooseOneId: string) => string | null): CaseOptions {
  const pack = talk.keyedBy ? packOf(talk.keyedBy) : null;
  if (talk.keyedBy && !pack) return { kind: "pack-first", chooseOneId: talk.keyedBy };
  return {
    kind: "cases",
    cases: talk.groups
      .filter((group) => !talk.keyedBy || group.packId === null || group.packId === pack)
      .flatMap((group) => group.cases)
      .filter((item) => item.drawable)
      .map((item) => ({ id: item.id, title: item.title })),
  };
}

/** Whether `caseId` may be given to a person with these packs: the route's check, the list's own rule. */
export function mayBeGiven(talk: DrawTalk, caseId: string, packOf: (chooseOneId: string) => string | null): boolean {
  const options = caseOptions(talk, packOf);
  return options.kind === "cases" && options.cases.some((item) => item.id === caseId);
}

/** How many sources a pack's reading holds: its links, as the board counts "2 sources". */
export function packSourceCount(pack: Pack): number {
  return pack.read.filter((run) => Boolean(run.href)).length;
}
