import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { drawTalkOf, findPack, hasDraw, mayBeGiven } from "@/lib/courses/packsAndCases/model";
import { drawGate, readDrawPeople, readGroupWeek } from "@/lib/courses/packsAndCases/readers";
import { isWeekItemId } from "@/lib/courses/weekBlocks/model";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import {
  COURSE_PACKS_AND_CASES_COLLECTION,
  normalizeCoursePackCase,
  packCaseRecordId,
  type CoursePackCaseDoc,
} from "@/lib/firestore/coursePacksAndCases";

/**
 * THE DRAW, TYPED IN (plan item 8; Q32 A; board wk-cases, option A): `PUT`
 * with `{ weekId, entries: [{ uid, blockId, value }] }` gives each person
 * named a pack in a Choose one a facilitator gives out, or a case in a talk
 * they give out, or takes one back (`value: null`, "Not given yet"). At the
 * end of a session the facilitator hands out next week's packs and cases on
 * paper, then copies the slips in here; swaps go through them too ("To swap,
 * a fellow asks Rahul or Sofia, who move people here"). Only what changed is
 * sent, so two facilitators copying slips in at once overwrite only the
 * people both of them changed.
 *
 * WHO (`drawGate`): the group's live facilitators, the lead of the programme
 * that names the run, and admins. Not another group's facilitator, not the
 * run's track leads, not a reviewer, not a fellow. View-as is refused first.
 *
 * WHAT MAY BE GIVEN, checked against the week the group reads (its own copy
 * when it has one, the run's otherwise) and the people in its draw (the
 * group's people taking part, and its facilitators, who take part too):
 *  - a pack of the Choose one named, which a facilitator gives out;
 *  - a case of the talk named, from the person's pack's cases when the cases
 *    are grouped by pack ("Each case list only offers that pathway's
 *    cases"), as the person's packs stand once this save is applied;
 *  - never a case with a content note: it stays out of the draw.
 * A case changed or taken back clears the person's "Ready for my talk",
 * which was for the case they had.
 *
 * Nobody is emailed ("Each person sees theirs on their week 3 page. No
 * email."). The body is checked before anything is read; everything is
 * checked before anything is written, and the writes are one transaction.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;
/** A group's people times a week's blocks given out, with room to spare, under a transaction's 500 writes. */
const MAX_ENTRIES = 400;

class DrawError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Entry = { uid: string; blockId: string; value: string | null };

export type DrawSaved = {
  ok: true;
  /** How many packs and cases changed. */
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
  let body: { weekId?: unknown; entries?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the week and who has which." }, { status: 400 });
  }
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week the draw is for, like "w03".' }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: "Send who has which: at least one change." }, { status: 400 });
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const raw of body.entries) {
    const entry = raw as { uid?: unknown; blockId?: unknown; value?: unknown } | null;
    const uid = typeof entry?.uid === "string" ? entry.uid : "";
    const blockId = typeof entry?.blockId === "string" ? entry.blockId : "";
    const value = entry?.value === null ? null : typeof entry?.value === "string" ? entry.value : undefined;
    if (!isAddressableId(uid) || !isWeekItemId(blockId) || value === undefined || (value !== null && !isWeekItemId(value))) {
      return NextResponse.json({ error: "Each change names a person, what is given out and what they have." }, { status: 400 });
    }
    const key = `${uid} ${blockId}`;
    if (seen.has(key)) return NextResponse.json({ error: "Each person’s pack and case once per save." }, { status: 400 });
    seen.add(key);
    entries.push({ uid, blockId, value });
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

  // ---- What may be given, to whom --------------------------------------------
  const now = new Date();
  const [people, week] = await Promise.all([
    readDrawPeople(db, group.runId, group, { isAdmin: gate.isAdmin }, now),
    readGroupWeek(db, group.runId, groupId, weekNumber),
  ]);
  if (!people) return NextResponse.json({ error: "That group isn’t on this programme." }, { status: 404 });
  if (!week || !hasDraw(week.draw)) {
    return NextResponse.json({ error: `Nothing is given out in week ${weekNumber}. Reload the page.` }, { status: 404 });
  }
  const byUid = new Map(people.map((person) => [person.uid, person]));
  const packsById = new Map(week.draw.packs.map((chooseOne) => [chooseOne.id, chooseOne]));
  const talks = new Map(week.draw.cases.map((talk) => [talk.id, drawTalkOf(week.blocks, talk)]));
  for (const entry of entries) {
    const person = byUid.get(entry.uid);
    if (!person) {
      return NextResponse.json({ error: `Somebody you named isn’t in ${groupName} any more. Reload the page.` }, { status: 409 });
    }
    const chooseOne = packsById.get(entry.blockId);
    if (chooseOne) {
      if (entry.value !== null && !findPack(chooseOne, entry.value)) {
        return NextResponse.json({ error: `That isn’t one of week ${weekNumber}’s choices. Reload the page.` }, { status: 400 });
      }
      continue;
    }
    if (!talks.has(entry.blockId)) {
      return NextResponse.json({ error: `That isn’t given out in week ${weekNumber}. Reload the page.` }, { status: 400 });
    }
  }

  const touched = [...new Set(entries.map((entry) => entry.uid))];
  const blocks = [...packsById.keys(), ...talks.keys()];
  const ref = (uid: string, blockId: string) =>
    db.collection(COURSE_PACKS_AND_CASES_COLLECTION).doc(packCaseRecordId(group.runId, uid, blockId));

  try {
    const saved = await db.runTransaction(async (tx) => {
      const refs = touched.flatMap((uid) => blocks.map((blockId) => ref(uid, blockId)));
      const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
      const stored = new Map<string, CoursePackCaseDoc>();
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const record = normalizeCoursePackCase(snap.id, snap.data() ?? {});
        if (record && record.runId === group.runId) stored.set(`${record.uid} ${record.blockId}`, record);
      }
      // Each touched person's packs and cases as they stand once this save is applied.
      const after = new Map<string, string | null>();
      for (const uid of touched) {
        for (const blockId of blocks) after.set(`${uid} ${blockId}`, null);
        for (const [chooseOneId, chooseOne] of packsById) {
          const packId = stored.get(`${uid} ${chooseOneId}`)?.packId ?? null;
          after.set(`${uid} ${chooseOneId}`, findPack(chooseOne, packId) ? packId : null);
        }
        for (const talkId of talks.keys()) after.set(`${uid} ${talkId}`, stored.get(`${uid} ${talkId}`)?.caseId ?? null);
      }
      for (const entry of entries) after.set(`${entry.uid} ${entry.blockId}`, entry.value);

      // Every case held by a touched person must be one their packs offer.
      for (const uid of touched) {
        for (const [talkId, talk] of talks) {
          const caseId = after.get(`${uid} ${talkId}`) ?? null;
          if (!caseId) continue;
          if (!mayBeGiven(talk, caseId, (chooseOneId) => after.get(`${uid} ${chooseOneId}`) ?? null)) {
            const name = byUid.get(uid)?.name ?? "Somebody";
            throw new DrawError(`${name}’s case isn’t one their list offers. Choose one of its cases, or leave it not given yet.`, 400);
          }
        }
      }

      let count = 0;
      for (const entry of entries) {
        const before = stored.get(`${entry.uid} ${entry.blockId}`) ?? null;
        const base = { runId: group.runId, uid: entry.uid, weekId, weekNumber, blockId: entry.blockId };
        if (packsById.has(entry.blockId)) {
          if ((before?.packId ?? null) === entry.value) continue;
          tx.set(
            ref(entry.uid, entry.blockId),
            { ...base, kind: "pack", packId: entry.value, givenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
        } else {
          if ((before?.caseId ?? null) === entry.value) continue;
          // A new case, or none: the ready mark was for the case they had.
          tx.set(
            ref(entry.uid, entry.blockId),
            {
              ...base,
              kind: "talk",
              caseId: entry.value,
              ready: false,
              readyAt: null,
              givenAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        count += 1;
      }
      return count;
    });
    const answer: DrawSaved = { ok: true, saved };
    return NextResponse.json(answer);
  } catch (err) {
    if (err instanceof DrawError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses draw] save failed", groupId, weekId, err);
    return NextResponse.json({ error: "Couldn’t save the draw just now. Try again." }, { status: 500 });
  }
}
