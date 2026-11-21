import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { copyGroupIdFor } from "@/lib/courses/weekCopy";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { differsByWeek, sessionsByWeekGroup } from "@/lib/courses/groupsByWeek";
import { drawTalkOf, findCase, findPack, keyingChooseOne, talksOf } from "@/lib/courses/packsAndCases/model";
import { pickStaysWords } from "@/lib/courses/packsAndCases/words";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { resolveSessions } from "@/lib/courses/sessions";
import { dueMoment } from "@/lib/courses/weekBlocks/due";
import {
  allBlocks,
  isBlockWeek,
  isWeekItemId,
  type CasesBlock,
  type ChooseOneBlock,
  type WeekBlock,
} from "@/lib/courses/weekBlocks/model";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  COURSE_PACKS_AND_CASES_COLLECTION,
  normalizeCoursePackCase,
  packCaseRecordId,
} from "@/lib/firestore/coursePacksAndCases";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { workClosesAt } from "@/lib/courses/weekWork/closes";
import { WorkClosedError, assertWeekTakesWork, logWork, ownSessionSource, weekStateIn } from "@/lib/courses/weekWork/own";
import { closedWords } from "@/lib/courses/weekWork/words";
import { facilitatesOnRun } from "@/lib/courses/writtenAnswers/access";

/**
 * A PERSON'S OWN PACK AND TALK: `PUT` with `{ weekId, packId }` picks a
 * pack in a Choose one the person picks themselves, and with
 * `{ weekId, ready }` marks themselves ready for a talk, or not. Always
 * their OWN record: its id is built from the caller's own uid, and nothing
 * here can address anybody else's.
 *
 * WHO: somebody taking part, as the reflection boxes' route admits them: an
 * ACTIVE learner enrolment on this run, told its group by Publish, on an
 * account that stands; or a facilitator of a live group of this run, who
 * takes part as themselves (Zach, Mon 26 Oct 2026). Nobody picks or marks
 * for anybody else: not a facilitator, not the lead, not an admin. A pack a
 * facilitator gives out and the case they give are typed into the group page
 * (`/api/courses/groups/[groupId]/draw`), never here.
 *
 * A PICK can change until the person's session for the week starts (the
 * week's own, or the group's next one when it is cancelled): after that the
 * pack they read is the one the session was built on, and the facilitator's
 * draw gives packs out to whoever has not picked. This is the pick's own
 * rule, kept as it was when weeks stopped locking at the session. With no
 * group, and so no session, it stays open. A Choose one a facilitator gives
 * out is refused here: "To switch, ask Rahul or Sofia". The session for the
 * week is the group's they were in that week (`groupForWeek`), so somebody
 * moved from a later week picks until their old group's session that week.
 *
 * A PICK STAYS ONCE ITS CASE IS GIVEN: when the week's cases follow the
 * pick (a talk whose case groups name this Choose one's packs) and the
 * person holds a case from the pack they picked, a different pick is
 * refused, read in the same transaction that writes: "Your case has been
 * given, so your pathway stays as it is. To switch, ask Rahul." Whom to ask
 * is named as their week page names them (`askToSwap` in the overview: their
 * own group's facilitators other than themselves, by first name). Somebody
 * who facilitates a live group of the run, the one they take part in or
 * another, is named nobody: a case that follows their own pick is theirs, the
 * lead's or an admin's to change, never a facilitator's of their group
 * (`askToSwapPicked` in the overview, the same rule), and somebody who
 * facilitates the group they take part in takes it back themselves on the
 * pathways and cases page. A facilitator who takes the case back frees the
 * pick again.
 *
 * READY is the person's own mark and nobody else's: coursework gets no mark.
 * On a talk with cases it waits for a case to be given; a talk with none (a
 * pitch) can be marked any time. It can be taken back.
 *
 * THE WEEK STAYS OPEN (`src/lib/courses/weekWork/`): beyond the pick's own
 * rule, either is refused only once the programme has closed, asked inside
 * the transaction that writes. A ready mark after the session is late, told
 * from its own time. A pick goes in the work log as a save, a ready mark as a
 * tick or an untick.
 *
 * Which week: the person's group's own copy when it has one, the run's
 * otherwise (`resolveWeekDoc`), as the week page and the reflections route
 * read it. The block must be a Choose one or a talk of that week.
 */

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;
/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

/** Thrown out of the transaction to refuse with a status. */
class PickError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Thrown out of the transaction when a case that follows the pick has been given: the words need names read after. */
class PickStaysError extends Error {}

/**
 * Whom a person asks to switch, as their week page names them: the first
 * names of their own group's facilitators other than themselves (the
 * overview's `askToSwap`). Read only to refuse.
 */
async function askNamesFor(db: Firestore, group: CourseGroupDoc | null, uid: string): Promise<string[]> {
  const uids = (group?.facilitatorUids ?? []).filter((each) => each !== uid);
  if (uids.length === 0) return [];
  const docs = await db.getAll(...uids.map((each) => db.collection("users").doc(each)));
  return docs
    .filter((doc) => doc.exists)
    .map((doc) => displayNameOf(doc.data() ?? {}).trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

export type PackCaseWire = {
  blockId: string;
  weekId: string;
  packId: string | null;
  caseId: string | null;
  ready: boolean;
};

export async function PUT(req: Request, ctx: { params: Promise<{ runId: string; blockId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, blockId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(blockId)) {
    return NextResponse.json({ error: "That isn’t on this programme." }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { weekId?: unknown; packId?: unknown; ready?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the week, and the pack you chose or whether you’re ready." }, { status: 400 });
  }
  if (!isWeekItemId(blockId)) {
    return NextResponse.json({ error: "That isn’t on this programme." }, { status: 404 });
  }
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week it is on, like "w03".' }, { status: 400 });
  }
  const hasPack = body.packId !== undefined;
  const hasReady = body.ready !== undefined;
  if (hasPack === hasReady) {
    return NextResponse.json({ error: "Send either the pack you chose or whether you’re ready, not both." }, { status: 400 });
  }
  const packId = typeof body.packId === "string" ? body.packId : "";
  if (hasPack && !isWeekItemId(packId)) {
    return NextResponse.json({ error: "Say which pack you chose." }, { status: 400 });
  }
  if (hasReady && typeof body.ready !== "boolean") {
    return NextResponse.json({ error: "Say whether you’re ready: true or false." }, { status: 400 });
  }
  const ready = body.ready === true;

  // ---- Who: somebody taking part, for their own record ----------------------
  const [runSnap, enrolSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
  ]);
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
    return NextResponse.json({ error: "That isn’t on this programme." }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const enrolment = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  const takesPart =
    enrolment !== null &&
    enrolment.status === "active" &&
    enrolment.role === "learner" &&
    // The enrolment row is an authority written for an approved account, so
    // that account's standing is asked again here.
    isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid) &&
    // A placement Publish has not told its owner about opens nothing yet.
    placementIsShownTo(enrolment, { isAdmin: actor.role === "admin" });
  // Archived groups staff nobody, as everywhere else.
  const liveGroups = groupSnap.docs.map((d) => normalizeCourseGroup(d.id, d.data() ?? {})).filter((g) => !g.archived);
  const facilitates = liveGroups.filter((g) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", g.facilitatorUids));
  if (!takesPart && facilitates.length === 0) {
    return NextResponse.json(
      { error: "Only somebody taking part in this programme can choose a pack or mark themselves ready." },
      { status: 403 },
    );
  }

  // ---- Which block: a Choose one or a talk of the week as they read it -------
  const ownGroup =
    (takesPart && enrolment?.groupId ? (liveGroups.find((g) => g.id === enrolment.groupId) ?? null) : null) ??
    (facilitates.length === 1 ? facilitates[0] : null);
  // The copy of the week: the group their place belonged to in THIS week
  // (`copyGroupIdFor`), so somebody moved mid-term works in the copy they
  // saw, whether or not that group still meets.
  const copyGroupId =
    takesPart && enrolment?.groupId ? copyGroupIdFor(enrolment, weekNumber, ownGroup?.id ?? null) : (ownGroup?.id ?? null);
  const { week } = await resolveWeekDoc(db, runId, copyGroupId, weekId);
  const block = week && isBlockWeek(week) ? (allBlocks(week.blocks).find((candidate) => candidate.id === blockId) ?? null) : null;

  const ref = db.collection(COURSE_PACKS_AND_CASES_COLLECTION).doc(packCaseRecordId(runId, actor.uid, blockId));
  const base = { runId, uid: actor.uid, weekId, weekNumber, blockId };
  // Whose sessions lock this week for them: their own placement's group, or the groups they facilitate.
  const source = ownSessionSource(run, liveGroups, actor.uid, takesPart ? enrolment : null);
  const closesAt = workClosesAt(run, liveGroups);
  const now = new Date();
  const logged = { runId, uid: actor.uid, weekId, weekNumber, itemId: blockId };

  if (hasPack) {
    const chooseOne = block?.type === "chooseOne" ? (block as ChooseOneBlock) : null;
    if (!chooseOne) {
      return NextResponse.json({ error: "That choice isn’t on this week any more. Reload the page." }, { status: 404 });
    }
    if (chooseOne.givenBy !== "fellow") {
      return NextResponse.json(
        { error: "Your facilitators give these out. To switch, ask one of them." },
        { status: 403 },
      );
    }
    if (!findPack(chooseOne, packId)) {
      return NextResponse.json({ error: "That one isn’t on this week any more. Reload the page." }, { status: 404 });
    }
    // Open until the session starts: the week's own, or the next one when it
    // is cancelled. Each week's session is the group's they were in that week
    // (`sessionsByWeekGroup`, a one-week visit's host for its week) when their place records a move or a visit; otherwise the
    // group's whose copy they read, as always.
    const ownSessions = !ownGroup
      ? null
      : takesPart && enrolment && ownGroup.id === enrolment.groupId && differsByWeek(enrolment)
        ? sessionsByWeekGroup(enrolment, (groupId) => {
            const group = liveGroups.find((each) => each.id === groupId);
            return group ? resolveSessions(run, group) : null;
          })
        : resolveSessions(run, ownGroup);
    const startsAt = ownSessions ? dueMoment(ownSessions, weekNumber, "before") : null;
    if (startsAt && Date.now() >= startsAt.at.getTime()) {
      return NextResponse.json({ error: "Your session has started, so your choice stays as it is." }, { status: 409 });
    }
    // The talks whose cases follow this pick, and the person's record in each: read in the transaction.
    const blocks: readonly WeekBlock[] = week && isBlockWeek(week) ? week.blocks : [];
    const following = talksOf(blocks).filter((talk) => keyingChooseOne(blocks, talk)?.id === chooseOne.id);
    const talkRef = (talkId: string) => db.collection(COURSE_PACKS_AND_CASES_COLLECTION).doc(packCaseRecordId(runId, actor.uid, talkId));
    try {
      await db.runTransaction(async (tx) => {
        const [state, snaps] = await Promise.all([
          weekStateIn(tx, db, { runId, uid: actor.uid, weekId, weekNumber, source, closesAt, now }),
          following.length > 0 ? tx.getAll(ref, ...following.map((talk) => talkRef(talk.id))) : Promise.resolve([]),
        ]);
        assertWeekTakesWork(state.state);
        if (following.length > 0) {
          const [packSnap, ...talkSnaps] = snaps;
          const stored = packSnap?.exists ? normalizeCoursePackCase(packSnap.id, packSnap.data() ?? {}) : null;
          const current = stored && stored.runId === runId ? (findPack(chooseOne, stored.packId)?.id ?? null) : null;
          if (current && current !== packId) {
            // A case given from the pack they picked: the pick stays until it is taken back.
            const held = following.some((talk, at) => {
              const snap = talkSnaps[at];
              const record = snap?.exists ? normalizeCoursePackCase(snap.id, snap.data() ?? {}) : null;
              if (!record || record.runId !== runId || !record.caseId) return false;
              const given = drawTalkOf(blocks, talk).groups.find((group) => group.cases.some((item) => item.id === record.caseId));
              return given !== undefined && given.packId === current;
            });
            if (held) throw new PickStaysError();
          }
        }
        tx.set(
          ref,
          { ...base, kind: "pack", packId, givenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        logWork(tx, db, { ...logged, kind: "save", itemKind: "pack" });
      });
    } catch (err) {
      if (err instanceof WorkClosedError) return NextResponse.json({ error: closedWords(err.at) }, { status: 409 });
      if (err instanceof PickStaysError) {
        // Somebody who facilitates a live group of the run, this one or another, asks nobody: the case that
        // follows their own pick is theirs, the lead's or an admin's to change, never their group's facilitators'.
        const ownCase = ownGroup !== null && facilitatesOnRun(actor.uid, liveGroups);
        const names = ownCase ? [] : await askNamesFor(db, ownGroup, actor.uid).catch(() => []);
        return NextResponse.json({ error: pickStaysWords(chooseOne.title, names) }, { status: 409 });
      }
      console.error("[courses packs and cases] pick failed", runId, weekId, blockId, err);
      return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
    }
    const answer: PackCaseWire = { blockId, weekId, packId, caseId: null, ready: false };
    return NextResponse.json({ ok: true, record: answer });
  }

  const talk = block?.type === "cases" ? (block as CasesBlock) : null;
  if (!talk) {
    return NextResponse.json({ error: "That talk isn’t on this week any more. Reload the page." }, { status: 404 });
  }
  const hasCases = talk.groups.some((group) => group.cases.length > 0);
  try {
    const answer = await db.runTransaction(async (tx) => {
      const [snap, week] = await Promise.all([
        tx.get(ref),
        weekStateIn(tx, db, { runId, uid: actor.uid, weekId, weekNumber, source, closesAt, now }),
      ]);
      assertWeekTakesWork(week.state);
      const stored = snap.exists ? normalizeCoursePackCase(snap.id, snap.data() ?? {}) : null;
      const caseId = stored && findCase(talk, stored.caseId) ? stored.caseId : null;
      // On a talk with cases, "ready" is for the case you were given.
      if (ready && hasCases && !caseId) throw new PickError("You haven’t been given a case yet.", 409);
      tx.set(
        ref,
        {
          ...base,
          kind: "talk",
          ready,
          readyAt: ready ? FieldValue.serverTimestamp() : null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      if ((stored?.ready ?? false) !== ready) logWork(tx, db, { ...logged, kind: ready ? "tick" : "untick", itemKind: "talk" });
      const wire: PackCaseWire = { blockId, weekId, packId: null, caseId, ready };
      return wire;
    });
    return NextResponse.json({ ok: true, record: answer });
  } catch (err) {
    if (err instanceof PickError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof WorkClosedError) return NextResponse.json({ error: closedWords(err.at) }, { status: 409 });
    console.error("[courses packs and cases] ready failed", runId, weekId, blockId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }
}
