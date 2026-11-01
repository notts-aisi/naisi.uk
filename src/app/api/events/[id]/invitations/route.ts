import { NextResponse } from "next/server";
import { mayInviteFor } from "@/lib/events/invitationAccess";
import { inviteNewSince, planForStoredChoice } from "@/lib/events/invitations";
import { isForChosenPeople, runsEvents } from "@/lib/events/reach";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent, type EventDoc } from "@/lib/firestore/events";

type Ctx = RouteContext<"/api/events/[id]/invitations">;

/**
 * "INVITE THE N NEW SINCE", on a published event for chosen people's sign-ups.
 *
 * Somebody who joins the event's tags after it was published (a place taken
 * up, a group told) is not invited by themselves: nothing is sent unless an
 * organiser presses for it, and the button says how many it reaches first.
 *
 *  - GET: how many people the event's choice reaches now who are not on its
 *    list yet. Counts only.
 *  - POST: put them on the list and email them, each the way publishing
 *    would (src/lib/events/invitations.ts).
 *
 * WHO: the event's author and collaborators, approvers and admins
 * (`mayInviteFor`). Somebody else who runs events is told the event is not
 * there, exactly as for an event that is not, so the answer says nothing
 * about an event they do not organise.
 */

type Gate = { refusal: NextResponse } | { event: EventDoc; uid: string };

async function gate(ctx: Ctx): Promise<Gate> {
  const viewer = await getCurrentUser();
  if (!viewer) return { refusal: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!runsEvents(viewer)) return { refusal: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) return { refusal: NextResponse.json({ error: "Server not configured" }, { status: 500 }) };
  const snap = await db.collection("events").doc(id).get();
  const event = snap.exists ? normalizeEvent(id, snap.data() ?? {}) : null;
  if (!event || !mayInviteFor(event, viewer)) {
    return { refusal: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  }
  return { event, uid: viewer.uid };
}

/** Only a published event for chosen people has a list to add to. */
const takesInvitations = (event: EventDoc) => isForChosenPeople(event) && event.status === "published";

export async function GET(_req: Request, ctx: Ctx) {
  const at = await gate(ctx);
  if ("refusal" in at) return at.refusal;
  const db = getAdminDb();
  if (!db || !takesInvitations(at.event)) return NextResponse.json({ ok: true, newSince: 0, emails: 0 });
  const plan = await planForStoredChoice(db, at.event, new Date());
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
  return NextResponse.json({ ok: true, newSince: plan.plan.count.adding, emails: plan.plan.count.emails });
}

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const at = await gate(ctx);
  if ("refusal" in at) return at.refusal;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  if (!takesInvitations(at.event)) {
    return NextResponse.json({ error: "Only a published event for chosen people takes more invitations." }, { status: 400 });
  }
  const done = await inviteNewSince(db, at.event, at.uid, new Date());
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true, invited: done.invited, emailed: done.emailed });
}
