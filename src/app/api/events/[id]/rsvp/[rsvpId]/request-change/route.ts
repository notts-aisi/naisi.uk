import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";
import { sanitizeSignupForm, type FormQuestion } from "@/lib/firestore/events";
import { validateAnswers } from "@/lib/events/validateAnswers";
import { verifyRsvpToken } from "@/lib/events/rsvpToken";

/**
 * An attendee (or organiser) proposes an update to the answers they submitted
 * with their RSVP — typically a dietary tweak. The change is not applied until
 * an organiser reviews it via the attendee dashboard.
 *
 * Auth: signed-in organisers OR a valid RSVP token (so anonymous public
 * signups can request changes via the link in their confirmation email).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; rsvpId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { id: eventId, rsvpId } = await ctx.params;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let body: { answers?: unknown; t?: unknown } = {};
  try {
    body = (await req.json()) as { answers?: unknown; t?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const viewer = await getCurrentUser();
  const tokenCandidate = typeof body.t === "string" ? body.t : "";

  const eventRef = db.collection("events").doc(eventId);
  const rsvpRef = db.collection("eventRsvps").doc(rsvpId);

  const [eventSnap, rsvpSnap] = await Promise.all([eventRef.get(), rsvpRef.get()]);
  const event = eventSnap.exists ? (eventSnap.data() ?? {}) : null;
  const rsvp = rsvpSnap.exists ? (rsvpSnap.data() ?? {}) : null;

  // THE RIGHT FIRST, AND ONE REFUSAL. A sign-up that is not there, one for
  // another event, and one the caller may not change all get the same
  // answer, and its status is said only once the right is checked, so nobody
  // without the link or the account learns whether a sign-up exists or how
  // it stands.
  if (!event || !rsvp || rsvp.eventId !== eventId) {
    return NextResponse.json({ error: NOT_YOURS }, { status: 404 });
  }

  const rsvpEmail = typeof rsvp.email === "string" ? rsvp.email : "";
  const tokenValid =
    tokenCandidate !== "" && rsvpEmail !== "" && verifyRsvpToken(rsvpId, rsvpEmail, tokenCandidate);
  const isOrganiser =
    !!viewer &&
    (canApproveEvent(viewer) ||
      (canDraftEvent(viewer) &&
        isNamedWithStanding(viewer, "events.authorUid", event.authorUid)));
  const isOwnUid = !!viewer && typeof rsvp.uid === "string" && rsvp.uid === viewer.uid;

  if (!isOrganiser && !isOwnUid && !tokenValid) {
    return NextResponse.json({ error: NOT_YOURS }, { status: 404 });
  }
  if (rsvp.status === "cancelled" || rsvp.status === "denied") {
    return NextResponse.json(
      { error: "You can't change a cancelled or denied RSVP." },
      { status: 400 },
    );
  }

  const questions: FormQuestion[] = sanitizeSignupForm(event.signupForm);
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "This event has no signup questions to update." },
      { status: 400 },
    );
  }

  const validated = validateAnswers(questions, body.answers);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  await rsvpRef.update({
    pendingAnswers: validated.answers,
    pendingAnswersRequestedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}

/** Every refusal, before and after the right is checked. */
const NOT_YOURS = "We couldn’t find a sign-up you can change here. If it came from an email, open the link in it again.";
