import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { facilitatorGuideReader } from "@/lib/courses/facilitatorGuide/access";
import { readGuideIndex } from "@/lib/courses/facilitatorGuide/store";
import { GUIDE_REFUSED } from "@/lib/courses/facilitatorGuide/words";

/**
 * WHAT A COURSE'S FACILITATOR GUIDE HOLDS, for a page drawn in the browser
 * that links into it (a facilitator's Home: "Facilitator guide" under this
 * week's title, only when that week has something loaded).
 *
 *   GET  ->  { courseId, documents: [{ key, label, title }], weeks: [{ weekNumber, plan, notes }] }
 *
 * Titles only, never the words under them: the pages that show a document
 * are drawn on the server behind the same gate
 * (`/learn/facilitator-guide/[courseId]`).
 *
 * WHO: the gate's three (`src/lib/courses/facilitatorGuide/access.ts`): a
 * facilitator of a live group on a run of the course, the lead of a
 * programme that names a run of it, and admins. Everybody else, and a course
 * that is not there, meet one 403. A GET writes nothing.
 */

export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { courseId } = await ctx.params;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const reader = await facilitatorGuideReader(db, actor, courseId);
  if (!reader) return NextResponse.json({ error: GUIDE_REFUSED }, { status: 403 });
  const index = await readGuideIndex(db, reader);
  return NextResponse.json({
    courseId: index.courseId,
    documents: index.documents.map((doc) => ({ key: doc.key, label: doc.label, title: doc.title })),
    weeks: index.weeks.map((week) => ({ weekNumber: week.weekNumber, plan: week.plan, notes: week.notes })),
  });
}
