import { NextResponse } from "next/server";
import { loadAudienceWorld, resolveAudience } from "@/lib/audience/load";
import { projectAudienceCount, projectCatalogue } from "@/lib/audience/resolve";
import { scopeOf } from "@/lib/audience/scope";
import { parseAudienceBody } from "@/lib/audience/tags";
import { AUDIENCE_REFUSAL } from "@/lib/audience/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "WHO IS THIS FOR?": the tags a person may use, and who a choice of them
 * reaches. It sends nothing and writes nothing.
 *
 *  - GET: the caller's tags, grouped as the picker lists them, each with how
 *    many people are in it now; the people they may name one by one (admins
 *    and SU-recognised committee only); and the rows a message by settings
 *    may read.
 *  - POST `{ include, exclude, row }`: how many people the choice reaches,
 *    how many would be emailed and how many left out, why, and how it would
 *    be sent. Counts only: the names are `./who`'s, and an address is in
 *    neither answer.
 *
 * Every approved account is answered, with the tags its records give it, so
 * a member who leads and facilitates nothing reads an empty list. A tag the
 * caller may not use, or one that has gone, refuses the whole request.
 *
 * Both are reads. They are not refused during a view-as session: what a
 * member would be offered, and what their choice reaches, is the question
 * view-as exists to answer.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: AUDIENCE_REFUSAL.notSignedIn }, { status: 401 });
  if (!scopeOf(user)) return NextResponse.json({ error: AUDIENCE_REFUSAL.notApproved }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: AUDIENCE_REFUSAL.notConfigured }, { status: 500 });
  const world = await loadAudienceWorld(db, user, new Date());
  if (!world) return NextResponse.json({ error: AUDIENCE_REFUSAL.notApproved }, { status: 403 });
  return NextResponse.json(projectCatalogue(world));
}

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
  return NextResponse.json({ count: projectAudienceCount(answer.resolution) });
}
