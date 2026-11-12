import { NextResponse } from "next/server";
import { loadEditWeek, weekEditGate } from "@/lib/courses/weekEdit/gate";
import { heldByAnother, heldRefusal, holdIsLive, lockStateFor, readHold, weekLockRef } from "@/lib/courses/weekEdit/lock";
import { LOCK_WORDS } from "@/lib/courses/weekEdit/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ONE EDITOR AT A TIME, FOR ONE WEEK (`src/lib/courses/weekEdit/lock.ts`).
 *
 *   GET     the lock as the reader stands to it: free, theirs (since when,
 *           and how often to keep it alive), or somebody else's (their first
 *           name and since when, in the banner's words).
 *   POST    take it, when an edit opens: refused (409, naming the holder)
 *           while somebody else holds it; taking it again keeps the time it
 *           was first taken.
 *   PUT     keep it alive, while the edit is open: refused (409) once the
 *           hold has gone to somebody else or lapsed and been taken.
 *   DELETE  give it back, when the edit closes: nothing happens when the
 *           caller does not hold it.
 *
 * A hold not kept alive lapses by itself (`LOCK_TTL_MS`). Saves of the week by
 * anybody else are refused while it is live; reading the week never is.
 *
 * WHO: an admin or the lead of the programme that names the run
 * (`weekEditGate`); a view-as session is refused every write. No body is
 * read: what is taken is the caller's own hold on the week in the address.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

type Opened = { runId: string; weekId: string; uid: string; weekNumber: number };

/** The gate, then the week: the four methods' shared door. */
async function open(ctx: Params, db: NonNullable<ReturnType<typeof getAdminDb>>, actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>): Promise<Opened | NextResponse> {
  const { runId, weekId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  return { runId, weekId, uid: actor.uid, weekNumber: loaded.weekNumber };
}

export async function GET(_req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const opened = await open(ctx, db, actor);
  if (opened instanceof NextResponse) return opened;
  const snap = await weekLockRef(db, opened.runId, opened.weekId).get();
  return NextResponse.json({ lock: await lockStateFor(db, readHold(snap), opened.uid, opened.weekNumber, new Date()) });
}

export async function POST(_req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const opened = await open(ctx, db, actor);
  if (opened instanceof NextResponse) return opened;
  const ref = weekLockRef(db, opened.runId, opened.weekId);
  const now = new Date();
  const refused = await db.runTransaction(async (tx) => {
    const hold = readHold(await tx.get(ref));
    if (heldByAnother(hold, opened.uid, now)) return hold;
    const since = holdIsLive(hold, now) && hold.holderUid === opened.uid ? hold.since : now;
    tx.set(ref, { holderUid: opened.uid, since, keptAt: now, runId: opened.runId, weekId: opened.weekId });
    return null;
  });
  if (refused) return NextResponse.json(await heldRefusal(db, refused, opened.weekNumber), { status: 409 });
  const snap = await ref.get();
  return NextResponse.json({ lock: await lockStateFor(db, readHold(snap), opened.uid, opened.weekNumber, now) });
}

export async function PUT(_req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const opened = await open(ctx, db, actor);
  if (opened instanceof NextResponse) return opened;
  const ref = weekLockRef(db, opened.runId, opened.weekId);
  const now = new Date();
  const kept = await db.runTransaction(async (tx) => {
    const hold = readHold(await tx.get(ref));
    // Theirs, live or lapsed: a lapsed hold nobody else took is still theirs to keep.
    if (!hold || hold.holderUid !== opened.uid) return false;
    tx.update(ref, { keptAt: now });
    return true;
  });
  if (!kept) return NextResponse.json({ error: LOCK_WORDS.lost }, { status: 409 });
  const snap = await ref.get();
  return NextResponse.json({ lock: await lockStateFor(db, readHold(snap), opened.uid, opened.weekNumber, now) });
}

export async function DELETE(_req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const opened = await open(ctx, db, actor);
  if (opened instanceof NextResponse) return opened;
  const ref = weekLockRef(db, opened.runId, opened.weekId);
  await db.runTransaction(async (tx) => {
    const hold = readHold(await tx.get(ref));
    if (hold && hold.holderUid === opened.uid) tx.delete(ref);
  });
  // What the week's lock is now: free, or still somebody else's.
  const snap = await ref.get();
  return NextResponse.json({ lock: await lockStateFor(db, readHold(snap), opened.uid, opened.weekNumber, new Date()) });
}
