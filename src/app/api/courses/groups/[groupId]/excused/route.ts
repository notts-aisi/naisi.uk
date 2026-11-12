import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { askToBeExcused } from "@/lib/courses/excused/ask";
import { parseAsk } from "@/lib/courses/excused/model";
import { EXCUSED_REFUSAL } from "@/lib/courses/excused/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ASK TO BE EXCUSED from one session of your group, or several: somebody
 * holding a told place in the group, about sessions of it they are due at,
 * before a session or after it while its finished register says Absent,
 * until the programme closes (`src/lib/courses/excused/ask.ts`). Not
 * somebody who facilitates the group, who keeps the instant "Can't make it".
 *
 * The body is `{ sessionKeys, reason }`: the sessions by their registers'
 * keys ("w03"), and one short line of why, which admins read and nobody
 * else, and which is deleted when the programme closes (privacy v17). It
 * writes one request and NOTHING ON A REGISTER: an admin decides each week.
 * Nobody is emailed.
 *
 * ORDER: a view-as session is refused first, then somebody signed out, then
 * an address that names no group and a body that is not an ask, before any
 * document is read; then the caller's own place, read by their own uid inside
 * the transaction that writes the request. Nobody can ask for anybody else:
 * there is no way to spell another person here. A group that is not there,
 * and one they are not in, are the same 404.
 */

type Ctx = { params: Promise<{ groupId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: EXCUSED_REFUSAL.notYours }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseAsk(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await askToBeExcused(db, user, groupId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, request: outcome.request });
}
