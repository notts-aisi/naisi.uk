import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { ONLY_AN_ADMIN, moveFormStatus } from "@/lib/applications/lifecycle/move";
import { parseFormMove } from "@/lib/applications/lifecycle/status";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Open, close, reopen or settle an application form. The only route that
 * writes a form's status.
 *
 * `POST { status, confirm? }` moves the form to `status` by the same table a
 * round moves by. Everything it decides, and the order it decides it in, is
 * in `src/lib/applications/lifecycle/move.ts`.
 *
 * ADMIN ONLY, and decided before anything is read. A lead decides their own
 * programme; when the whole term opens and closes is not theirs to say.
 * Everybody else is answered in the same words whether or not the form
 * exists, so nobody learns that it does by asking.
 *
 * WHAT COMES BACK. `{ ok, changed, status }`, with `recordWarning` when the
 * term was settled and a member record could not be written. A refusal is
 * `{ error }` with a sentence an admin can act on, plus `needsConfirmation`
 * when the same request would go through confirmed, and `unmet` (each line
 * left before the form is ready) when it was asked to open and is not.
 */
export async function POST(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_AN_ADMIN }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseFormMove(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const moved = await moveFormStatus(db, user, roundId, parsed.request);
  if (!moved.ok) {
    return NextResponse.json(
      {
        error: moved.error,
        code: moved.code,
        ...(moved.needsConfirmation ? { needsConfirmation: true } : {}),
        ...(moved.unmet ? { unmet: moved.unmet } : {}),
      },
      { status: moved.status },
    );
  }
  return NextResponse.json({
    ok: true,
    changed: moved.changed,
    status: moved.status,
    ...(moved.recordWarning ? { recordWarning: moved.recordWarning } : {}),
  });
}
