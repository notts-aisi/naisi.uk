import { NextResponse } from "next/server";
import { loadAudienceWorld, resolveAudience } from "@/lib/audience/load";
import { projectWhoLines } from "@/lib/audience/resolve";
import { scopeOf } from "@/lib/audience/scope";
import { parseAudienceBody } from "@/lib/audience/tags";
import { AUDIENCE_REFUSAL } from "@/lib/audience/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * SEE WHO: the names behind the picker's count, for a choice of tags
 * (`{ include, exclude, row }`, the body `/api/audience` takes). Each line is
 * a name, whether it is the caller, and whether they would be emailed; why
 * somebody is left out is said person by person to admins alone, and read by
 * everybody else as the count's reasons. Never an address and never an
 * account id.
 *
 * Only the tags the caller may use are resolved, and those are exactly the
 * people whose names they may already read (`src/lib/audience/scope.ts`):
 * who came to an event for the people who run check-in, a programme's people
 * for its lead, a group's for its facilitators. A tag outside that refuses
 * the whole request, before any name is read.
 *
 * A read: it sends and writes nothing, and answers a view-as session as it
 * would answer the member being viewed.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: AUDIENCE_REFUSAL.notSignedIn }, { status: 401 });
  if (!scopeOf(user)) return NextResponse.json({ error: AUDIENCE_REFUSAL.notApproved }, { status: 403 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = parseAudienceBody(raw);
  if (!body.ok) return NextResponse.json({ error: AUDIENCE_REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: AUDIENCE_REFUSAL.notConfigured }, { status: 500 });
  const world = await loadAudienceWorld(db, user, new Date());
  if (!world) return NextResponse.json({ error: AUDIENCE_REFUSAL.notApproved }, { status: 403 });
  const answer = await resolveAudience(db, world, body.selection, { row: body.row });
  if (!answer.ok) return NextResponse.json({ error: AUDIENCE_REFUSAL.notYours }, { status: 403 });
  return NextResponse.json({ people: projectWhoLines(world, answer.resolution) });
}
