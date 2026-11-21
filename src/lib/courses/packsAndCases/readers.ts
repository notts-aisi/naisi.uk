import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar, resolveWeekDoc, resolveWeekDocs } from "@/lib/courses/groupResolve";
import {
  facilitatorsOf,
  listGroups,
  readRunRecords,
  weeksOf,
  type StandingFacilitator,
} from "@/lib/courses/programmeAttendance";
import { programmeLedBy, type LedProgramme } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import { workClosesAt } from "@/lib/courses/weekWork/closes";
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
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { drawWeekRule, type DrawWeekRule } from "./drawWeek";
import { chooseOnesOf, drawOf, findCase, findPack, hasDraw, keyingChooseOne, talksOf, type WeekDraw } from "./model";

/**
 * THE READERS OF `coursePacksAndCases`, on the server,
 * and the gate the draw is behind. Nothing else reads the collection but the
 * two routes that write it and the two deletions that remove it
 * (`tests/privacy-policy.test.mjs` walks the tree for a file that does, and
 * holds each reader to who may see what).
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
 *    their co-facilitators see what they were given. A pack each person
 *    PICKS, which the cases follow, is read too, for the case lists; a
 *    facilitator's own pick is their own coursework, so a co-facilitator's
 *    page is handed nothing of it nor of the case that follows it
 *    (`drawRowsFor`, `hidesOwnPick`), and the route refuses that case from
 *    them.
 *  - THIS WEEK'S WORK, for the group page's table (`weekWorkOf`): each
 *    person's pack and case. A pack the person picked themselves is their own
 *    coursework, so a facilitator of the group who picked one is left blank
 *    for their co-facilitators and shown to the lead and admins, and so is
 *    the case that follows it, which names it.
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
  /** Their name as the group page names people for its reader. */
  name: string;
  /** The name a sentence calls them by: the first word of the name they go by. */
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
 *
 * A row that carries the first name it goes by keeps it: on a page drawn for
 * the committee, `name` is the full name ("Priya Shah (Pri)", the names
 * rule), whose first word is not the name they go by. A row with only a
 * name is named by the name people go by, so its first word is.
 */
export function drawPeople(
  people: ReadonlyArray<{ uid: string; name: string; firstName?: string }>,
  facilitators: readonly StandingFacilitator[],
): DrawPerson[] {
  const byUid = new Map<string, DrawPerson>();
  const facilitating = new Set(facilitators.map((person) => person.uid));
  for (const person of people) {
    byUid.set(person.uid, {
      uid: person.uid,
      name: person.name,
      firstName: person.firstName?.trim() || (person.name.trim().split(/\s+/)[0] ?? person.name),
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
 * reads them, with the run those records were read with and when its
 * programme closes for work (`workClosesAt`, from the run's live groups: the
 * moment every member's week turns read only). Null when the run is gone or
 * being destroyed.
 */
export type DrawRoster = { people: DrawPerson[]; run: CourseRunDoc; closesAt: Date | null };

export async function readDrawRoster(
  db: Firestore,
  runId: string,
  group: CourseGroupDoc,
  viewer: { isAdmin: boolean },
  now: Date,
): Promise<DrawRoster | null> {
  const records = await readRunRecords(db, runId);
  if (!records) return null;
  const closesAt = workClosesAt(records.run, records.groups);
  const withGroup = records.groups.some((candidate) => candidate.id === group.id)
    ? records
    : { ...records, groups: [...records.groups, { ...group, name: group.name.trim() || "Untitled group" }] };
  const listed = listGroups(withGroup, viewer, now, weeksOf(withGroup)).find((entry) => entry.group.id === group.id);
  if (!listed) return { people: drawPeople([], facilitatorsOf(withGroup, group)), run: records.run, closesAt };
  const taking = listed.people.filter(({ row }) => row.left === null).map(({ row }) => ({ uid: row.uid, name: row.name }));
  return { people: drawPeople(taking, listed.facilitators), run: records.run, closesAt };
}

/** The group's people for the draw alone. Null when the run is gone or being destroyed. */
export async function readDrawPeople(
  db: Firestore,
  runId: string,
  group: CourseGroupDoc,
  viewer: { isAdmin: boolean },
  now: Date,
): Promise<DrawPerson[] | null> {
  return (await readDrawRoster(db, runId, group, viewer, now))?.people ?? null;
}

/**
 * Whether the viewer reads a facilitator's own work: an admin, or the lead of
 * the programme that names the group's run (asked of the gate, and, for a
 * facilitator the gate admitted as one, of the programme, since the gate
 * stops at the first thing that admits). The group's other facilitators do
 * not: the policy says a facilitator's own work is read by the lead and
 * admins only.
 */
export async function seesFacilitatorsOwnWork(
  db: Firestore,
  actor: SessionUser,
  group: CourseGroupDoc,
  gate: Extract<DrawGate, { ok: true }>,
): Promise<boolean> {
  if (gate.isAdmin || gate.leadOf) return true;
  return (await programmeLedBy(db, actor, group.runId)) !== null;
}

/**
 * Whether a person's own pick, and the case that follows it, are kept from
 * this viewer: a facilitator of the group, read by somebody who is not them
 * and does not read a facilitator's own work.
 */
export function hidesOwnPick(person: DrawPerson, viewer: { uid: string; seesOwnWork: boolean }): boolean {
  return person.facilitates && person.uid !== viewer.uid && !viewer.seesOwnWork;
}

/** The talks of a week's draw whose cases follow a pack each person picks. */
export function talksFollowingAPick(draw: WeekDraw, blocks: readonly WeekBlock[]): Set<string> {
  const picked = new Set(draw.picked.map((chooseOne) => chooseOne.id));
  return new Set(draw.cases.filter((talk) => picked.has(keyingChooseOne(blocks, talk)?.id ?? "")).map((talk) => talk.id));
}

/** Whether a programme has closed for work at `now`: after it, the draw is read only. */
export function drawClosed(closesAt: Date | null, now: Date): boolean {
  return closesAt !== null && now.getTime() >= closesAt.getTime();
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

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;

/**
 * EVERY WEEK OF THE COURSE AS THE GROUP READS IT, AND WHICH WEEK THE SLIPS ARE
 * FOR (`drawWeekRule`): the group's sessions from the one resolver with the
 * group's own calendar, the course's weeks written as blocks (the run's, with
 * the group's own copies over them: two queries), and the draw of the weeks
 * the rule asks about, at most two (`DRAW_WEEKS_READ`).
 *
 *  - `weeks`: every week written as blocks, by number, whether or not the
 *    group's plan lists it, so an address names any week.
 *  - `taught`: the weeks the group's plan teaches, in order (every week
 *    written, for a run with no plan yet).
 *  - `giving`: the taught weeks that give something out, in order.
 *  - `states`: the draw as stored for each week the rule read.
 *  - `finished`: every session of the group has ended.
 *  - `fallbackWeek`: the week a page opens on for a course that gives nothing
 *    out (the rule has no answer): the next session's, else the last one's.
 */
export type DrawWeeks = {
  sessions: ResolvedSession[];
  finished: boolean;
  fallbackWeek: number;
  weeks: Map<number, GroupWeek>;
  taught: number[];
  giving: GroupWeek[];
  rule: DrawWeekRule;
  states: Map<number, DrawState>;
};

export async function readDrawWeeks(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; people: readonly DrawPerson[]; now: Date },
): Promise<DrawWeeks> {
  const { run, group, people, now } = input;
  const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
  const weeks = new Map<number, GroupWeek>();
  for (const entry of await resolveWeekDocs(db, run.id, group.id)) {
    const match = WEEK_ID.exec(entry.week.id);
    const weekNumber = match ? Number(match[1]) : 0;
    if (weekNumber < 1 || !isBlockWeek(entry.week)) continue;
    weeks.set(weekNumber, {
      weekId: weekDocId(weekNumber),
      weekNumber,
      title: entry.week.title,
      blocks: entry.week.blocks,
      draw: drawOf(entry.week.blocks),
    });
  }
  const planned = [...new Set(sessions.map((session) => session.weekNumber))].sort((a, b) => a - b);
  const taught = planned.length > 0 ? planned : [...weeks.keys()].sort((a, b) => a - b);
  const giving = taught.map((n) => weeks.get(n)).filter((week): week is GroupWeek => Boolean(week && hasDraw(week.draw)));
  const givingWeeks = giving.map((week) => week.weekNumber);
  // Once to learn which weeks decide it, then with whether everybody has theirs in each.
  const first = drawWeekRule({ sessions, givingWeeks, now });
  const read = await Promise.all(
    first.toRead.map(async (n) => {
      const week = weeks.get(n) as GroupWeek;
      return [n, await readDrawState(db, run.id, week, people)] as const;
    }),
  );
  const states = new Map<number, DrawState>(read);
  const everybodyHas = new Map(read.map(([n, state]) => [n, everybodyHasTheirs(weeks.get(n) as GroupWeek, people, state)]));
  const rule = drawWeekRule({ sessions, givingWeeks, now, everybodyHas });
  const range = sessionRange(sessions, now);
  return {
    sessions,
    finished: range.next === null && range.lastDateKey !== "",
    fallbackWeek: range.next?.weekNumber ?? sessions[sessions.length - 1]?.weekNumber ?? 1,
    weeks,
    taught,
    giving,
    rule,
    states,
  };
}

/**
 * THE GROUP PAGE'S CARD: the week the slips being handed out are for, while
 * it is still to come, with its spread, from what `readDrawWeeks` already
 * read (the rule's week is always one it read). Null when no week still to
 * come gives anything out.
 */
export function drawCardOf(course: DrawWeeks, people: readonly DrawPerson[]): { week: GroupWeek; spread: Spread } | null {
  const n = course.rule.weekNumber;
  if (n === null || !course.rule.ahead) return null;
  const week = course.weeks.get(n);
  const state = course.states.get(n);
  if (!week || !state || !hasDraw(week.draw)) return null;
  return { week, spread: spreadOf(week, people, state) };
}

/** Whether everybody in the draw has a pack in each Choose one and a case in each talk the week gives out. */
export function everybodyHasTheirs(week: GroupWeek, people: readonly DrawPerson[], state: DrawState): boolean {
  return people.every((person) => {
    const holding = state.get(person.uid);
    return (
      week.draw.packs.every((chooseOne) => Boolean(holding?.packs[chooseOne.id])) &&
      week.draw.cases.every((talk) => Boolean(holding?.cases[talk.id]))
    );
  });
}

/**
 * What each person has in a week's draw: a pack per Choose one given out, a
 * case per talk given out, and the pack they picked in each Choose one they
 * pick that the cases follow (`picked`). Server side only: what a page is
 * handed of it goes through `drawRowsFor`.
 */
export type DrawState = Map<
  string,
  { packs: Record<string, string>; cases: Record<string, string>; picked: Record<string, string> }
>;

/** The draw as stored, for these people, held to the week's blocks as they are now. */
export async function readDrawState(
  db: Firestore,
  runId: string,
  week: GroupWeek,
  people: readonly DrawPerson[],
): Promise<DrawState> {
  const blocks = [...week.draw.packs, ...week.draw.picked, ...week.draw.cases];
  const pairs = people.flatMap((person) => blocks.map((block) => ({ uid: person.uid, blockId: block.id })));
  const records = pairs.length > 0 ? await readPackCaseRecords(db, runId, pairs) : new Map<string, CoursePackCaseDoc>();
  const state: DrawState = new Map();
  for (const person of people) {
    const packs: Record<string, string> = {};
    const cases: Record<string, string> = {};
    const picked: Record<string, string> = {};
    for (const chooseOne of week.draw.packs) {
      const pack = findPack(chooseOne, records.get(`${person.uid} ${chooseOne.id}`)?.packId ?? null);
      if (pack) packs[chooseOne.id] = pack.id;
    }
    for (const chooseOne of week.draw.picked) {
      const pack = findPack(chooseOne, records.get(`${person.uid} ${chooseOne.id}`)?.packId ?? null);
      if (pack) picked[chooseOne.id] = pack.id;
    }
    for (const talk of week.draw.cases) {
      const found = findCase(talk, records.get(`${person.uid} ${talk.id}`)?.caseId ?? null);
      if (found) cases[talk.id] = found.item.id;
    }
    state.set(person.uid, { packs, cases, picked });
  }
  return state;
}

/**
 * WHAT THE DRAW PAGE HANDS ITS EDITOR, for this viewer: each person's packs
 * and cases as stored, and their picks (`picks`). A facilitator's own pick is
 * their own work (`hidesOwnPick`): for a co-facilitator their row carries no
 * pick and no case of a talk that follows a pick, only that it is theirs to
 * pick (`hidden`). Nothing else of the state reaches the page.
 */
export type DrawRows = {
  initial: Record<string, { packs: Record<string, string>; cases: Record<string, string> }>;
  picks: Record<string, Record<string, string>>;
  hidden: string[];
};

export function drawRowsFor(
  week: GroupWeek,
  people: readonly DrawPerson[],
  state: DrawState,
  viewer: { uid: string; seesOwnWork: boolean },
): DrawRows {
  const following = talksFollowingAPick(week.draw, week.blocks);
  const rows: DrawRows = { initial: {}, picks: {}, hidden: [] };
  for (const person of people) {
    const holding = state.get(person.uid);
    const packs = { ...(holding?.packs ?? {}) };
    const cases = { ...(holding?.cases ?? {}) };
    if (following.size > 0 && hidesOwnPick(person, viewer)) {
      for (const talkId of following) delete cases[talkId];
      rows.initial[person.uid] = { packs, cases };
      rows.picks[person.uid] = {};
      rows.hidden.push(person.uid);
      continue;
    }
    rows.initial[person.uid] = { packs, cases };
    rows.picks[person.uid] = { ...(holding?.picked ?? {}) };
  }
  return rows;
}

/**
 * THE SPREAD ("Pathways in Group B"): each pack of the week's
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

/** One person's two columns of This week's work: the names, or null for none. */
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
  // A case that follows a pick names the pick: kept back with it.
  const keyedByPick = talk ? keyingChooseOne(week.blocks, talk)?.givenBy === "fellow" : false;
  const cells = new Map<string, WeekWorkCells>();
  for (const person of people) {
    let pack: string | null = null;
    if (chooseOne) {
      const picked = chooseOne.givenBy === "fellow";
      const hidden = picked && person.facilitates && !seesOwnWork;
      const found = hidden ? null : findPack(chooseOne, records.get(`${person.uid} ${chooseOne.id}`)?.packId ?? null);
      pack = found ? found.name : null;
    }
    const caseHidden = keyedByPick && person.facilitates && !seesOwnWork;
    const given = talk && !caseHidden ? findCase(talk, records.get(`${person.uid} ${talk.id}`)?.caseId ?? null) : null;
    cells.set(person.uid, { pack, case: given ? given.item.title : null });
  }
  return { packTitle: chooseOne ? chooseOne.title : null, cells };
}

