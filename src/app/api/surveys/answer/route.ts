import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { isSurveyToken } from "@/lib/firestore/surveys";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { recordAnswer } from "@/lib/surveys/answer";
import { openLink } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * "SEND MY ANSWERS" FROM A PERSONAL LINK (sv-before-phone): no sign-in. The
 * secret in the person's link IS the credential: it opens their own row and
 * nobody else's, and the answers are kept against them, once.
 *
 * Body `{ token, answers, consents?, kairos? }`, `consents` being what the
 * survey's consent boxes say, kept on the person's row, and `kairos` the
 * Kairos choice when the person changed it on the form, kept on their own
 * record. A link that opens nothing is answered with one sentence whatever
 * the reason; a survey's test link keeps nothing.
 *
 * NO IP ADDRESS IS KEPT. The address is read for one thing only, a count in
 * this server's memory that slows down somebody trying secrets, and it is
 * never written anywhere: `tests/surveys-no-tracking.test.mjs` holds every
 * survey file to that.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const limit = rateLimit(`surveys:answer:ip:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many tries in a minute. Wait a moment and press Send my answers again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body =
    raw && typeof raw === "object" ? (raw as { token?: unknown; answers?: unknown; consents?: unknown; kairos?: unknown }) : {};
  if (!isSurveyToken(body.token) || body.answers === null || typeof body.answers !== "object") {
    return NextResponse.json({ error: REFUSAL.noLink }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const target = await openLink(db, body.token);
  if (target.kind === "none") return NextResponse.json({ error: REFUSAL.noLink }, { status: 404 });
  if (target.kind === "test") return NextResponse.json({ error: REFUSAL.testLink }, { status: 409 });

  const outcome = await recordAnswer(db, {
    survey: target.survey,
    person: target.person,
    raw: body.answers,
    consents: body.consents,
    kairos: body.kairos,
    via: "link",
    now: new Date(),
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true });
}
