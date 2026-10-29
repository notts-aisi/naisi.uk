import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parseTimeAnswer, type TimeAnswerView } from "@/lib/courses/timeAnswer/model";
import { recordTimeAnswer } from "@/lib/courses/timeAnswer/seat";
import { ANSWER_REFUSAL, savedWords } from "@/lib/courses/timeAnswer/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "CAN YOU MAKE THIS TIME?": the person's own answer about the group Publish
 * told them, from the card on their programme page.
 *
 * The body is `{ groupId, kind, reason?, alternatives? }`: `kind` is "yes"
 * ("I can make it") or "cant" ("I can't make this time"), and with "cant"
 * why the time does not work and which other times would are both required
 * (`parseTimeAnswer`). `groupId` is the group the page showed.
 *
 * IT KEEPS THEIR PLACE. This is not leaving the programme: it writes one
 * field on the caller's own seat and nothing else, and shares no code with
 * the leave. Who is asked, what is refused and what is written are
 * `src/lib/courses/timeAnswer/seat.ts`'s.
 *
 * ORDER: a view-as session is refused first, then somebody signed out, then
 * a body that is not an answer (before any document is read), then the
 * seat, read by the caller's own uid inside the transaction that writes it.
 * Nobody but the caller can be answered for: there is no way to spell
 * another person's seat here.
 *
 * Nobody is emailed. The answer is read by the person, the programme's lead
 * and admins (the allocation board's rows), never by facilitators.
 */

type Ctx = { params: Promise<{ runId: string }> };

export type TimeAnswerReply = {
  ok: true;
  answer: TimeAnswerView;
  /** The sentence the card shows. */
  message: string;
};

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseTimeAnswer(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!runId || !isAddressableId(runId)) return NextResponse.json({ error: ANSWER_REFUSAL.notAsked }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await recordTimeAnswer(db, user, runId, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const reply: TimeAnswerReply = {
    ok: true,
    answer: {
      kind: outcome.answer.kind,
      reason: outcome.answer.reason,
      alternatives: outcome.answer.alternatives,
    },
    message: savedWords(outcome.answer.kind),
  };
  return NextResponse.json(reply);
}
