import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { readCrestChoice } from "@/lib/crests/choice";

const ONLY_ADMINS = "Only an admin can change a course’s crest.";
const NO_COURSE = "There is no course here.";
const BEING_DESTROYED = "This course is being deleted, so its crest can’t be changed.";

/**
 * Set or clear the programme crest a course carries. Admin only.
 *
 * A crest is one of the four keys in `src/components/ProgrammeCrest.tsx`, or
 * null for none, which shows the NAISI emblem in its place. This route is
 * the only writer of `courses/{id}.crest`: the course editor's own save is
 * client-direct and the rules keep `crest` as it was on every write that is
 * not an admin's. Which crest a page then shows is
 * `src/lib/crests/resolve.ts`'s to say, never this route's.
 *
 * Order: the view-as guard, then who is asking, then the body (read before
 * any document, so a malformed one gets the same answer whether or not the
 * course exists), then the course.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { courseId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: ONLY_ADMINS }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body) || !("crest" in body)) {
    return NextResponse.json({ error: "Say which crest, or none." }, { status: 400 });
  }
  const choice = readCrestChoice(body.crest);
  if (!choice.ok) return NextResponse.json({ error: choice.error }, { status: 400 });

  // A course id is one path segment. Anything else names no course.
  if (!courseId || courseId.includes("/")) {
    return NextResponse.json({ error: NO_COURSE }, { status: 404 });
  }
  const ref = db.collection("courses").doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: NO_COURSE }, { status: 404 });
  // The destroy cascade deletes the course last; a write landing meanwhile is
  // lost, or recreates a course that is meant to be gone.
  if ((snap.data() ?? {}).destroying === true) {
    return NextResponse.json({ error: BEING_DESTROYED }, { status: 409 });
  }

  await ref.update({ crest: choice.crest, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ crest: choice.crest });
}
