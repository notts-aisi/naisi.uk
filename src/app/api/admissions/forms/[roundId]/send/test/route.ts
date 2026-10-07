import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import {
  DECISION_EMAIL_KINDS,
  type DecisionEmailKind,
} from "@/lib/applications/decisionDay/emailCopy";
import { sendTestEmail } from "@/lib/applications/decisionDay/send";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send a test to me": one of the three decision-day emails, to the admin's
 * own address, exactly as the first person in that group would get it.
 *
 * ADMIN ONLY, and decided before anything is read. The address is the one on
 * the caller's own session and is never taken from the request, so a test can
 * reach nobody but the person who asked for it. It tells no applicant anything
 * and writes nothing to any application.
 *
 * A TEST THAT GOES IS RECORDED ON THE FORM: who sent it, when, and the wording
 * it was made from. Decision day cannot be sent without one, so `recorded`
 * comes back with the answer. A test this copy of the site held, or one to an
 * address on the do-not-email list, reached nobody and is not recorded.
 */

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can send a test of these emails." }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const kind = (raw && typeof raw === "object" ? (raw as { kind?: unknown }).kind : undefined) as
    | DecisionEmailKind
    | undefined;
  if (!kind || !DECISION_EMAIL_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Say which of the emails to test." }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "Your account has no email address on file, so there is nowhere to send a test." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const sent = await sendTestEmail(db, { uid: user.uid, email: user.email }, roundId, kind);
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
  return NextResponse.json({
    ok: true,
    kind,
    delivery: sent.delivery,
    subject: sent.subject,
    recorded: sent.recorded,
  });
}
