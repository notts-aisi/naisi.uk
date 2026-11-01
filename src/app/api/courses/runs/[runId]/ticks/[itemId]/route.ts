import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { weekOneDoorFor } from "@/lib/courses/weekOne/door";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekChecklistItems, weekSources } from "@/lib/courses/weekBlocks/reader";
import {
  WeekShutError,
  assertWeekTakesWork,
  logWork,
  ownLockSource,
  readRunForLock,
  weekStateIn,
} from "@/lib/courses/weekWork/own";
import { WEEK_SHUT } from "@/lib/courses/weekWork/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import {
  buildProgressWrite,
  courseProgressId,
  normalizeCourseProgress,
  type ProgressItemKind,
} from "@/lib/firestore/courseProgress";

/**
 * TICKING SOMETHING OFF A WEEK, OR UNTICKING IT: `PUT
 * /api/courses/runs/[runId]/ticks/[itemId]` with `{ weekId, completed }`.
 * Every tick there is goes through here: a reading, a pack's reading or a
 * checklist step, on any week of a run, on the week page, the programme home
 * and Home. A tick used to be written straight from the browser, which
 * `firestore.rules` could hold to the person's own row but never to a week
 * that locks when the group's session starts, and which left no record of an
 * untick. The rules now refuse a browser tick, so this is the only writer of
 * `completed` and `completedAt` on a `courseProgress` row.
 *
 * WHO: somebody the browser's tick admitted (an active seat on the run, told
 * its group by Publish, on an account in standing, a facilitator's seat
 * included), a facilitator of a live group of the run, who takes part as
 * themselves, and, in week 1 alone, somebody holding a place whom Publish
 * has not told yet, once week 1's door is open to them (Q35 B:
 * `weekOneDoorFor`, the one answer). Always their OWN row: its id is built
 * from the caller's uid, and nothing here can address anybody else's.
 *
 * WHAT. One of the week's sources or checklist items, on the week as this
 * person reads it (their group's own copy when it has one, the run's
 * otherwise), the kind of row worked out from where the item is and never
 * taken from the body. A rating, a comment, a private note or a moderation
 * stamp already on the row is kept exactly as stored.
 *
 * THE LOCK. On a week written as blocks, a week submitted or locked takes no
 * tick (`src/lib/courses/weekWork/`), asked inside the transaction that
 * writes. A week written before blocks never locks.
 *
 * THE LOG. A tick that changes something goes in the work log, a tick or an
 * untick, at the server's time; so does the completion's own time, which the
 * server stamps (a tick kept keeps its first time).
 *
 * Every refusal comes before anything is written: view-as first, the
 * session, the body, who is asking, then the item.
 */

type Params = { params: Promise<{ runId: string; itemId: string }> };

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;
/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;

const NOT_YOURS = "Only somebody taking part in this programme can tick its weeks.";
/** Week 1, to somebody its door is not open to (a holder who gave their place back, say). */
const WEEK_ONE_NOT_YOURS = "Week 1 isn’t open to you yet.";

export type TickAnswer = { ok: true; itemId: string; completed: boolean };

/** Thrown out of the transaction to refuse with a status. */
class TickRefusal extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { weekId?: unknown; completed?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say which week and whether it is done." }, { status: 400 });
  }
  const weekId = typeof body?.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week it is on, like "w03".' }, { status: 400 });
  }
  if (typeof body?.completed !== "boolean") {
    return NextResponse.json({ error: "Say whether it is done: { \"completed\": true } or false." }, { status: 400 });
  }
  const completed = body.completed;

  const { runId, itemId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(itemId)) {
    return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- Who: somebody taking part, for their own row ------------------------
  const [enrolSnap, groupSnap, run] = await Promise.all([
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
    readRunForLock(db, runId),
  ]);
  const enrolment = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  // The browser's tick: an active seat, told, on an account that stands (the
  // rules' `isEnrolledActive`). The seat is an authority written for an
  // approved account, so that account's standing is asked again here.
  const seated =
    enrolment !== null &&
    enrolment.status === "active" &&
    placementIsTold(enrolment) &&
    isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid);
  const liveGroups = groupSnap.docs.map((d) => normalizeCourseGroup(d.id, d.data() ?? {})).filter((g) => !g.archived);
  const facilitates = liveGroups.filter((g) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", g.facilitatorUids));
  // Week 1 before groups go out (Q35 B): through week 1's door, and in no other week.
  const beforeGroups = !seated && facilitates.length === 0 && weekNumber === 1 && (await weekOneDoorFor(db, actor, runId)).open;
  if (!seated && facilitates.length === 0 && !beforeGroups) {
    return NextResponse.json({ error: weekNumber === 1 ? WEEK_ONE_NOT_YOURS : NOT_YOURS }, { status: 403 });
  }

  // ---- What: a source or checklist item of the week as they read it --------
  const learner = seated && enrolment?.role === "learner" ? enrolment : null;
  const ownGroup =
    (learner?.groupId ? (liveGroups.find((g) => g.id === learner.groupId) ?? null) : null) ??
    (facilitates.length === 1 ? facilitates[0] : null);
  const { week } = await resolveWeekDoc(db, runId, beforeGroups ? null : (ownGroup?.id ?? null), weekId);
  let itemKind: ProgressItemKind | null = null;
  if (week && weekSources(week).some((source) => source.id === itemId)) itemKind = "material";
  else if (week && weekChecklistItems(week).some((item) => item.id === itemId)) itemKind = "checklist";
  if (!week || !itemKind) {
    return NextResponse.json({ error: `That isn’t on week ${weekNumber} any more. Reload the page.` }, { status: 404 });
  }
  const kind: ProgressItemKind = itemKind;
  const locks = isBlockWeek(week);
  const source = ownLockSource(run, liveGroups, actor.uid, learner);
  const now = new Date();
  const rowRef = db.collection("courseProgress").doc(courseProgressId(runId, actor.uid, itemId));

  try {
    await db.runTransaction(async (tx) => {
      const [rowSnap, state] = await Promise.all([
        tx.get(rowRef),
        locks ? weekStateIn(tx, db, { runId, uid: actor.uid, weekId, weekNumber, source, now }) : Promise.resolve(null),
      ]);
      // A week written as blocks that is submitted or locked takes no tick until it is reopened.
      if (state) assertWeekTakesWork(state.state);
      const stored = rowSnap.exists ? (rowSnap.data() ?? {}) : null;
      const current = stored ? normalizeCourseProgress(rowSnap.id, stored) : null;
      if (current && (current.uid !== actor.uid || current.runId !== runId || current.itemKind !== kind)) {
        throw new TickRefusal("That tick couldn’t be saved. Reload the page and try again.", 409);
      }
      tx.set(
        rowRef,
        buildProgressWrite({
          runId,
          uid: actor.uid,
          weekNumber,
          itemKind: kind,
          itemId,
          completed,
          // A completion keeps its first time; a new one is the server's.
          completedAt: completed ? (current?.completed && stored?.completedAt ? stored.completedAt : FieldValue.serverTimestamp()) : undefined,
          rating: current?.rating,
          publicComment: current?.publicComment,
          privateNote: current?.privateNote,
          // The moderation stamp, carried through exactly as stored.
          moderatedByUid: typeof stored?.moderatedByUid === "string" ? stored.moderatedByUid : undefined,
          moderatedAt: stored?.moderatedAt,
        }),
      );
      if ((current?.completed ?? false) !== completed) {
        logWork(tx, db, { runId, uid: actor.uid, weekId, weekNumber, kind: completed ? "tick" : "untick", itemKind: kind, itemId });
      }
    });
  } catch (err) {
    if (err instanceof TickRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof WeekShutError) return NextResponse.json({ error: WEEK_SHUT }, { status: 409 });
    console.error("[courses tick] write failed", runId, itemId, err);
    return NextResponse.json({ error: "That tick didn’t save. Check your connection and try again." }, { status: 500 });
  }

  const answer: TickAnswer = { ok: true, itemId, completed };
  return NextResponse.json(answer);
}
