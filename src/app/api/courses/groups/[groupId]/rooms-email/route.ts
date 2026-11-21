import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { pressTermRoomsEmail, previewTermRoomsEmail } from "@/lib/courses/termRoomsEmail/send";
import { REFUSAL } from "@/lib/courses/termRoomsEmail/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * EMAIL A GROUP WHERE EACH OF ITS SESSIONS STILL TO COME IS, BY HAND, from
 * the term's rooms page ("Email Group C its rooms"). Nothing else sends it:
 * saving rooms emails nobody, and no job calls this.
 *
 * POST `{ preview: true }`, or `{ emailCount, pressKey }`: the count the
 * dialog showed and a key the dialog made when it opened, so a second press
 * of the same dialog sends nothing (`./send.ts`).
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * Whoever may save rooms on that page: an admin, or the lead of the programme
 * that names the group's run (`programmeLedBy`, the room-only change's own
 * question). A facilitator, a track lead and everybody else are refused, and
 * a missing group, an archived one and somebody else's are one 403 for
 * everybody but an admin, so a group id says nothing. View-as is refused
 * first, then the session, then the body is checked before anything is read.
 *
 * ── WHAT IT ANSWERS ─────────────────────────────────────────────────────────
 * A preview: `{ ok, preview }`, who it goes to, one email exactly as it goes
 * and the limit a press would meet (`previewTermRoomsEmail`). A press:
 * `{ ok, already, said, emailed }`, or a refusal: 409 when no email goes for
 * the group or the count changed (with the new count), 429 at a limit.
 */

type Ctx = { params: Promise<{ groupId: string }> };

/** A press's key: made by the dialog when it opens. */
const PRESS_KEY = /^[A-Za-z0-9_-]{8,64}$/;

type Press = { preview: true } | { preview: false; emailCount: number; pressKey: string };

function parsePress(raw: unknown): Press | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (body.preview === true) return { preview: true };
  const { emailCount, pressKey } = body;
  if (typeof emailCount !== "number" || !Number.isInteger(emailCount) || emailCount < 1 || emailCount > 1000) return null;
  if (typeof pressKey !== "string" || !PRESS_KEY.test(pressKey)) return null;
  return { preview: false, emailCount, pressKey };
}

async function readRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!runId || !isAddressableId(runId)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  if (raw.destroying === true) return null;
  return normalizeCourseRun(snap.id, raw);
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The body is checked before any document is read.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }
  const press = parsePress(raw);
  if (!press) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate: an admin, or the programme's lead ─────────────────────────
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const found = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const isAdmin = actor.role === "admin";
  const run = found ? await readRun(db, found.runId) : null;
  const leads = !isAdmin && found && !found.archived && run ? (await programmeLedBy(db, actor, run.id)) !== null : false;
  if (!isAdmin && !leads) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!found || !run) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (found.archived) return NextResponse.json({ error: REFUSAL.gone }, { status: 400 });

  const now = new Date();
  if (press.preview) {
    const preview = await previewTermRoomsEmail(db, { run, group: found, actor, now });
    return NextResponse.json({ ok: true, preview });
  }
  const answer = await pressTermRoomsEmail(db, { run, group: found, actor, emailCount: press.emailCount, pressKey: press.pressKey, now });
  return NextResponse.json(answer.body, { status: answer.status, headers: answer.headers });
}
