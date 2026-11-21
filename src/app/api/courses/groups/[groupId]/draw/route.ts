import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { drawWeekRule } from "@/lib/courses/packsAndCases/drawWeek";
import { countedPackTitlesOf, drawTalkOf, findPack, hasDraw, mayBeGiven } from "@/lib/courses/packsAndCases/model";
import {
  drawClosed,
  drawGate,
  hidesOwnPick,
  readDrawRoster,
  readGroupWeek,
  seesFacilitatorsOwnWork,
  talksFollowingAPick,
} from "@/lib/courses/packsAndCases/readers";
import {
  DRAW_NOT_SAVED,
  lateSaveChangesWords,
  lateSaveRefusedWords,
  ownCaseGivenByWords,
  weekStandingWords,
} from "@/lib/courses/packsAndCases/words";
import { resolveSessions } from "@/lib/courses/sessions";
import { isWeekItemId } from "@/lib/courses/weekBlocks/model";
import { closedWords } from "@/lib/courses/weekWork/words";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import {
  COURSE_PACKS_AND_CASES_COLLECTION,
  normalizeCoursePackCase,
  packCaseRecordId,
  type CoursePackCaseDoc,
} from "@/lib/firestore/coursePacksAndCases";

/**
 * THE DRAW, TYPED IN: `PUT`
 * with `{ weekId, entries: [{ uid, blockId, value, asked? }], confirmed? }` gives each person
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
 *    cases"), as the person's packs stand once this save is applied: a pack
 *    given out, or the pack they PICKED themselves, read in the same
 *    transaction (a pick is never typed in here; it is theirs to change);
 *  - a case with a content note only when that row's "Asked for this one"
 *    is ticked, sent with it in the same save (`asked: true`), for a
 *    facilitator, the lead and an admin alike; a case already held, left as
 *    it is, needs no tick again. The tick is not stored.
 * A case that follows a pick and is left as it is is not checked again: the
 * pick is never changed here, so somebody holding a case from a pick they
 * have since changed ("Their pick changed") keeps it until the facilitator
 * changes it, and a save touching the rest of their row goes through.
 * A FACILITATOR'S OWN PICK is their own work, read by the programme's lead
 * and admins only (`hidesOwnPick`): from the group's other facilitators the
 * case that follows it is refused whatever its value, before anything about
 * the pick is looked at, so the answer says nothing of it, and their save is
 * never checked against it.
 * A case changed or taken back clears the person's "Ready for my talk",
 * which was for the case they had.
 *
 * WHEN: until the programme closes for work (`workClosesAt`, the moment
 * every member's week turns read only); after it the draw is read only and a
 * save is refused 409 with the members' own sentence (`closedWords`). Before
 * it, a save into a week whose session has started or been held (its
 * standing in `drawWeekRule`, the one rule the page and the group page's
 * card ask too) needs `confirmed: true`, which the page sends only once the
 * facilitator has said yes to what Save asks: which week this is, then what
 * the save changes ("Changing a case takes back that person’s Ready for my
 * talk." on a week that gives out cases, `lateSaveChangesWords`); without it
 * the save is refused 409 with `confirm:
 * true` and `ask`, the lines the page's Save then asks, which week it is
 * first, so a page opened before the session started asks then. A week
 * still to come needs no yes.
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

type Entry = { uid: string; blockId: string; value: string | null; asked: boolean };

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
  let body: { weekId?: unknown; entries?: unknown; confirmed?: unknown };
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
    const entry = raw as { uid?: unknown; blockId?: unknown; value?: unknown; asked?: unknown } | null;
    const uid = typeof entry?.uid === "string" ? entry.uid : "";
    const blockId = typeof entry?.blockId === "string" ? entry.blockId : "";
    const value = entry?.value === null ? null : typeof entry?.value === "string" ? entry.value : undefined;
    if (
      !isAddressableId(uid) ||
      !isWeekItemId(blockId) ||
      value === undefined ||
      (value !== null && !isWeekItemId(value)) ||
      (entry?.asked !== undefined && typeof entry.asked !== "boolean")
    ) {
      return NextResponse.json({ error: "Each change names a person, what is given out and what they have." }, { status: 400 });
    }
    const key = `${uid} ${blockId}`;
    if (seen.has(key)) return NextResponse.json({ error: "Each person’s pack and case once per save." }, { status: 400 });
    seen.add(key);
    entries.push({ uid, blockId, value, asked: entry?.asked === true });
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
  const [roster, week] = await Promise.all([
    readDrawRoster(db, group.runId, group, { isAdmin: gate.isAdmin }, now),
    readGroupWeek(db, group.runId, groupId, weekNumber),
  ]);
  if (!roster) return NextResponse.json({ error: "That group isn’t on this programme." }, { status: 404 });
  const { people, run, closesAt } = roster;
  if (!week || !hasDraw(week.draw)) {
    return NextResponse.json({ error: `Nothing is given out in week ${weekNumber}. Reload the page.` }, { status: 404 });
  }

  // ---- When: read only once the programme closes ------------------------------
  if (closesAt && drawClosed(closesAt, now)) {
    return NextResponse.json({ error: closedWords(closesAt) }, { status: 409 });
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

  // A facilitator's own pick, and the case that follows it, are not a co-facilitator's to give: refused
  // before the pick is looked at. Whether the caller reads a facilitator's own work is asked only when it matters.
  const following = talksFollowingAPick(week.draw, week.blocks);
  const mayHide = following.size > 0 && people.some((person) => hidesOwnPick(person, { uid: actor.uid, seesOwnWork: false }));
  const viewer = { uid: actor.uid, seesOwnWork: mayHide ? await seesFacilitatorsOwnWork(db, actor, group, gate) : true };
  const hiddenUids = new Set(people.filter((person) => following.size > 0 && hidesOwnPick(person, viewer)).map((person) => person.uid));
  for (const entry of entries) {
    if (following.has(entry.blockId) && hiddenUids.has(entry.uid)) {
      const name = byUid.get(entry.uid)?.firstName ?? "They";
      return NextResponse.json({ error: ownCaseGivenByWords(name) }, { status: 403 });
    }
  }

  // A week whose session has started or been held: only with the facilitator's yes.
  const sessions = resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar);
  const facts = drawWeekRule({ sessions, givingWeeks: [weekNumber], now }).facts.get(weekNumber);
  if (facts && facts.standing !== "ahead" && facts.startsAt && body.confirmed !== true) {
    // What the page's Save asks, the route's own answer: which week this is first, then what the save changes.
    const ask = [
      weekStandingWords(weekNumber, facts.standing, facts.startsAt, facts.startsCalledOff),
      ...lateSaveChangesWords({ countedPackTitles: countedPackTitlesOf(week.blocks, week.draw), givesCases: week.draw.cases.length > 0 }),
    ];
    return NextResponse.json({ error: lateSaveRefusedWords(ask), confirm: true, ask }, { status: 409 });
  }

  const touched = [...new Set(entries.map((entry) => entry.uid))];
  // The Choose ones each person picks that the cases follow: read with the rest, never written here.
  const picksById = new Map(week.draw.picked.map((chooseOne) => [chooseOne.id, chooseOne]));
  const blocks = [...packsById.keys(), ...picksById.keys(), ...talks.keys()];
  const askedFor = new Set(entries.filter((entry) => entry.asked).map((entry) => `${entry.uid} ${entry.blockId}`));
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
        for (const [chooseOneId, chooseOne] of [...packsById, ...picksById]) {
          const packId = stored.get(`${uid} ${chooseOneId}`)?.packId ?? null;
          after.set(`${uid} ${chooseOneId}`, findPack(chooseOne, packId) ? packId : null);
        }
        for (const talkId of talks.keys()) after.set(`${uid} ${talkId}`, stored.get(`${uid} ${talkId}`)?.caseId ?? null);
      }
      for (const entry of entries) after.set(`${entry.uid} ${entry.blockId}`, entry.value);

      // Every case held by a touched person must be one their packs offer; one with a content note only
      // with the row's tick, or held already and left as it is. A case this caller may not give is not theirs to check.
      for (const uid of touched) {
        for (const [talkId, talk] of talks) {
          if (following.has(talkId) && hiddenUids.has(uid)) continue;
          const caseId = after.get(`${uid} ${talkId}`) ?? null;
          if (!caseId) continue;
          const held = caseId === (stored.get(`${uid} ${talkId}`)?.caseId ?? null);
          // A case that follows a pick, left as it is: the pick is never changed here, so a case held from a
          // pick since changed ("Their pick changed") stays until the facilitator changes it, and blocks nothing else.
          if (held && following.has(talkId)) continue;
          const asked = askedFor.has(`${uid} ${talkId}`) || held;
          if (!mayBeGiven(talk, caseId, (chooseOneId) => after.get(`${uid} ${chooseOneId}`) ?? null, { asked })) {
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
    return NextResponse.json({ error: DRAW_NOT_SAVED }, { status: 500 });
  }
}
