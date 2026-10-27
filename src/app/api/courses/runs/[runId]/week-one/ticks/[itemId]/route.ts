import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { weekOneDoorFor } from "@/lib/courses/weekOne/door";
import { weekChecklistItems, weekSources } from "@/lib/courses/weekBlocks/reader";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  buildProgressWrite,
  courseProgressId,
  normalizeCourseProgress,
  type ProgressItemKind,
} from "@/lib/firestore/courseProgress";
import { normalizeCourseWeek, weekDocId } from "@/lib/firestore/courses";

/**
 * TICKING WEEK 1 OFF BEFORE GROUPS GO OUT (Q35 B): `PUT
 * /api/courses/runs/[runId]/week-one/ticks/[itemId]` with `{ completed }`.
 *
 * Somebody taking part ticks client-direct (`courseProgress`, whose rules
 * hold the whole invariant: their own row, on a seat Publish has told them
 * about). Somebody holding a place whom Publish has not told yet has no such
 * seat, and the rules cannot ask whether they hold a place (that is worked
 * out from their application, their decision and the run, by the one test the
 * hand-over and Publish share). So their ticks come through this door, which
 * asks WEEK 1'S DOOR (`weekOneDoorFor`, the one answer) and nothing else, and
 * writes the same row the browser would: their own `courseProgress` row,
 * addressed by their own uid, in the shape `buildProgressWrite` builds. Once
 * Publish has told them, the browser writes the same row as before.
 *
 * WHAT. Only week 1 of this run, as the run holds it, and only one of its
 * sources or checklist items (the one reader of a week's content); the kind
 * of row is worked out from where the item is, never taken from the body.
 * A rating, a note or a moderation stamp already on the row is kept as it
 * is. Nothing else of the run is written.
 *
 * Every refusal comes before anything is written: view-as first, the
 * session, the body, then the door (one 403 for everybody it does not open
 * to), then the item.
 */

type Params = { params: Promise<{ runId: string; itemId: string }> };

const NOT_YOURS = "Week 1 isn’t open to you yet.";

export type WeekOneTickAnswer = { ok: true; itemId: string; completed: boolean };

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

  let body: { completed?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say whether it is done: { \"completed\": true } or false." }, { status: 400 });
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

  // The door, before anything of the run is written: the one answer.
  const door = await weekOneDoorFor(db, actor, runId);
  if (!door.open) return NextResponse.json({ error: NOT_YOURS }, { status: 403 });

  const weekRef = db.collection("courseRuns").doc(runId).collection("weeks").doc(weekDocId(1));
  const rowRef = db.collection("courseProgress").doc(courseProgressId(runId, actor.uid, itemId));

  try {
    await db.runTransaction(async (tx) => {
      const [weekSnap, rowSnap] = await Promise.all([tx.get(weekRef), tx.get(rowRef)]);
      const week = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
      // Which kind of thing it is, from where it is on week 1.
      let itemKind: ProgressItemKind | null = null;
      if (week && weekSources(week).some((source) => source.id === itemId)) itemKind = "material";
      else if (week && weekChecklistItems(week).some((item) => item.id === itemId)) itemKind = "checklist";
      if (!itemKind) throw new TickRefusal("That isn’t on week 1 any more. Reload the page.", 404);

      const stored = rowSnap.exists ? (rowSnap.data() ?? {}) : null;
      const current = stored ? normalizeCourseProgress(rowSnap.id, stored) : null;
      if (current && (current.uid !== actor.uid || current.runId !== runId || current.itemKind !== itemKind)) {
        throw new TickRefusal("That tick couldn’t be saved. Reload the page and try again.", 409);
      }
      tx.set(
        rowRef,
        buildProgressWrite({
          runId,
          uid: actor.uid,
          weekNumber: 1,
          itemKind,
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
    });
  } catch (err) {
    if (err instanceof TickRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses week one tick] write failed", runId, itemId, err);
    return NextResponse.json({ error: "That tick didn’t save. Check your connection and try again." }, { status: 500 });
  }

  const answer: WeekOneTickAnswer = { ok: true, itemId, completed };
  return NextResponse.json(answer);
}
