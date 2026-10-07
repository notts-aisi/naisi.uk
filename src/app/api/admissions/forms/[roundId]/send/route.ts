import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { buildSendBoard, runDecisionDay } from "@/lib/applications/decisionDay/send";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Decision day: every applicant's outcome, published and emailed in one send.
 *
 *  - `GET` is everything the page shows: whether the term is ready, the four
 *    groups, and each email as it will read. It writes nothing and sends
 *    nothing.
 *  - `POST` is the send.
 *
 * ADMIN ONLY, and decided before anything is read. A lead decides their own
 * programme; telling the whole term is not theirs to do.
 *
 * THE BODY SAYS HOW MANY EMAILS THE PAGE SHOWED. The button names a number, and
 * a lead can change a decision until Send is pressed, so the number is sent
 * back with the press and the send is refused if it is no longer true. What
 * goes is what the admin read.
 *
 * Everything the send does, and the order it does it in, is in
 * `src/lib/applications/decisionDay/send.ts`.
 */

type Ctx = { params: Promise<{ roundId: string }> };

const NOT_ADMIN = "Only an admin can send decisions.";

export async function GET(_req: Request, ctx: Ctx) {
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_ADMIN }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const form = await loadForm(db, roundId);
  if (!form) {
    return NextResponse.json({ error: "There is no application form here." }, { status: 404 });
  }
  const board = await buildSendBoard(db, form, new Date());
  return NextResponse.json({ board });
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_ADMIN }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as {
    emails?: unknown;
    emailDeclined?: unknown;
  };
  const emails = body.emails;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 0) {
    return NextResponse.json(
      { error: "Say how many emails this send is for. Reload the page and press Send again." },
      { status: 400 },
    );
  }
  const emailDeclined = body.emailDeclined === true;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let sent: Awaited<ReturnType<typeof runDecisionDay>>;
  try {
    sent = await runDecisionDay(
      db,
      { uid: user.uid, displayName: user.displayName },
      roundId,
      { emails, emailDeclined },
    );
  } catch (err) {
    // Whatever was published before this is still published, and the next
    // press carries on from it. Nothing is ever told twice.
    console.error("[decision day] the send threw", roundId, err);
    return NextResponse.json(
      {
        error:
          "The send stopped part way. Reload the page to see who has been told, then press Send for the rest.",
      },
      { status: 500 },
    );
  }
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });

  const form = await loadForm(db, roundId);
  if (!form) {
    return NextResponse.json({ error: "There is no application form here." }, { status: 404 });
  }
  const board = await buildSendBoard(db, form, new Date());
  const { report } = sent;
  return NextResponse.json({
    ok: true,
    report: {
      published: report.published,
      emailed: report.emailed,
      held: report.held,
      suppressed: report.suppressed,
      failed: report.failed,
      notEmailed: report.notEmailed,
      skipped: report.skipped,
      changed: report.changed,
      notReached: report.notReached,
      failedNames: report.failedNames,
      stopped: report.stopped,
      complete: report.complete,
    },
    board,
  });
}
