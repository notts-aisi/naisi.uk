import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { rubricProblems, type CourseRubric } from "@/lib/courses/rubric";
import { readRubricMarkdown } from "@/lib/courses/rubricMarkdown";

/**
 * A COURSE'S RUBRIC FOR WRITTEN ANSWERS, SET BY AN ADMIN IN THE COURSE'S
 * DETAILS (`CourseDoc.rubric`, `src/lib/courses/rubric.ts`):
 *  - `POST /api/courses/[courseId]/rubric` with `{ markdown }`: reads a
 *    pasted or typed table and answers what it found and what would stop it
 *    being saved. Writes nothing.
 *  - `PUT` with `{ markdown }`: saves it, once nothing stops it; or with
 *    `{ remove: true }`: takes the course's rubric off, so its review page
 *    offers the comment alone.
 *
 * ADMINS ONLY, decided before anything is read: every run of the course gives
 * feedback on these rows, so a change reaches every group of every run. A
 * rubric is rows of words and nothing a rule can walk, so no browser writes
 * the field (the rules pin it); this route is its one writer. View-as is
 * refused first.
 *
 * Feedback already sent keeps the levels and descriptors it was given with:
 * changing the rubric changes what is offered next, never what was sent.
 */

export type RubricReadAnswer = {
  /** What the table reads as, or null when there is no table in it. */
  rubric: CourseRubric | null;
  /** What stops it being saved, each a sentence that says what to change. Empty when it can be saved. */
  problems: string[];
};

async function gate(ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params;
  if (!isAddressableId(courseId)) return { response: NextResponse.json({ error: "Course not found" }, { status: 404 }) };
  const actor = await getCurrentUser();
  if (!actor) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (actor.role !== "admin") {
    return { response: NextResponse.json({ error: "Only an admin can change a course’s rubric." }, { status: 403 }) };
  }
  const db = getAdminDb();
  if (!db) return { response: NextResponse.json({ error: "Server not configured" }, { status: 500 }) };
  return { courseId, db };
}

async function markdownOf(req: Request): Promise<{ markdown?: string; remove?: boolean; error?: string }> {
  let body: { markdown?: unknown; remove?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return { error: "Send the rubric’s table as text." };
  }
  if (body.remove === true) return { remove: true };
  if (typeof body.markdown !== "string") return { error: "Send the rubric’s table as text." };
  return { markdown: body.markdown };
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const gated = await gate(ctx);
  if ("response" in gated) return gated.response;
  const sent = await markdownOf(req);
  if (sent.error || sent.markdown === undefined) {
    return NextResponse.json({ error: sent.error ?? "Send the rubric’s table as text." }, { status: 400 });
  }
  const read = readRubricMarkdown(sent.markdown);
  const answer: RubricReadAnswer = read.ok ? { rubric: read.rubric, problems: read.problems } : { rubric: null, problems: read.problems };
  return NextResponse.json(answer);
}

export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const gated = await gate(ctx);
  if ("response" in gated) return gated.response;
  const { courseId, db } = gated;
  const sent = await markdownOf(req);
  if (sent.error) return NextResponse.json({ error: sent.error }, { status: 400 });

  let rubric: CourseRubric | null = null;
  if (!sent.remove) {
    const read = readRubricMarkdown(sent.markdown ?? "");
    if (!read.ok) return NextResponse.json({ error: read.problems[0] }, { status: 400 });
    const problems = rubricProblems(read.rubric);
    if (problems.length > 0) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
    rubric = read.rubric;
  }

  const ref = db.collection("courses").doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  await ref.update({
    // Stored field by field, never the request's own object.
    rubric: rubric ? { levels: [...rubric.levels], rows: rubric.rows.map((row) => ({ name: row.name, descriptors: [...row.descriptors] })) } : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, rubric });
}
