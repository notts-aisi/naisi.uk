import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { loadAssessment, runAssessmentPart } from "@/lib/applications/assessment/run";
import type { AssessmentPart } from "@/lib/applications/assessment/types";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Claude's read and Pangram's check of one application, for an admin.
 *
 * GET answers what has already been made of it, and changes nothing. POST
 * asks for one part, `{ part: "claude" | "pangram", programmeId? }`, keeps
 * what came back and answers the same view. Asking sends the application's
 * answers and the committee's reviews to Anthropic or Pangram, with no names
 * in them, which is why it is a button an admin presses and never part of
 * opening the review screen.
 *
 * `src/lib/applications/assessment/run.ts` decides who may: an admin, refused
 * before anything is read for anybody else, then whatever `loadReview` would
 * refuse on the review screen itself. The admin check is made here too, before
 * the body is read, so nobody else learns what a valid request looks like.
 *
 * A POST may take most of the backend's 300-second request limit: Claude's
 * part is told to stop at 150 seconds, and usually takes under one minute.
 */
export const maxDuration = 290;

const ONLY_ADMINS = "Only an admin can ask for an assessment.";

function programmeFrom(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return null;
  return isAddressableId(value) ? value : undefined;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ roundId: string; uid: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_ADMINS }, { status: 403 });

  const { roundId, uid } = await ctx.params;
  const programmeId = programmeFrom(new URL(req.url).searchParams.get("programme"));
  if (!isAddressableId(roundId) || !isAddressableId(uid) || programmeId === undefined) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await loadAssessment(db, user, roundId, uid, programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ assessment: result.assessment }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ roundId: string; uid: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_ADMINS }, { status: 403 });

  const { roundId, uid } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(uid)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: { part?: unknown; programmeId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const part: AssessmentPart | null = body?.part === "claude" || body?.part === "pangram" ? body.part : null;
  const programmeId = programmeFrom(typeof body?.programmeId === "string" ? body.programmeId : null);
  if (!part || programmeId === undefined) {
    return NextResponse.json({ error: "Say which part to ask for: claude or pangram." }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await runAssessmentPart(db, user, roundId, uid, programmeId, part);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ assessment: result.assessment }, { headers: { "Cache-Control": "no-store" } });
}
