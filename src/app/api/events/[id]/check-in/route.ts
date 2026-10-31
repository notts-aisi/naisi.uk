import { NextResponse } from "next/server";
import { clockWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { eventTakesCheckIns, recordCheckIn } from "@/lib/events/checkIns";
import { decideSelf, selfClosedWords, selfHow } from "@/lib/events/selfCheckIn";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * "I'm here": `POST /api/events/<id>/check-in`, pressed on the check-in page.
 * The body is empty for somebody signed in, `{ doorCode: true }` when the page
 * was opened by the event's door code, or `{ rsvpId, token }` from the link in
 * a guest's own confirmation email.
 *
 * Only at an event that lets people check themselves in (`selfCheckIn`), and
 * only while its door is open, opened by its author or an admin: otherwise
 * `selfClosedWords` says why, to everybody, and nothing is written. Who may
 * press it, and as what, is `decideSelf`'s decision, the one the page draws
 * from; the way they came is recorded as itself (`selfHow`). One record per
 * person: pressing again answers with the first one. The answer says when,
 * and nothing about anybody else.
 *
 * Generous per address, like the scan counter: a hall full of phones shares
 * one campus address. The cap bounds what a script can do, and a guest's
 * press needs the token signed for their own sign-up.
 */
const RL_WINDOW_MS = 60_000;
const RL_IP_MAX = 120;

type Parsed = { ok: true; rsvpId: string | null; token: string | null; doorCode: boolean } | { ok: false };

function parse(body: unknown): Parsed {
  if (body === null || body === undefined) return { ok: true, rsvpId: null, token: null, doorCode: false };
  if (typeof body !== "object") return { ok: false };
  const { rsvpId, token, doorCode } = body as Record<string, unknown>;
  // Only a strict true: the page says so when the door code opened it.
  if (doorCode !== undefined && typeof doorCode !== "boolean") return { ok: false };
  const fromCode = doorCode === true;
  if (rsvpId === undefined && token === undefined) return { ok: true, rsvpId: null, token: null, doorCode: fromCode };
  if (
    typeof rsvpId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(rsvpId) ||
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(token)
  ) {
    return { ok: false };
  }
  return { ok: true, rsvpId, token, doorCode: fromCode };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const limit = rateLimit(`events:check-in:ip:${clientIp(req)}`, RL_IP_MAX, RL_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many tries. Wait a minute, or give your name at the door." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const user = await getCurrentUser();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const parsed = parse(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "That link isn’t complete. Open it again from your email, or give your name at the door." },
      { status: 400 },
    );
  }
  if (!parsed.token && !user) {
    return NextResponse.json(
      { error: "Sign in to check yourself in, or use the link in your confirmation email." },
      { status: 401 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "The database is not available." }, { status: 503 });

  const { id } = await ctx.params;
  const snap = await db.collection("events").doc(id).get();
  const event = snap.exists ? normalizeEvent(snap.id, snap.data() ?? {}) : null;
  if (!event || (!eventTakesCheckIns(event) && event.status !== "cancelled")) {
    return NextResponse.json({ error: "There’s no event to check in to here." }, { status: 404 });
  }
  if (event.status === "cancelled") {
    return NextResponse.json({ error: "This event was cancelled." }, { status: 409 });
  }
  const now = new Date();
  const closed = selfClosedWords(event, now);
  if (closed) return NextResponse.json({ error: closed }, { status: 409 });

  const decision = await decideSelf(db, { event, user, rsvpId: parsed.rsvpId, token: parsed.token });
  if (decision.kind === "sign-in") {
    return NextResponse.json(
      { error: "Sign in to check yourself in, or use the link in your confirmation email." },
      { status: 401 },
    );
  }
  if (decision.kind === "bad-link") {
    return NextResponse.json(
      { error: "This link doesn’t work for this event. Give your name at the door." },
      { status: 403 },
    );
  }
  if (decision.kind === "at-the-door") {
    return NextResponse.json({ error: decision.words }, { status: 409 });
  }

  const { created, checkIn } = await recordCheckIn(db, {
    event,
    person: decision.person,
    how: selfHow({ viaLink: decision.viaLink, doorCode: parsed.doorCode }),
    byUid: null,
    now,
  });
  const at = checkIn.at ?? now;
  return NextResponse.json(
    { checkedIn: true, created, at: at.toISOString(), atWords: clockWords(at) },
    { status: created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
