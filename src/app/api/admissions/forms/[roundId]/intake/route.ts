import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { planIntake } from "@/lib/applications/intake/run";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A plan for the whole term, for an admin: `{ askClaude }`.
 *
 * The site drafts who goes where from every programme's decisions, Claude's
 * stored reads and the committee's scores (`src/lib/applications/intake/`);
 * with `askClaude`, Claude suggests changes, a facilitator shortlist from the
 * people who offered, and people who did not offer but should be asked, and
 * only what the plan's rules allow is kept. NOTHING IS WRITTEN AND NOTHING IS
 * STORED: Apply on the page makes each decision through the decision route,
 * which asks every question it always asks.
 *
 * A POST, because asking Claude sends the term's numbered reads to Anthropic.
 * Only an admin, refused before the body is read; a view-as session is
 * refused first. It may take most of the backend's 300-second request limit.
 */
export const maxDuration = 290;

export async function POST(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can plan the whole intake." }, { status: 403 });
  }

  const { roundId } = await ctx.params;
  if (!isAddressableId(roundId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { askClaude?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body?.askClaude !== "boolean") {
    return NextResponse.json({ error: "Say whether to ask Claude: askClaude true or false." }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await planIntake(db, user, roundId, { askClaude: body.askClaude });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ intake: result.intake }, { headers: { "Cache-Control": "no-store" } });
}
