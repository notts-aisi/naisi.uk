import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { sendFeedbackBatch, type FeedbackBatchModel } from "@/lib/courses/feedback/send";
import { ADMINS_ONLY, NOTHING_TICKED, NO_RUN_HERE, type FeedbackSendReport } from "@/lib/courses/feedback/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send 6 emails" on a programme's Overview: the "you have feedback" emails,
 * one to each person whose feedback the presser left ticked, however many
 * pieces each has: `POST /api/courses/runs/[runId]/feedback/send` with
 * `{ ids, pieces, people }`.
 *
 * WHO MAY: an admin, asked of the session before anything is read. The
 * programme's lead sees the list and is told an admin sends it. A view-as
 * session is turned away first, because the emails would go in the member's
 * name.
 *
 * THE BODY SAYS WHAT THE CARD SHOWED: the pieces left ticked and the two
 * numbers on it (pieces, and people), and the press is refused, with the
 * numbers as they are now, when any has moved. Nothing goes until the
 * presser has sent themselves a test in the last day. Two presses send once.
 * Everything the press does is in `src/lib/courses/feedback/send.ts`.
 */

const MAX_IDS = 1000;

export type FeedbackSendAnswer = { ok: true; report: FeedbackSendReport; said: string[]; model: FeedbackBatchModel };

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: ADMINS_ONLY }, { status: 403 });

  // ---- The body, before anything is read --------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_IDS + 1) : null;
  const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
  const pieces = count(body.pieces);
  const people = count(body.people);
  if (!ids || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && isAddressableId(id)) || pieces === null || people === null) {
    return NextResponse.json({ error: "Say which feedback to email, and the numbers the button showed." }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: NOTHING_TICKED }, { status: 400 });

  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: NO_RUN_HERE }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await sendFeedbackBatch(db, user, runId, { ids: ids as string[], pieces, people });
  if (!outcome.ok) {
    const answer: { error: string; pieces?: number; people?: number; model?: FeedbackBatchModel } = { error: outcome.error };
    if (typeof outcome.pieces === "number") answer.pieces = outcome.pieces;
    if (typeof outcome.people === "number") answer.people = outcome.people;
    if (outcome.model) answer.model = outcome.model;
    return NextResponse.json(answer, { status: outcome.status });
  }
  const answer: FeedbackSendAnswer = { ok: true, report: outcome.report, said: outcome.said, model: outcome.model };
  return NextResponse.json(answer);
}
