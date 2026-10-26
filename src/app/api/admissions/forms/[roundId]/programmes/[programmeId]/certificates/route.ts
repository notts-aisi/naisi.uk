import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { parseSendRequest } from "@/lib/courses/certificates/model";
import { sendCertificates } from "@/lib/courses/certificates/send";
import { NO_PROGRAMME } from "@/lib/courses/certificates/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send 33 certificates" (board en-finish): email each person the
 * programme's record says finished, and each of its facilitators, their
 * certificate, once the run's last session is over. One email a person; a
 * facilitator who also finished is sent both in it.
 *
 * WHO MAY is the programme's lead or an admin (from the form, once a valid
 * body has arrived). A view-as session is turned away first, because the
 * emails would go in the member's name.
 *
 * THE BODY SAYS WHAT THE BUTTON SHOWED (`certificates`, `emails`), and the
 * press is refused, with the numbers as they are now, when either has moved.
 * Nothing goes until the presser has sent themselves a test. Two presses send
 * one batch. Everything the press does is in
 * `src/lib/courses/certificates/send.ts`.
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
  const parsed = parseSendRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await sendCertificates(db, user, roundId, programmeId, parsed.value);
  if (!outcome.ok) {
    const body: { error: string; certificates?: number; emails?: number } = { error: outcome.error };
    if (typeof outcome.certificates === "number") body.certificates = outcome.certificates;
    if (typeof outcome.emails === "number") body.emails = outcome.emails;
    return NextResponse.json(body, { status: outcome.status });
  }
  return NextResponse.json({ ok: true, report: outcome.report, said: outcome.said, model: outcome.model });
}
