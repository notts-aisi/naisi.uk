import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parseCantMakeIt } from "@/lib/courses/cantMakeIt/model";
import { recordCantMakeIt } from "@/lib/courses/cantMakeIt/seat";
import { CANT_MAKE_IT_REFUSAL, savedWords } from "@/lib/courses/cantMakeIt/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "CAN'T MAKE IT", FOR ONE SESSION: somebody taking part in the group tells
 * us, before a session starts, that they can't make it, from the ticket on
 * their programme page; or takes it back.
 *
 * The body is `{ sessionKey, cantMakeIt }`: the session, by its register's
 * key ("w03"), and true for "Can't make it", false for "I can make it after
 * all". It records them as excused on that session's register, with when they
 * said so (privacy v15, Registers: "We may let you tell us in advance that you
 * can't make a session, which records you as excused."), and the register
 * shows it to the group's facilitators. Who may, and what is written, are
 * `src/lib/courses/cantMakeIt/seat.ts`'s.
 *
 * ORDER: a view-as session is refused first, then somebody signed out, then
 * an address that names no group and a body that is not a press, before any
 * document is read; then the caller's own seat, read by their own uid inside
 * the transaction that writes their line. Nobody can say it for anybody
 * else: there is no way to spell another person here. A group that is not
 * there, and one they are not in, are the same 404.
 *
 * Nobody is emailed.
 */

type Ctx = { params: Promise<{ groupId: string }> };

export type CantMakeItReply = {
  ok: true;
  /** Whether the register now records them as excused on their word. */
  told: boolean;
  /** The sentence the ticket shows. */
  message: string;
};

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: CANT_MAKE_IT_REFUSAL.notYours }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseCantMakeIt(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await recordCantMakeIt(db, user, groupId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const reply: CantMakeItReply = { ok: true, told: outcome.told, message: savedWords(outcome.told) };
  return NextResponse.json(reply);
}
