import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { draftCase } from "@/lib/courses/facilitatorAsks/caseDraft";
import { NO_PROGRAMME } from "@/lib/courses/facilitatorAsks/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Draft with Claude" beside the sentence that makes the case to somebody who
 * did not offer to facilitate: `{ uid }`. Claude reads that person's
 * application alone and drafts the sentence; the answer is the draft and
 * what it drew on, for the admin's box. Nothing is stored and nobody is
 * emailed: only the Ask button sends, with whatever is in the box then.
 *
 * WHO MAY is an admin, decided by `draftCase` from the programme's own gate
 * once a valid body has arrived; a view-as session is turned away first. A
 * POST, because it sends an application to Anthropic. It may take most of the
 * backend's request limit.
 */

export const maxDuration = 290;

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
    raw = null;
  }
  const uid = raw && typeof raw === "object" ? (raw as { uid?: unknown }).uid : undefined;
  if (typeof uid !== "string" || !isId(uid)) {
    return NextResponse.json({ error: "Say whose sentence this is for." }, { status: 400 });
  }
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const drafted = await draftCase(db, user, roundId, programmeId, uid);
  if (!drafted.ok) return NextResponse.json({ error: drafted.error }, { status: drafted.status });
  return NextResponse.json({ ok: true, text: drafted.text, basis: drafted.basis });
}
