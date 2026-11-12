import { NextResponse } from "next/server";
import {
  coveredSessionsOf,
  gateGroupRegister,
  isAddressableId,
  readSessionRegister,
  registerSessionAccess,
} from "@/lib/courses/registerAccess";
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
 *  - POST `{ session, people, late? }`: opens it, for the people the register
 *    marks there, each emailed their own link as a notice (`openCheckIn`).
 *    `people` is the number on the button pressed; when the register has
 *    moved since, nothing is opened and the answer carries the new number.
 *    `late: true` is an admin's press after the session's window has passed
 *    (the programme's Surveys tab, its Check-ins view): anybody else sending it
 *    is refused in a sentence before anything is read.
 *
 * WHO: the register's own gate (`gateGroupRegister`), asked before anything
 * else is read: a missing group, an archived one and somebody else's
 * collapse onto one 403. Then the session's own door
 * (`registerSessionAccess`): the group's live facilitators and admins, and
 * whoever took THAT session's register in a facilitator's place (a lead
 * covering it, or somebody given it while it holds). A lead who has not
 * taken it is refused, as before: the lead reads the register and runs no
 * session. Somebody only given the session is never sent the totals, of this
 * session's check-in or of the group's last: those are the group's
 * facilitators', the lead's and admins'. The POST refuses a view-as session
 * first. Answers carry counts, never an address or a uid of anybody it
 * emails.
 */

/**
 * Before the body: whether the caller could open any check-in of the group
 * at all. The group's facilitators and admins always; anybody else only
 * while they hold a session they covered.
 */
async function mayCheckInHere(
  db: Parameters<typeof coveredSessionsOf>[0],
  gated: Extract<Awaited<ReturnType<typeof gateGroupRegister>>, { ok: true }>,
  uid: string,
  now: Date,
): Promise<string[] | "staff"> {
  if (gated.isAdmin || gated.facilitates) return "staff";
  return coveredSessionsOf(db, gated.group, uid, now);
}

export async function GET(req: Request, ctx: Ctx) {
  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });

  const now = new Date();
  const may = await mayCheckInHere(db, gated, actor.uid, now);
  if (may !== "staff" && may.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const key = new URL(req.url).searchParams.get("session");
  if (!isSessionKey(key)) return NextResponse.json({ error: CHECK_IN_REFUSAL.noSession }, { status: 400 });
  const register = may === "staff" ? null : await readSessionRegister(db, gated.runId, gated.group.id, key);
  const access = registerSessionAccess(gated, { uid: actor.uid, sessionKey: key, cover: register?.cover ?? null, now });
  if (!access.checksIn) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const view = await checkInRegisterView(db, { runId: gated.runId, group: gated.group, sessionKey: key, now });
  if (!view) return NextResponse.json({ error: CHECK_IN_REFUSAL.noSession }, { status: 400 });
  if (access.readsCheckInTotals) return NextResponse.json({ sessionKey: view.sessionKey, card: view.card, last: view.last });
  // Somebody only given the session: whether it is open, how many have sent
  // it and when it closes, and never a total, of this check-in or another.
  const card = view.card?.state === "closed" ? { ...view.card, totals: null, tooFew: null } : view.card;
  return NextResponse.json({ sessionKey: view.sessionKey, card, last: null });
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
  const now = new Date();
  const may = await mayCheckInHere(db, gated, actor.uid, now);
  if (may !== "staff" && may.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { session?: unknown; people?: unknown; late?: unknown }) : {};
  const people = body.people;
  if (
    !isSessionKey(body.session) ||
    typeof people !== "number" ||
    !Number.isInteger(people) ||
    people < 0 ||
    (body.late !== undefined && typeof body.late !== "boolean")
  ) {
    return NextResponse.json({ error: CHECK_IN_REFUSAL.body }, { status: 400 });
  }
  const late = body.late === true;
  if (late && !gated.isAdmin) return NextResponse.json({ error: CHECK_IN_REFUSAL.lateAdminOnly }, { status: 403 });
  if (may !== "staff") {
    const register = await readSessionRegister(db, gated.runId, gated.group.id, body.session);
    if (!registerSessionAccess(gated, { uid: actor.uid, sessionKey: body.session, cover: register?.cover ?? null, now }).checksIn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const outcome = await openCheckIn(db, {
    opener: { uid: actor.uid },
    admin: gated.isAdmin,
    late,
    group: gated.group,
    runId: gated.runId,
    sessionKey: body.session,
    people,
    now,
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
