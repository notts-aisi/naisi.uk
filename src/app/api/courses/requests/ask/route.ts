import { NextResponse } from "next/server";
import { sendTeamMessage } from "@/lib/courses/teamAsk/ask";
import { parseAsk } from "@/lib/courses/teamAsk/model";
import { ASK_REFUSAL } from "@/lib/courses/teamAsk/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isMemberRole } from "@/lib/societyFeedback/model";

/**
 * SEND THE TEAM A MESSAGE, from Ask the team (`/ask-the-team`):
 * `POST { topic, words }`, the topic one the form offers ("site" or "else").
 *
 * THE CALLER'S OWN: the sender and the person it is about are the session's
 * uid, and nothing in the body names anybody. ORDER: a view-as session is
 * refused first, then somebody signed out, then anybody without an approved
 * account (member, committee or admin), then the body (a topic the form
 * offers, and up to 2,000 characters), then the daily limit of five, counted
 * in the send's own transaction (`src/lib/courses/teamAsk/ask.ts`). Every
 * refusal writes nothing. On success one message is written, belonging to no
 * programme, and the admins who switched it on are emailed after the commit,
 * never what was written. Nobody else is emailed.
 */

export type TeamAskAnswer = { ok: true; request: { id: string; askedAt: string } };

export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isMemberRole(user.role)) return NextResponse.json({ error: ASK_REFUSAL.notMember }, { status: 403 });

  const raw: unknown = await req.json().catch(() => null);
  const parsed = parseAsk(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await sendTeamMessage(db, user, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const answer: TeamAskAnswer = { ok: true, request: outcome.request };
  return NextResponse.json(answer);
}
