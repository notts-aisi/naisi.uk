import { NextResponse } from "next/server";
import { gateGroupRegister, isAddressableId } from "@/lib/courses/registerAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { checkInRegisterView } from "@/lib/surveys/checkIns/facilitatorView";
import { openCheckIn } from "@/lib/surveys/checkIns/open";
import { isSessionKey } from "@/lib/surveys/checkIns/sessionRead";
import { CHECK_IN_REFUSAL } from "@/lib/surveys/checkIns/words";

type Ctx = { params: Promise<{ groupId: string }> };

/**
 * THE CHECK-IN AT THE END OF A SESSION, from the group's register
 * (`docs/surveys.md`, "Check-ins").
 *
 *  - GET `?session=w03`: what the register's card shows for that session of
 *    the group: whether it can be opened, how many have sent it while it is
 *    open (never who) and the code to show the room, a closed one's totals
 *    from three answers, and the group's latest closed check-in beside it
 *    (`checkInRegisterView`, the one floored view a facilitator reads). Never
 *    a comment, a name or a row per person.
 *  - POST `{ session, people }`: opens it, for the people the register marks
 *    there, each emailed their own link as a notice (`openCheckIn`). `people`
 *    is the number on the button pressed; when the register has moved since,
 *    nothing is opened and the answer carries the new number.
 *
 * WHO: the register's own gate (`gateGroupRegister`), the group's live
 * facilitators and admins, asked before anything else is read: a missing
 * group, an archived one and somebody else's collapse onto one 403. Not the
 * programme's lead, who reads the register's marks and runs no session. The
 * POST refuses a view-as session first. Answers carry counts, never an
 * address or a uid of anybody it emails.
 */

export async function GET(req: Request, ctx: Ctx) {
  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

  const key = new URL(req.url).searchParams.get("session");
  if (!isSessionKey(key)) return NextResponse.json({ error: CHECK_IN_REFUSAL.noSession }, { status: 400 });

  const view = await checkInRegisterView(db, { runId: gated.runId, group: gated.group, sessionKey: key, now: new Date() });
  if (!view) return NextResponse.json({ error: CHECK_IN_REFUSAL.noSession }, { status: 400 });
  return NextResponse.json({ sessionKey: view.sessionKey, card: view.card, last: view.last });
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { session?: unknown; people?: unknown }) : {};
  const people = body.people;
  if (!isSessionKey(body.session) || typeof people !== "number" || !Number.isInteger(people) || people < 0) {
    return NextResponse.json({ error: CHECK_IN_REFUSAL.body }, { status: 400 });
  }

  const outcome = await openCheckIn(db, {
    opener: { uid: actor.uid },
    group: gated.group,
    runId: gated.runId,
    sessionKey: body.session,
    people,
    now: new Date(),
  });
  if (!outcome.ok) {
    const headers = outcome.retryAfterSeconds ? { "Retry-After": String(outcome.retryAfterSeconds) } : undefined;
    return NextResponse.json(
      outcome.people === undefined ? { error: outcome.error } : { error: outcome.error, people: outcome.people },
      { status: outcome.status, headers },
    );
  }
  const { sent, held, suppressed, failed, noAddress } = outcome.tally;
  return NextResponse.json({ ok: true, people: outcome.people, emailed: sent + held + suppressed, failed, noAddress });
}
