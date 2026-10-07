import { NextResponse } from "next/server";
import { roleOnProgramme } from "@/lib/applications/access";
import { sendProgrammeTestEmail } from "@/lib/applications/decisionDay/send";
import { PROGRAMME_EMAIL_KINDS, type ProgrammeEmailKind } from "@/lib/applications/model";
import { isId } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A test of one of a programme's own emails, sent to whoever pressed the
 * button on that programme's settings page.
 *
 * WHO MAY ASK is who may word the email: the programme's lead, or an admin.
 * A reviewer is refused. Anybody with no role on the programme gets the same
 * answer as for a programme that does not exist, so nothing is learned about
 * a form by asking.
 *
 * WHERE IT GOES is never in the request. The test is sent to the address on
 * the caller's own session and to nobody else: a body that names another
 * address is not read, so nobody can be sent a decision email they did not
 * ask for. For the same reason a view-as session is turned away first: the
 * address on it is the member's.
 *
 * It tells no applicant anything and writes nothing to an application.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

const NO_PROGRAMME = "That programme is not on this form.";

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
  const kind = (raw && typeof raw === "object" ? (raw as { kind?: unknown }).kind : undefined) as
    | ProgrammeEmailKind
    | undefined;
  if (!kind || !PROGRAMME_EMAIL_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Say which of the emails to test." }, { status: 400 });
  }
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  // About the caller's own account, so it is said before anything is read.
  if (!user.email) {
    return NextResponse.json(
      { error: "Your account has no email address on file, so there is nowhere to send a test." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The role comes from the form, so the form is read before it is decided.
  const form = await loadForm(db, roundId);
  const role = form ? roleOnProgramme(user, form, programmeId) : null;
  if (!form || role === null) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  if (role === "reviewer") {
    return NextResponse.json(
      { error: "Only this programme’s lead or an admin can send a test of its emails." },
      { status: 403 },
    );
  }

  const firstName = (user.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const sent = await sendProgrammeTestEmail(
    db,
    { uid: user.uid, email: user.email, firstName },
    form,
    programmeId,
    kind,
  );
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
  return NextResponse.json({ ok: true, kind, delivery: sent.delivery, subject: sent.subject });
}
