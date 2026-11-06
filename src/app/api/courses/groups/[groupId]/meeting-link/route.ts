import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parseMeetingLink, saveSessionLink } from "@/lib/courses/meetingLink/save";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * A SESSION'S MEETING LINK, FROM THE BOX AT THE TOP OF A FACILITATOR'S GROUP
 * PAGE AND REGISTER: the box asks for a link for each week somebody has said
 * they are joining online, and this saves it, for that week or for every
 * week (`src/lib/courses/meetingLink/save.ts` says what is written).
 *
 * POST `{ sessionKey, url, everyWeek }`. Everybody in the group then sees the
 * link on their programme page, and nobody is emailed. The answer never
 * carries the link.
 *
 * ── WHY A ROUTE ─────────────────────────────────────────────────────────────
 * `courseGroups` is read-locked to the authoring tier in firestore.rules,
 * because a group carries its meeting link: a facilitator's browser never
 * holds the group document, so it cannot write it in place either. The
 * session route's twin, the same gate.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * A facilitator of THIS group while it is LIVE, or an admin. AUTHORIZATION
 * BEFORE EXISTENCE: missing, archived and somebody else's group collapse onto
 * one 403 for everybody but an admin, before the body is read, and the
 * writer asks the same again inside its transaction. A view-as session is
 * refused first.
 */

type Ctx = { params: Promise<{ groupId: string }> };

export type MeetingLinkReply = {
  ok: true;
  sessionKey: string;
  /** Whether the link was kept for every week rather than the one. */
  everyWeek: boolean;
};

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // AUTHORIZATION BEFORE EXISTENCE, before the body is parsed.
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const isAdmin = actor.role === "admin";
  const facilitatesLiveGroup = Boolean(
    group && !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  if (!isAdmin && !facilitatesLiveGroup) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseMeetingLink(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await saveSessionLink(db, actor, groupId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const reply: MeetingLinkReply = { ok: true, sessionKey: outcome.sessionKey, everyWeek: outcome.everyWeek };
  return NextResponse.json(reply);
}
