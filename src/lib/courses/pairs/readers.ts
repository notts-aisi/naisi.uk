import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readDrawPeople, readGroupWeek, type DrawPerson, type GroupWeek } from "@/lib/courses/packsAndCases/readers";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { COURSE_PAIRS_COLLECTION, normalizeCoursePair, pairRecordId, type CoursePairDoc } from "@/lib/firestore/coursePairs";
import { pairOf, pairsAskOf, pairsView, type OwnPair, type PairEntry, type PairsAsk, type PairsView } from "./model";

/**
 * THE READERS OF `coursePairs` (Technical AI Safety's hands-on night), on the
 * server. Nothing else reads the collection but the route that writes it and
 * the two deletions that remove it (`tests/course-hub-pairs.test.mjs` walks
 * the tree for a file that does).
 *
 *  - A GROUP'S PAIRS, every one, for its live facilitators, the programme's
 *    lead and admins (`readGroupPairs`): the group page's card and the pairs
 *    page. Each page asks its own gate first: the group page its own, the
 *    pairs page the draw's (`drawGate`, the same people).
 *  - A PERSON'S OWN PAIR, for their week page (`readOwnPairs`): their
 *    partners' first names and who in the pair is bringing a laptop, for each
 *    group they take part in. Nothing of any other pair, and nothing about
 *    laptops beyond their own pair.
 *
 * WHO IS IN A GROUP'S PAIRS: the people taking part in it now (told by
 * Publish, not left; an admin also sees anybody placed and not told, as on
 * the register) and its standing facilitators, who take part too, the draw's
 * own list (`readDrawPeople`). A record of anybody else (somebody who left,
 * or moved group) is never read into a pair, so nobody is shown a partner who
 * is no longer there.
 *
 * Every read is by id (`pairRecordId`), never a query, so none needs an
 * index; the deletions alone ask by `uid` or by `runId`, one equality each.
 */

/** Records per `getAll`, well under the read's own limit. */
const BATCH = 100;

/** The stored entries of these people in one group's pairs for one block, by uid. Missing and unreadable records are left out. */
export async function readPairRecords(
  db: Firestore,
  runId: string,
  groupId: string,
  blockId: string,
  uids: readonly string[],
): Promise<Map<string, CoursePairDoc>> {
  const out = new Map<string, CoursePairDoc>();
  const ids = [...new Set(uids)].map((uid) => pairRecordId(runId, groupId, uid, blockId));
  for (let at = 0; at < ids.length; at += BATCH) {
    const refs = ids.slice(at, at + BATCH).map((id) => db.collection(COURSE_PAIRS_COLLECTION).doc(id));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const record = normalizeCoursePair(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
      // The row's own fields must name what its id was built from.
      if (!record || record.runId !== runId || record.groupId !== groupId || record.blockId !== blockId) continue;
      out.set(record.uid, record);
    }
  }
  return out;
}

/** A record as the pairs read it. */
export function entryOfRecord(record: CoursePairDoc | null | undefined): PairEntry | null {
  return record ? { pair: record.pair, laptop: record.laptop } : null;
}

/** A group's week that asks for pairs, with every pair: what its facilitators, the lead and admins see. */
export type GroupPairs = {
  weekId: string;
  weekNumber: number;
  ask: PairsAsk;
  /** Each person's stored entry, by uid: what the pairs page's form starts from. */
  entries: Map<string, PairEntry>;
  view: PairsView<DrawPerson>;
};

/**
 * Every pair of a group for a week, for the people the group's pairs list.
 * Null when the week does not ask for pairs. The caller has asked its gate.
 */
export async function readGroupPairs(
  db: Firestore,
  runId: string,
  groupId: string,
  week: GroupWeek,
  people: readonly DrawPerson[],
): Promise<GroupPairs | null> {
  const ask = pairsAskOf(week.blocks);
  if (!ask) return null;
  const records = await readPairRecords(
    db,
    runId,
    groupId,
    ask.blockId,
    people.map((person) => person.uid),
  );
  const entries = new Map<string, PairEntry>();
  for (const [uid, record] of records) entries.set(uid, { pair: record.pair, laptop: record.laptop });
  return {
    weekId: week.weekId,
    weekNumber: week.weekNumber,
    ask,
    entries,
    view: pairsView(people, (uid) => entries.get(uid), ask.laptops),
  };
}

/**
 * THE PERSON'S OWN PAIRS for one week, one for each group they take part in
 * whose copy of the week asks for pairs and where they have a pair or a
 * laptop: the group their own place is in, and each live group they
 * facilitate (a facilitator takes part, and can be in a pair). Addressed by
 * the person's own uid: this cannot read anybody's but theirs and their
 * partners'. Empty when there is nothing to say.
 */
export async function readOwnPairs(
  db: Firestore,
  actor: SessionUser,
  runId: string,
  liveGroups: readonly CourseGroupDoc[],
  enrolment: CourseEnrolmentDoc | null,
  weekNumber: number,
  now: Date,
): Promise<OwnPair[]> {
  const placed =
    enrolment &&
    enrolment.role === "learner" &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    enrolment.uid === actor.uid &&
    enrolment.groupId
      ? (liveGroups.find((group) => group.id === enrolment.groupId) ?? null)
      : null;
  const taking: CourseGroupDoc[] = [];
  for (const group of [placed, ...liveGroups.filter((candidate) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", candidate.facilitatorUids))]) {
    if (group && !group.archived && group.runId === runId && !taking.some((seen) => seen.id === group.id)) taking.push(group);
  }

  const out: OwnPair[] = [];
  for (const group of taking) {
    const week = await readGroupWeek(db, runId, group.id, weekNumber);
    const ask = week ? pairsAskOf(week.blocks) : null;
    if (!week || !ask) continue;
    const own = entryOfRecord((await readPairRecords(db, runId, group.id, ask.blockId, [actor.uid])).get(actor.uid));
    if (!own || (own.pair === null && !(ask.laptops && own.laptop))) continue;

    // The group's people now: a partner who left, or moved group, is nobody's partner.
    const people = await readDrawPeople(db, runId, group, { isAdmin: false }, now);
    if (!people || !people.some((person) => person.uid === actor.uid)) continue;
    const groupPairs = await readGroupPairs(db, runId, group.id, week, people);
    if (!groupPairs) continue;
    const pair = pairOf(groupPairs.view, actor.uid);
    const partners = pair ? pair.people.filter((person) => person.uid !== actor.uid) : [];
    const bringing = ask.laptops && own.laptop;
    if (partners.length === 0 && !bringing) continue;
    out.push({
      blockId: ask.blockId,
      groupName: group.name.trim() || "Your group",
      laptops: ask.laptops,
      partners: partners.map((person) => person.firstName),
      bringing,
      partnersBringing: pair ? pair.laptops.filter((person) => person.uid !== actor.uid).map((person) => person.firstName) : [],
      askNames: people.filter((person) => person.facilitates && person.uid !== actor.uid).map((person) => person.firstName),
    });
  }
  return out;
}
