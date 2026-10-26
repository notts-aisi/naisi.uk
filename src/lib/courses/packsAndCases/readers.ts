import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import {
  facilitatorsOf,
  listGroups,
  readRunRecords,
  weeksOf,
  type StandingFacilitator,
} from "@/lib/courses/programmeAttendance";
import { programmeLedBy, type LedProgramme } from "@/lib/courses/programmeLead";
import { isBlockWeek, type CasesBlock, type ChooseOneBlock, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  COURSE_PACKS_AND_CASES_COLLECTION,
  normalizeCoursePackCase,
  packCaseRecordId,
  type CoursePackCaseDoc,
} from "@/lib/firestore/coursePacksAndCases";
import { weekDocId } from "@/lib/firestore/courses";
import { chooseOnesOf, drawOf, findCase, findPack, talksOf, type WeekDraw } from "./model";

/**
 * THE READERS OF `coursePacksAndCases` (plan item 8; Q32 A), on the server,
 * and the gate the draw is behind. Nothing else reads the collection but the
 * two routes that write it and the two deletions that remove it
 * (`tests/course-packs-and-cases-readers.test.mjs` walks the tree for a file
 * that does).
 *
 *  - THE PERSON'S OWN, for their week page, programme page and Home: the
 *    overview route reads the caller's records by id, built from the
 *    caller's own uid (`readOwnPacksAndCases`), so nothing here can spell
 *    somebody else's.
 *  - A GROUP'S DRAW, for the draw page and the group page's spread: the packs
 *    and cases given out to the group's people and its facilitators, for the
 *    group's live facilitators, the programme's lead and admins (`drawGate`).
 *    The draw is the group's logistics, handed out in the room in front of
 *    everybody, so a facilitator who takes part is in it like anybody and
 *    their co-facilitators see what they were given.
 *  - THIS WEEK'S WORK, for the group page's table (`weekWorkOf`): each
 *    person's pack and case. A pack the person picked themselves is their own
 *    coursework, so a facilitator of the group who picked one is left blank
 *    for their co-facilitators and shown to the lead and admins.
 *
 * "Ready for my talk" reaches no page but the person's own.
 *
 * Every read is by id (`packCaseRecordId`), never a query, so none needs an
 * index; the deletions alone ask by `uid` or by `runId`, one equality each.
 */

/** Records per `getAll`: the deletion's page, well under the read's own limit. */
const BATCH = 100;

/** Records for these (person, block) pairs, keyed `uid blockId`. Missing and unreadable records are left out. */
export async function readPackCaseRecords(
  db: Firestore,
  runId: string,
  pairs: ReadonlyArray<{ uid: string; blockId: string }>,
): Promise<Map<string, CoursePackCaseDoc>> {
  const out = new Map<string, CoursePackCaseDoc>();
  const ids = [...new Set(pairs.map((pair) => packCaseRecordId(runId, pair.uid, pair.blockId)))];
  for (let at = 0; at < ids.length; at += BATCH) {
    const refs = ids.slice(at, at + BATCH).map((id) => db.collection(COURSE_PACKS_AND_CASES_COLLECTION).doc(id));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const record = normalizeCoursePackCase(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
      // The row's own fields must name what its id was built from.
      if (!record || record.runId !== runId) continue;
      out.set(`${record.uid} ${record.blockId}`, record);
    }
  }
  return out;
}

/** The blocks of a week a person keeps a record in: its Choose ones and its talks. */
export function recordBlocksOf(blocks: readonly WeekBlock[]): Array<ChooseOneBlock | CasesBlock> {
  return [...chooseOnesOf(blocks), ...talksOf(blocks)];
}

/** What the caller has in one week: their pack in each Choose one, their case and mark in each talk. */
export type OwnPicks = {
  /** The pack in each Choose one, by the Choose one's id; a pack no longer in its block is left out. */
  packs: Record<string, string>;
  /** The case given in each talk, by the talk's id; a case no longer in its talk is left out. */
  cases: Record<string, string>;
  /** The talks the caller marked themselves ready for. */
  ready: string[];
};

export const NO_PICKS: OwnPicks = { packs: {}, cases: {}, ready: [] };

/** One week's records as the person's own picks, held to the week's blocks as they are now. */
export function ownPicksOf(blocks: readonly WeekBlock[], records: ReadonlyMap<string, CoursePackCaseDoc>, uid: string): OwnPicks {
  const picks: OwnPicks = { packs: {}, cases: {}, ready: [] };
  for (const chooseOne of chooseOnesOf(blocks)) {
    const pack = findPack(chooseOne, records.get(`${uid} ${chooseOne.id}`)?.packId ?? null);
    if (pack) picks.packs[chooseOne.id] = pack.id;
  }
  for (const talk of talksOf(blocks)) {
    const record = records.get(`${uid} ${talk.id}`);
    if (!record) continue;
    const found = findCase(talk, record.caseId);
    if (found) picks.cases[talk.id] = found.item.id;
    if (record.ready) picks.ready.push(talk.id);
  }
  return picks;
}

/**
 * The caller's own records across a run's weeks written as blocks, by week
 * id. Addressed by the caller's own uid: this cannot read anybody else's.
 */
export async function readOwnPacksAndCases(
  db: Firestore,
  runId: string,
  uid: string,
  weeks: ReadonlyArray<{ id: string; blocks: readonly WeekBlock[] }>,
): Promise<Map<string, OwnPicks>> {
  const pairs = weeks.flatMap((week) => recordBlocksOf(week.blocks).map((block) => ({ uid, blockId: block.id })));
  const records = pairs.length > 0 ? await readPackCaseRecords(db, runId, pairs) : new Map<string, CoursePackCaseDoc>();
  return new Map(weeks.map((week) => [week.id, ownPicksOf(week.blocks, records, uid)]));
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

/** Who may read and type a group's draw: its live facilitators, the programme's lead and admins. */
export type DrawGate =
  | { ok: true; isAdmin: boolean; leadOf: LedProgramme | null; facilitates: boolean }
  | { ok: false };

/**
 * The draw's gate, for the draw page and its route alike: a live facilitator
 * of this group (the group not archived, the account standing), the lead of
 * the programme that names the group's run, or an admin. Nobody else: not
 * another group's facilitator, not the run's track leads, not a reviewer,
 * not a fellow.
 */
export async function drawGate(db: Firestore, actor: SessionUser, group: CourseGroupDoc): Promise<DrawGate> {
  const isAdmin = actor.role === "admin";
  const facilitates =
    !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
  if (isAdmin || facilitates) return { ok: true, isAdmin, leadOf: null, facilitates };
  const leadOf = await programmeLedBy(db, actor, group.runId);
  return leadOf ? { ok: true, isAdmin: false, leadOf, facilitates: false } : { ok: false };
}

/** One person in a group's draw. */
export type DrawPerson = {
  uid: string;
  /** Their whole name, as the group page names people. */
  name: string;
  firstName: string;
  /** A facilitator of the group, who takes part in it too. */
  facilitates: boolean;
};

/**
 * Everybody a group's draw gives out to, in name order: the people taking
 * part in the group (told by Publish, not left; an admin also sees anybody
 * placed and not told, as on the register) and its standing facilitators,
 * who take part too (Zach, Mon 26 Oct 2026). Somebody who left is in no
 * draw.
 */
export function drawPeople(
  people: ReadonlyArray<{ uid: string; name: string }>,
  facilitators: readonly StandingFacilitator[],
): DrawPerson[] {
  const byUid = new Map<string, DrawPerson>();
  const facilitating = new Set(facilitators.map((person) => person.uid));
  for (const person of people) {
    byUid.set(person.uid, {
      uid: person.uid,
      name: person.name,
      firstName: person.name.trim().split(/\s+/)[0] ?? person.name,
      facilitates: facilitating.has(person.uid),
    });
  }
  for (const person of facilitators) {
    if (byUid.has(person.uid)) continue;
    byUid.set(person.uid, { uid: person.uid, name: person.name, firstName: person.firstName, facilitates: true });
  }
  return [...byUid.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));
}

/**
 * The group's people for the draw, from the run's records as the group page
 * reads them. Null when the run is gone or being destroyed.
 */
export async function readDrawPeople(
  db: Firestore,
  runId: string,
  group: CourseGroupDoc,
  viewer: { isAdmin: boolean },
  now: Date,
): Promise<DrawPerson[] | null> {
  const records = await readRunRecords(db, runId);
  if (!records) return null;
  const withGroup = records.groups.some((candidate) => candidate.id === group.id)
    ? records
    : { ...records, groups: [...records.groups, { ...group, name: group.name.trim() || "Untitled group" }] };
  const listed = listGroups(withGroup, viewer, now, weeksOf(withGroup)).find((entry) => entry.group.id === group.id);
  if (!listed) return drawPeople([], facilitatorsOf(withGroup, group));
  const taking = listed.people.filter(({ row }) => row.left === null).map(({ row }) => ({ uid: row.uid, name: row.name }));
  return drawPeople(taking, listed.facilitators);
}

/** A week of a group, as the group reads it, with its draw. Null when the week is not one written as blocks. */
export type GroupWeek = {
  weekId: string;
  weekNumber: number;
  title: string;
  blocks: WeekBlock[];
  draw: WeekDraw;
};

/** The group's own copy of a week when it has one, the run's otherwise: what the group's people read. */
export async function readGroupWeek(
  db: Firestore,
  runId: string,
  groupId: string,
  weekNumber: number,
): Promise<GroupWeek | null> {
  if (!Number.isInteger(weekNumber) || weekNumber < 1) return null;
  const weekId = weekDocId(weekNumber);
  const { week } = await resolveWeekDoc(db, runId, groupId, weekId);
  if (!week || !isBlockWeek(week)) return null;
  return { weekId, weekNumber, title: week.title, blocks: week.blocks, draw: drawOf(week.blocks) };
}

/** What each person has in a week's draw: a pack per Choose one given out, a case per talk given out. */
export type DrawState = Map<string, { packs: Record<string, string>; cases: Record<string, string> }>;

/** The draw as stored, for these people, held to the week's blocks as they are now. */
export async function readDrawState(
  db: Firestore,
  runId: string,
  week: GroupWeek,
  people: readonly DrawPerson[],
): Promise<DrawState> {
  const blocks = [...week.draw.packs, ...week.draw.cases];
  const pairs = people.flatMap((person) => blocks.map((block) => ({ uid: person.uid, blockId: block.id })));
  const records = pairs.length > 0 ? await readPackCaseRecords(db, runId, pairs) : new Map<string, CoursePackCaseDoc>();
  const state: DrawState = new Map();
  for (const person of people) {
    const packs: Record<string, string> = {};
    const cases: Record<string, string> = {};
    for (const chooseOne of week.draw.packs) {
      const pack = findPack(chooseOne, records.get(`${person.uid} ${chooseOne.id}`)?.packId ?? null);
      if (pack) packs[chooseOne.id] = pack.id;
    }
    for (const talk of week.draw.cases) {
      const found = findCase(talk, records.get(`${person.uid} ${talk.id}`)?.caseId ?? null);
      if (found) cases[talk.id] = found.item.id;
    }
    state.set(person.uid, { packs, cases });
  }
  return state;
}

/**
 * THE SPREAD (wk-fac-group: "Pathways in Group B"): each pack of the week's
 * first Choose one given out, with who has it, so every pathway has
 * somebody; and who has nothing yet. A week that gives out cases alone has
 * no tiles, and says who has no case yet.
 */
export type Spread = {
  /** The Choose one's title ("Pathway"), or null for a week that gives out cases alone. */
  packTitle: string | null;
  tiles: Array<{ id: string; name: string; people: DrawPerson[] }>;
  /** Who has no pack (or, with cases alone, no case) yet. */
  notGiven: DrawPerson[];
};

export function spreadOf(week: GroupWeek, people: readonly DrawPerson[], state: DrawState): Spread {
  const chooseOne = week.draw.packs[0] ?? null;
  if (chooseOne) {
    const packOf = (uid: string) => state.get(uid)?.packs[chooseOne.id] ?? null;
    return {
      packTitle: chooseOne.title,
      tiles: chooseOne.packs.map((pack) => ({
        id: pack.id,
        name: pack.name,
        people: people.filter((person) => packOf(person.uid) === pack.id),
      })),
      notGiven: people.filter((person) => !packOf(person.uid)),
    };
  }
  const talk = week.draw.cases[0] ?? null;
  return {
    packTitle: null,
    tiles: [],
    notGiven: talk ? people.filter((person) => !state.get(person.uid)?.cases[talk.id]) : [],
  };
}

// ---------------------------------------------------------------------------
// This week's work: the pathway and case columns
// ---------------------------------------------------------------------------

/** One person's two columns of This week's work (wk-fac-group): the names, or null for none. */
export type WeekWorkCells = { pack: string | null; case: string | null };

/**
 * The pathway and case columns of This week's work, for each person in the
 * draw: the name of the pack they have in the week's first Choose one, and
 * the title of the case they were given in its first talk with cases. The
 * column headers are the Choose one's title ("Pathway") and "Case".
 *
 * A pack the person PICKED (a Choose one they choose themselves) is their own
 * coursework: when they facilitate the group too, their co-facilitators get
 * an empty cell, and the lead and admins see it (`viewer.isAdmin` or
 * `viewer.leadOf`). A pack or case GIVEN OUT is the draw, seen by everybody
 * the draw is shown to.
 */
export async function weekWorkOf(
  db: Firestore,
  runId: string,
  week: GroupWeek,
  people: readonly DrawPerson[],
  viewer: { isAdmin: boolean; leadOf: LedProgramme | null },
): Promise<{ packTitle: string | null; cells: Map<string, WeekWorkCells> }> {
  const chooseOne = chooseOnesOf(week.blocks)[0] ?? null;
  const talk = talksOf(week.blocks).find((candidate) => candidate.groups.some((group) => group.cases.length > 0)) ?? null;
  const blocks = [chooseOne, talk].filter((block): block is ChooseOneBlock | CasesBlock => block !== null);
  const pairs = people.flatMap((person) => blocks.map((block) => ({ uid: person.uid, blockId: block.id })));
  const records = pairs.length > 0 ? await readPackCaseRecords(db, runId, pairs) : new Map<string, CoursePackCaseDoc>();
  const seesOwnWork = viewer.isAdmin || viewer.leadOf !== null;
  const cells = new Map<string, WeekWorkCells>();
  for (const person of people) {
    let pack: string | null = null;
    if (chooseOne) {
      const picked = chooseOne.givenBy === "fellow";
      const hidden = picked && person.facilitates && !seesOwnWork;
      const found = hidden ? null : findPack(chooseOne, records.get(`${person.uid} ${chooseOne.id}`)?.packId ?? null);
      pack = found ? found.name : null;
    }
    const given = talk ? findCase(talk, records.get(`${person.uid} ${talk.id}`)?.caseId ?? null) : null;
    cells.set(person.uid, { pack, case: given ? given.item.title : null });
  }
  return { packTitle: chooseOne ? chooseOne.title : null, cells };
}

