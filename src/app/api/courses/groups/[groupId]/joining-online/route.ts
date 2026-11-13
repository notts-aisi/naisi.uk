import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parseJoiningOnline } from "@/lib/courses/joiningOnline/model";
import { recordJoiningOnline } from "@/lib/courses/joiningOnline/seat";
import { JOINING_ONLINE_REFUSAL, onlineSavedWords } from "@/lib/courses/joiningOnline/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "JOINING ONLINE", FOR ONE SESSION: somebody taking part in the group tells
 * us, before a session starts, that they will join it online, from the
 * ticket on their programme page; or takes it back ("I'll be in the room
 * after all").
 *
 * The body is `{ sessionKey, online }`: the session, by its register's key
 * ("w03"), and true for "Joining online", false for taking it back. It keeps
 * their word on that session's register beside its marks (`onlineSaid`),
 * never as a mark. The group's facilitators read it in the box at the top of
 * their group page and register, which asks them for a meeting link for that
 * week, and the register puts them down as online when they are marked as
 * having come. Who may, and what is written, are
 * `src/lib/courses/joiningOnline/seat.ts`'s.
 *
 * ORDER: a view-as session is refused first, then somebody signed out, then
 * an address that names no group and a body that is not a press, before any
 * document is read; then the caller's own seat, read by their own uid inside
 * the transaction that writes their word. Nobody can say it for anybody
 * else: there is no way to spell another person here. A group that is not
 * there, and one they are not in, are the same 404.
 *
 * The first time somebody says it for a session, the group's facilitators
 * are emailed that they are joining it online, and where to add a link if it
 * has none; never the person, nobody when it is taken back, and nothing a
 * second time (`src/lib/courses/joiningOnline/tell.ts`). The email never
 * carries the meeting link, nor does the answer, which is the same whether
 * the email went or not.
 */

type Ctx = { params: Promise<{ groupId: string }> };

export type JoiningOnlineReply = {
  ok: true;
  /** Whether the register now keeps their word that they are joining online. */
  online: boolean;
  /** The sentence the ticket shows. */
  message: string;
};

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: JOINING_ONLINE_REFUSAL.notYours }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseJoiningOnline(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await recordJoiningOnline(db, user, groupId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const reply: JoiningOnlineReply = {
    ok: true,
    online: outcome.online,
    message: onlineSavedWords(outcome.online, outcome.hasLink),
  };
  return NextResponse.json(reply);
}
