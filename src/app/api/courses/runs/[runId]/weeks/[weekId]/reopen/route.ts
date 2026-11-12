import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { readRunForWork } from "@/lib/courses/weekWork/own";
import { NOT_A_SUBMIT_WEEK, WEEKS_STAY_OPEN } from "@/lib/courses/weekWork/words";
import { liveGroupsOf, ownerFactsOf, reviewerFactsOf, writtenReviewRole } from "@/lib/courses/writtenAnswers/access";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * REOPENING ONE PERSON'S WEEK: GONE (the week stays open). Nothing locks at
 * the session or at a send, so there is nothing to reopen: every week takes
 * work until the programme closes. `POST
 * /api/courses/runs/[runId]/weeks/[weekId]/reopen` with `{ uid }` stays for a
 * page opened before, and answers plainly that weeks no longer lock
 * (`WEEKS_STAY_OPEN`), with `ok`, so the old page reads no error.
 *
 * IT WRITES NOTHING: no week record, no answer, no work log row, no audit
 * row. The reopen facts already stored (`reopenedAt` and the rest on
 * `courseWeekWork` and on an answer) are left as they are, and change nothing.
 *
 * WHO is asked as before, so the answer says nothing new about whose week
 * exists: the one gate on whose work a reader may act on
 * (`writtenReviewRole`): for somebody placed in a group, its facilitators,
 * the programme's lead and admins; for a facilitator's own week, the lead and
 * admins. Every refusal is the same 403. View-as is refused first, as on
 * every route of this tree that answers a press.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type ReopenWeekAnswer = { ok: true; message: string };

export async function POST(req: Request, ctx: { params: Promise<{ runId: string; weekId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { uid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say whose week to reopen." }, { status: 400 });
  }
  const uid = typeof body?.uid === "string" ? body.uid : "";
  if (!isAddressableId(uid)) return NextResponse.json({ error: "Say whose week to reopen." }, { status: 400 });

  const { runId, weekId } = await ctx.params;
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (!isAddressableId(runId) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: NOT_A_SUBMIT_WEEK }, { status: 404 });
  }

  // ---- The gate, as before: nothing of the person's is read -------------------
  const run = await readRunForWork(db, runId);
  const liveGroups = run ? await liveGroupsOf(db, runId) : [];
  const facts = await reviewerFactsOf(db, actor, runId);
  const owner = run ? await ownerFactsOf(db, runId, uid, liveGroups, { isAdmin: facts.isAdmin }) : null;
  const role = owner ? writtenReviewRole(actor, facts, owner, liveGroups) : null;
  if (!run || !owner || !role?.mayReview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Nothing locks, so nothing is reopened, and nothing is written.
  const answer: ReopenWeekAnswer = { ok: true, message: WEEKS_STAY_OPEN };
  return NextResponse.json(answer);
}
