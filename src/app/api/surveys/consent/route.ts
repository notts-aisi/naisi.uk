import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { isSurveyToken } from "@/lib/firestore/surveys";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { changeConsent, isConsentPurpose } from "@/lib/surveys/consent";
import { openLink } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * A PERSON CHANGES A CONSENT FROM THEIR PERSONAL LINK, with no sign-in: "Stop
 * the follow-ups", or saying yes after all. The secret in the link IS the
 * credential: it opens the person's own row and nobody else's, and the change
 * is theirs alone. On a follow-up, the row changed is the one on the before
 * survey it came from (`src/lib/surveys/consent.ts`).
 *
 * Body `{ token, purpose, given }`. A link that opens nothing is answered with
 * one sentence whatever the reason; a survey's test link changes nothing.
 *
 * NO IP ADDRESS IS KEPT. The address is read for one thing only, a count in
 * this server's memory that slows down somebody trying secrets, and it is
 * never written anywhere: `tests/surveys-no-tracking.test.mjs` holds every
 * survey file to that.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const limit = rateLimit(`surveys:consent:ip:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many tries in a minute. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { token?: unknown; purpose?: unknown; given?: unknown }) : {};
  if (!isSurveyToken(body.token)) return NextResponse.json({ error: REFUSAL.noLink }, { status: 400 });
  if (!isConsentPurpose(body.purpose) || typeof body.given !== "boolean") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const target = await openLink(db, body.token);
  if (target.kind === "none") return NextResponse.json({ error: REFUSAL.noLink }, { status: 404 });
  if (target.kind === "test") return NextResponse.json({ error: REFUSAL.testLink }, { status: 409 });

  const outcome = await changeConsent(db, { survey: target.survey, person: target.person, purpose: body.purpose, given: body.given });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, given: outcome.given });
}
