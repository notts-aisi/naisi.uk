import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { answerAsk } from "@/lib/courses/facilitatorAsks/answer";
import { parseAnswerRequest } from "@/lib/courses/facilitatorAsks/requests";
import { NOT_AN_ASK } from "@/lib/courses/facilitatorAsks/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The answer to an ask to facilitate, from the person asked: `{ answer:
 * "yes" }` ("Yes, I’ll facilitate") or `{ answer: "no" }` ("I can’t this
 * term"), on the page the ask's email opens.
 *
 * WHO MAY is the person the ask was sent to, signed in with that account, and
 * nobody else: an ask that is anybody else's is answered as one that is not
 * there. A view-as session is turned away first, because an answer is the
 * person's own and an admin must never give it for them.
 *
 * Yes puts them on the group as a facilitator, through the one place a
 * group's facilitators change; no is recorded. Every rule is `answerAsk` in
 * `src/lib/courses/facilitatorAsks/answer.ts`. Nobody is emailed.
 */

type Ctx = { params: Promise<{ askId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { askId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseAnswerRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isAddressableId(askId)) return NextResponse.json({ error: NOT_AN_ASK }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await answerAsk(db, user, askId, parsed.value.answer, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, answer: outcome.answer });
}
