import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { projectSignupRequests, requestFacts, waitingRequests } from "@/lib/events/requestCard";
import { signupAccessFor } from "@/lib/events/signupAccess";

const EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The requests for a place at one event that are waiting for a decision, for
 * the event's Sign-ups page: each with the name, when they asked, a few words
 * about who is asking (`src/lib/events/requestCard.ts`) and their answers,
 * and whether the caller may decide them.
 *
 * For the people who see the requests (`signupAccessFor`): admins,
 * SU-recognised committee, and the event's author and collaborators while
 * their accounts stand. What each is sent is decided once, by
 * `projectSignupRequests`: an address and every answer only for admins and
 * SU-recognised committee, who read the whole list client-direct as well, and
 * whether somebody missed the last two events they had a place at only for
 * admins (`src/lib/events/missedEvents.ts`). Nobody here is sent anybody
 * already given a place.
 *
 * Nobody below an approved account organises an event, so they are refused
 * before anything is read. A GET, and it writes nothing.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (viewer.role !== "member" && viewer.role !== "committee" && viewer.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  if (!EVENT_ID.test(id)) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const event = normalizeEvent(snap.id, snap.data() ?? {});
  const access = signupAccessFor(viewer, event);
  if (!access.requests) {
    return NextResponse.json({ error: "Only this event’s organisers, admins and SU-recognised committee can see who has asked for a place." }, { status: 403 });
  }

  // The event's other sign-ups are read with these and left behind, never sent.
  const waiting = await waitingRequests(db, event.id);
  const facts = await requestFacts(db, waiting, viewer, access, new Date());

  return NextResponse.json({
    requests: projectSignupRequests(waiting, event.signupForm, facts, {
      everyone: access.everyone,
      isAdmin: viewer.role === "admin",
    }),
    decides: access.decides,
  });
}
