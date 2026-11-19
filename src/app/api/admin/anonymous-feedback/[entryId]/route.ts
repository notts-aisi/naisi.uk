import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { markDealtWith, setNote } from "@/lib/societyFeedback/admin";
import { ADMIN_REFUSALS } from "@/lib/societyFeedback/words";

/**
 * Dealt with, and a note for admins, on one kept entry of anonymous feedback
 * (docs/surveys.md, "Anonymous feedback for the whole society"). Admins only.
 *
 * Body `{ action: "dealtWith" }` or `{ action: "note", text }`. Each records
 * which admin acted and when, on the entry: that is staff acting, and the
 * page says so in the note's own line. Nothing here touches what the sender
 * sent, and nothing reaches the sender (there is nobody to reach).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/anonymous-feedback/[entryId]">) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: ADMIN_REFUSALS.notAdmin }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { action?: unknown; text?: unknown } | null;
  const action = body?.action;
  if (action !== "dealtWith" && !(action === "note" && typeof body?.text === "string")) {
    return NextResponse.json({ error: ADMIN_REFUSALS.shape }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const { entryId } = await ctx.params;
  const admin = { uid: user.uid, name: user.displayName ?? "" };
  const now = new Date();
  const result = action === "dealtWith" ? await markDealtWith(db, entryId, admin, now) : await setNote(db, entryId, String(body?.text), admin, now);
  if (!result.ok) return NextResponse.json({ error: ADMIN_REFUSALS[result.problem] }, { status: result.status });
  return NextResponse.json({ ok: true });
}
