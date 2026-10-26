import { NextResponse } from "next/server";
import { clockWords, dayWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { CHECK_IN_LIMITS } from "@/lib/firestore/eventCheckIns";
import { normalizeEvent, normalizeRsvp } from "@/lib/firestore/events";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { doorClosedWords, doorRows } from "@/lib/events/checkInView";
import {
  checkInPhase,
  doorWindow,
  eventTakesCheckIns,
  recordCheckIn,
} from "@/lib/events/checkIns";

export const dynamic = "force-dynamic";

/**
 * Checks somebody in, for the people who run check-in:
 * `POST /api/events/<id>/check-ins` with `{ rsvpId, from }` for a sign-up, or
 * `{ walkIn: { name, email }, from }` for somebody who came without one. A
 * walk-in's email is optional and is only for that event's survey: it is
 * deleted a week after the event (`walkInEmailGoesAt`).
 *
 * `from` is where it was pressed. `door` is the door list, open from an hour
 * before the start to an hour after the end; `page` is the event's own page,
 * from the door opening until a week after the event. A sign-up on the door
 * list is somebody confirmed, on the waiting list or not decided yet: a
 * cancelled or refused one who comes is added as a walk-in.
 *
 * One record per person: pressing again hands back the first one. The answer
 * is the row as the door list draws it, built field by field.
 */

type From = "door" | "page";
type Parsed =
  | { ok: true; from: From; rsvpId: string; walkIn: null }
  | { ok: true; from: From; rsvpId: null; walkIn: { name: string; email: string | null } }
  | { ok: false; error: string };

// One line of letters, no control characters: a name, not a document.
const CONTROL = /[\u0000-\u001f\u007f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parse(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "Say who to check in." };
  const { rsvpId, walkIn, from } = body as Record<string, unknown>;
  if (from !== "door" && from !== "page") {
    return { ok: false, error: "Say whether this is the door list or the event’s page." };
  }
  if (walkIn !== undefined) {
    if (!walkIn || typeof walkIn !== "object") return { ok: false, error: "Give the walk-in’s name." };
    const raw = walkIn as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
    if (!name || CONTROL.test(name)) return { ok: false, error: "Give the walk-in’s name." };
    if (name.length > CHECK_IN_LIMITS.name) {
      return { ok: false, error: `Keep the name to ${CHECK_IN_LIMITS.name} characters.` };
    }
    const typed = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (raw.email !== undefined && raw.email !== null && typeof raw.email !== "string") {
      return { ok: false, error: "That email doesn’t look right. Leave it empty if they don’t want the survey." };
    }
    if (typed && (typed.length > CHECK_IN_LIMITS.email || !EMAIL.test(typed) || CONTROL.test(typed))) {
      return { ok: false, error: "That email doesn’t look right. Leave it empty if they don’t want the survey." };
    }
    return { ok: true, from, rsvpId: null, walkIn: { name, email: typed || null } };
  }
  if (typeof rsvpId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(rsvpId)) {
    return { ok: false, error: "Say who to check in." };
  }
  return { ok: true, from, rsvpId, walkIn: null };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!runsCheckIn(user)) {
    return NextResponse.json(
      { error: "Only admins and SU-recognised committee members run check-in." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const parsed = parse(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "The database is not available." }, { status: 503 });

  const { id } = await ctx.params;
  const eventSnap = await db.collection("events").doc(id).get();
  if (!eventSnap.exists) return NextResponse.json({ error: "There is no such event." }, { status: 404 });
  const event = normalizeEvent(eventSnap.id, eventSnap.data() ?? {});
  if (!eventTakesCheckIns(event)) {
    return NextResponse.json({ error: "Only a published event takes check-ins." }, { status: 409 });
  }

  const now = new Date();
  const phase = checkInPhase(event, now);
  const window = doorWindow(event);
  if (parsed.from === "door") {
    const closed = doorClosedWords(phase, window);
    if (closed) return NextResponse.json({ error: closed }, { status: 409 });
  } else if (phase !== "door" && phase !== "later") {
    const error =
      phase === "before" && window
        ? `Nobody can be checked in before the door list opens at ${clockWords(window.opensAt)} on ${dayWords(window.opensAt)}.`
        : phase === "undated"
          ? "This event has no date yet, so nobody can be checked in."
          : "It’s more than a week since this event, so nobody more can be added.";
    return NextResponse.json({ error }, { status: 409 });
  }

  if (parsed.walkIn) {
    const { created, checkIn } = await recordCheckIn(db, {
      event,
      person: { kind: "walk-in", name: parsed.walkIn.name, email: parsed.walkIn.email },
      how: parsed.from === "door" ? "door" : "page",
      byUid: user.uid,
      now,
    });
    const [row] = doorRows([], [checkIn]);
    return NextResponse.json(
      { created, row },
      { status: created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rsvpSnap = await db.collection("eventRsvps").doc(parsed.rsvpId).get();
  const rsvp = rsvpSnap.exists ? normalizeRsvp(rsvpSnap.id, rsvpSnap.data() ?? {}) : null;
  if (!rsvp || rsvp.eventId !== event.id || rsvp.synthetic) {
    return NextResponse.json({ error: "There is no such sign-up for this event." }, { status: 404 });
  }
  if (rsvp.status !== "confirmed" && rsvp.status !== "waitlisted" && rsvp.status !== "pending") {
    return NextResponse.json(
      { error: `${rsvp.name || "This person"}’s sign-up was cancelled or refused. Add them as a walk-in.` },
      { status: 409 },
    );
  }

  const { created, checkIn } = await recordCheckIn(db, {
    event,
    person: { kind: "signup", rsvp },
    how: parsed.from === "door" ? "door" : "page",
    byUid: user.uid,
    now,
  });
  const [row] = doorRows([rsvp], [checkIn]);
  return NextResponse.json(
    { created, row },
    { status: created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
