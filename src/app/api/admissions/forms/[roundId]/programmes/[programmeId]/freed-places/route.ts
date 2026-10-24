import { NextResponse } from "next/server";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { offerFreedPlaces, sendOwedFreedPlaceEmails } from "@/lib/applications/freedPlaces/offer";
import { NO_PROGRAMME, parseOfferRequest, parseOwedRequest } from "@/lib/applications/freedPlaces/rules";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send N invitations": offer a programme's freed places to the people
 * picked, after decision day, and email each of them. With `owedOnly: true`
 * it is the smaller press that offers nobody new and sends the emails of
 * earlier offers that are still to go.
 *
 * WHO MAY is `offersFreedPlaces` of the caller's role on the programme: an
 * admin, this term. The role comes from the form, so the form is read before
 * it is decided; the body is checked first, and somebody with no role on the
 * programme is answered as for a programme that is not there. The writer asks
 * again inside the transaction that writes.
 *
 * THE BODY SAYS HOW MANY PEOPLE THE BUTTON NAMED (`invitations`), and the
 * press is refused when the people picked are not that many, so what goes is
 * what the admin read. Everything the press does, and every refusal, is in
 * `src/lib/applications/freedPlaces/offer.ts`.
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
  const owedOnly =
    raw !== null && typeof raw === "object" && (raw as { owedOnly?: unknown }).owedOnly === true;
  const now = new Date();
  const offer = owedOnly ? null : parseOfferRequest(raw, londonDateKey(now));
  const owed = owedOnly ? parseOwedRequest(raw) : null;
  const problem = offer && !offer.ok ? offer.error : owed && !owed.ok ? owed.error : null;
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result =
    offer && offer.ok
      ? await offerFreedPlaces(db, user, roundId, programmeId, offer.request)
      : owed && owed.ok
        ? await sendOwedFreedPlaceEmails(db, user, roundId, programmeId, owed.request)
        : null;
  if (!result) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, report: result.report });
}
