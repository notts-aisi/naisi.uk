import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parseTimeAnswer, type TimeAnswerView } from "@/lib/courses/timeAnswer/model";
import { recordTimeAnswer } from "@/lib/courses/timeAnswer/seat";
import { ANSWER_REFUSAL, savedWords } from "@/lib/courses/timeAnswer/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "CAN YOU MAKE THIS TIME MOST WEEKS?": the person's own answer about the
 * group Publish told them, from the card on their programme page.
 *
 * The body is `{ groupId, kind, ... }`: `kind` is "yes", "mostWeeks" ("Most
 * weeks, not all", with `sessionKeys`, the group's sessions they ticked,
 * none allowed) or "cant" ("No, I need a different time", with why the time
 * does not work and which other times would, both required)
 * (`parseTimeAnswer`). `groupId` is the group the page showed.
 *
 * IT KEEPS THEIR PLACE. This is not leaving the programme: it writes the
 * caller's own seat and, for "Most weeks, not all", the caller's own lines
 * of their group's registers still to come (each ticked session recorded as
 * excused on their word, as the ticket's "Can't make it" records it, and one
 * they had told us about and unticked taken back), and shares no code with
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
 * and admins (the allocation board's rows, Circles), never by facilitators,
 * who see only the register.
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

  const outcome = await recordTimeAnswer(db, user, runId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const answer: TimeAnswerView =
    outcome.answer.kind === "mostWeeks"
      ? {
          kind: "mostWeeks",
          reason: outcome.answer.reason,
          alternatives: outcome.answer.alternatives,
          sessionKeys: outcome.answer.sessionKeys,
        }
      : { kind: outcome.answer.kind, reason: outcome.answer.reason, alternatives: outcome.answer.alternatives };
  const reply: TimeAnswerReply = { ok: true, answer, message: savedWords(outcome.answer.kind) };
  return NextResponse.json(reply);
}
