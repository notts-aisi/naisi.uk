import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { isSurveyToken } from "@/lib/firestore/surveys";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { openBlanksLink, recordBlanks } from "@/lib/surveys/blanksStore";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * "SEND MY ANSWERS" FROM A LINK OF BLANKS (docs/surveys.md, "Sending the
 * questions left blank"): no sign-in. The secret in the link IS the
 * credential: it opens the one row an admin's press made it for, and the
 * answers are kept beside that person's first answers, once, after which the
 * link is spent.
 *
 * Body `{ token, answers }`: answers only to the questions still blank, every
 * one of them answered. Anything else is refused in a sentence, and a link
 * that opens nothing is answered with one sentence whatever the reason.
 *
 * NO IP ADDRESS IS KEPT. The address is read for one thing only, a count in
 * this server's memory that slows down somebody trying secrets, and it is
 * never written anywhere: `tests/surveys-no-tracking.test.mjs` holds every
 * survey file to that.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const limit = rateLimit(`surveys:blanks:ip:${clientIp(req)}`, 30, 60_000);
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
  const body = raw && typeof raw === "object" ? (raw as { token?: unknown; answers?: unknown }) : {};
  if (!isSurveyToken(body.token) || body.answers === null || typeof body.answers !== "object") {
    return NextResponse.json({ error: REFUSAL.noLink }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const target = await openBlanksLink(db, body.token);
  if (!target) return NextResponse.json({ error: REFUSAL.noLink }, { status: 404 });

  const outcome = await recordBlanks(db, { target, token: body.token, raw: body.answers, via: "link", now: new Date() });
  if (!outcome.ok) {
    return NextResponse.json(outcome.missing ? { error: outcome.error, missing: outcome.missing } : { error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json({ ok: true });
}
