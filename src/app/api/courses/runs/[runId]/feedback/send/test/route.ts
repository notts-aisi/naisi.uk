import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { sendFeedbackTest, type FeedbackBatchModel } from "@/lib/courses/feedback/send";
import { ADMINS_ONLY, NO_RUN_HERE } from "@/lib/courses/feedback/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import type { FeedbackDelivery } from "@/lib/firestore/courseFeedback";

/**
 * "Send a test to me" beside "Send 6 emails" on a programme's Overview:
 * `POST /api/courses/runs/[runId]/feedback/send/test`. The email the first
 * person in the list would get, marked as a test, to the address on the
 * caller's own session and nobody else. A test that reaches them is
 * recorded, and only then, for a day, may they press.
 *
 * WHO MAY is who may press: an admin, asked of the session before anything
 * is read. WHERE IT GOES is never in the request, and a view-as session is
 * turned away first, because the address on it is the member's. It takes no
 * body.
 */

export type FeedbackTestAnswer = { ok: true; delivery: FeedbackDelivery; subject: string; model: FeedbackBatchModel };

export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: ADMINS_ONLY }, { status: 403 });

  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: NO_RUN_HERE }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await sendFeedbackTest(db, user, runId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const answer: FeedbackTestAnswer = { ok: true, delivery: outcome.delivery, subject: outcome.subject, model: outcome.model };
  return NextResponse.json(answer);
}
