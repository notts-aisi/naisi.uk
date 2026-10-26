import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { drawGate, readDrawPeople, readGroupWeek } from "@/lib/courses/packsAndCases/readers";
import { isPairNumber, pairsAskOf, pairsView, sizeProblemIn, type PairEntry } from "@/lib/courses/pairs/model";
import { aloneRefusalWords, noPairsThisWeekWords, tooManyRefusalWords } from "@/lib/courses/pairs/words";
import { isWeekItemId } from "@/lib/courses/weekBlocks/model";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { COURSE_PAIRS_COLLECTION, normalizeCoursePair, pairRecordId } from "@/lib/firestore/coursePairs";

/**
 * PAIRS FOR A SESSION IN PAIRS, TYPED IN (Technical AI Safety's hands-on
 * night): `PUT` with `{ weekId, blockId, entries: [{ uid, pair, laptop }] }`
 * puts each person named in a pair (a number, or null for not paired yet)
 * and says whether they are bringing a laptop. Only what changed is sent, so
 * two facilitators pairing people at once overwrite only the people both of
 * them changed.
 *
 * WHO (`drawGate`, the draw's own gate, since pairs are typed by the same
 * people): the group's live facilitators, the lead of the programme that
 * names the run, and admins. Not another group's facilitator, not the run's
 * track leads, not a reviewer, not a fellow. View-as is refused first.
 *
 * WHAT IS CHECKED, against the week the group reads (its own copy when it
 * has one, the run's otherwise) and the people in the group's pairs (its
 * people taking part and its facilitators, who take part too, so a
 * facilitator can pair themselves):
 *  - the week asks for pairs, in the session the page was opened on;
 *  - everybody named is in the group's pairs now;
 *  - "bringing a laptop" only on a week that asks about laptops;
 *  - every pair the save touches (one a person leaves, or joins) ends with
 *    two or three people in it, or nobody. At least one laptop per pair is
 *    never checked here: the page shows it as a check, and saves.
 *
 * Nobody is emailed. The body is checked before anything is read; everything
 * is checked before anything is written, and the writes are one transaction.
 * A person with no pair and no laptop keeps no record.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;
/** A group's people, with room to spare, under a transaction's 500 writes. */
const MAX_ENTRIES = 100;

class PairsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Entry = { uid: string; pair: number | null; laptop: boolean };

export type PairsSaved = {
  ok: true;
  /** How many people's pair or laptop changed. */
  saved: number;
};

export async function PUT(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "That group isn’t on this programme." }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { weekId?: unknown; blockId?: unknown; entries?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the week and who is in which pair." }, { status: 400 });
  }
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week the pairs are for, like "w05".' }, { status: 400 });
  }
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  if (!isWeekItemId(blockId)) {
    return NextResponse.json({ error: "Say which session the pairs are for. Reload the page." }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: "Send who is in which pair: at least one change." }, { status: 400 });
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const raw of body.entries) {
    const entry = raw as { uid?: unknown; pair?: unknown; laptop?: unknown } | null;
    const uid = typeof entry?.uid === "string" ? entry.uid : "";
    const pair = entry?.pair === null ? null : isPairNumber(entry?.pair) ? entry.pair : undefined;
    const laptop = typeof entry?.laptop === "boolean" ? entry.laptop : undefined;
    if (!isAddressableId(uid) || pair === undefined || laptop === undefined) {
      return NextResponse.json(
        { error: "Each change names a person, their pair and whether they’re bringing a laptop." },
        { status: 400 },
      );
    }
    if (seen.has(uid)) return NextResponse.json({ error: "Each person once per save." }, { status: 400 });
    seen.add(uid);
    entries.push({ uid, pair, laptop });
  }

  // ---- Who: the group's live facilitators, the programme's lead, admins -----
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "That group isn’t on this programme." }, { status: 404 });
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  const gate = await drawGate(db, actor, group);
  if (!gate.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const groupName = group.name.trim() || "This group";
  if (group.archived) {
    return NextResponse.json({ error: `${groupName} is archived, so nothing on it changes.` }, { status: 409 });
  }

  // ---- The week, and who is in the group's pairs ----------------------------
  const now = new Date();
  const [people, week] = await Promise.all([
    readDrawPeople(db, group.runId, group, { isAdmin: gate.isAdmin }, now),
    readGroupWeek(db, group.runId, groupId, weekNumber),
  ]);
  if (!people) return NextResponse.json({ error: "That group isn’t on this programme." }, { status: 404 });
  const ask = week ? pairsAskOf(week.blocks) : null;
  if (!ask) return NextResponse.json({ error: `${noPairsThisWeekWords(weekNumber)} Reload the page.` }, { status: 404 });
  if (ask.blockId !== blockId) {
    return NextResponse.json({ error: `Week ${weekNumber} has changed since you opened this page. Reload it.` }, { status: 409 });
  }
  const byUid = new Map(people.map((person) => [person.uid, person]));
  for (const entry of entries) {
    if (!byUid.has(entry.uid)) {
      return NextResponse.json({ error: `Somebody you named isn’t in ${groupName} any more. Reload the page.` }, { status: 409 });
    }
    if (entry.laptop && !ask.laptops) {
      return NextResponse.json({ error: `Week ${weekNumber} doesn’t ask who is bringing a laptop. Reload the page.` }, { status: 400 });
    }
  }

  const ref = (uid: string) => db.collection(COURSE_PAIRS_COLLECTION).doc(pairRecordId(group.runId, groupId, uid, blockId));

  try {
    const saved = await db.runTransaction(async (tx) => {
      // Everybody's entry as stored, so a pair a save touches is checked whole.
      const snaps = await tx.getAll(...people.map((person) => ref(person.uid)));
      const stored = new Map<string, PairEntry>();
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const record = normalizeCoursePair(snap.id, snap.data() ?? {});
        if (record && record.runId === group.runId && record.groupId === groupId && record.blockId === blockId) {
          stored.set(record.uid, { pair: record.pair, laptop: record.laptop });
        }
      }
      // The pairs as they stand once this save is applied, and the pairs it touches.
      const after = new Map(stored);
      const touched = new Set<number>();
      for (const entry of entries) {
        const before = stored.get(entry.uid)?.pair ?? null;
        if (before !== null) touched.add(before);
        if (entry.pair !== null) touched.add(entry.pair);
        after.set(entry.uid, { pair: entry.pair, laptop: entry.laptop });
      }
      const problem = sizeProblemIn(pairsView(people, (uid) => after.get(uid), ask.laptops), touched);
      if (problem) {
        throw new PairsError(
          problem.kind === "alone"
            ? aloneRefusalWords(problem.pair.number, problem.pair.people[0]?.firstName || "that person")
            : tooManyRefusalWords(problem.pair.number, problem.pair.people.length),
          400,
        );
      }

      let count = 0;
      for (const entry of entries) {
        const before = stored.get(entry.uid) ?? null;
        if ((before?.pair ?? null) === entry.pair && (before?.laptop ?? false) === entry.laptop) continue;
        if (entry.pair === null && !entry.laptop) {
          // Not paired and no laptop: nothing to keep.
          tx.delete(ref(entry.uid));
        } else {
          tx.set(ref(entry.uid), {
            runId: group.runId,
            groupId,
            uid: entry.uid,
            weekId,
            weekNumber,
            blockId,
            pair: entry.pair,
            laptop: entry.laptop,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        count += 1;
      }
      return count;
    });
    const answer: PairsSaved = { ok: true, saved };
    return NextResponse.json(answer);
  } catch (err) {
    if (err instanceof PairsError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses pairs] save failed", groupId, weekId, err);
    return NextResponse.json({ error: "Couldn’t save the pairs just now. Try again." }, { status: 500 });
  }
}
