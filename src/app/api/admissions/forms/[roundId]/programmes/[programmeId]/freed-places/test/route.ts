import { NextResponse } from "next/server";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { sendFreedPlaceTest } from "@/lib/applications/freedPlaces/offer";
import { NO_PROGRAMME, parseTestRequest } from "@/lib/applications/freedPlaces/rules";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send a test to me": the first person's real freed-place email, as the send
 * would compose it, to the address on the caller's own session, marked as a
 * test. No invitation is sent until a test with the same day to accept by has
 * reached the person offering, so a test that goes is recorded on the form.
 *
 * WHO MAY is who may send the invitations: `offersFreedPlaces`, asked of the
 * caller's role on the form. WHERE IT GOES is never in the request, and a
 * view-as session is turned away first, because the address on it is the
 * member's. It tells no applicant anything and writes nothing to any
 * application. The rules are in `src/lib/applications/freedPlaces/offer.ts`.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseTestRequest(raw, londonDateKey(new Date()));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  // About the caller's own account, so it is said before anything is read.
  const email = (user.email ?? "").trim();
  if (!email) {
    return NextResponse.json(
      { error: "Your account has no email address on file, so there is nowhere to send a test." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const sent = await sendFreedPlaceTest(db, { ...user, email }, roundId, programmeId, parsed.request);
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
  return NextResponse.json({
    ok: true,
    delivery: sent.delivery,
    subject: sent.subject,
    recorded: sent.recorded,
  });
}
