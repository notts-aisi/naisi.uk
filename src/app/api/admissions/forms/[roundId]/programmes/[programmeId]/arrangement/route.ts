import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { arrangeProgramme } from "@/lib/applications/arrange/advise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A proposed arrangement of a programme's people into groups, for an admin:
 * `{ askClaude, minutes?, size? }`.
 *
 * The site works out a first arrangement from when each person said they are
 * free (`src/lib/applications/arrange/plan.ts`); with `askClaude`, Claude
 * suggests a facilitator for each group and moves, and only what the plan's
 * rules allow is kept (`arrange/advice.ts`). NOTHING IS WRITTEN AND NOTHING IS
 * STORED: the admin reads the answer, and Apply on the page places people
 * through the site's own routes for groups, places and facilitators, which
 * ask every question they always ask. Nobody is emailed until Publish.
 *
 * A POST, because asking Claude sends the people's numbered reads to
 * Anthropic. Only an admin, refused before the body is read; a view-as
 * session is refused first. It may take most of the backend's 300-second
 * request limit.
 */
export const maxDuration = 290;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can ask for an arrangement." }, { status: 403 });
  }

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: { askClaude?: unknown; minutes?: unknown; size?: unknown };
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

  const result = await arrangeProgramme(db, user, roundId, programmeId, {
    askClaude: body.askClaude,
    minutes: body.minutes,
    size: body.size,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ arrangement: result.arrangement }, { headers: { "Cache-Control": "no-store" } });
}
