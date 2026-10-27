import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { courseRoutesProblems, type CourseRoutes } from "@/lib/courses/routes/model";
import { readRoutesMarkdown } from "@/lib/courses/routes/markdown";

/**
 * A COURSE'S ROUTES AND DEADLINES, SET BY AN ADMIN IN ONE PLACE
 * (`CourseDoc.routes`, `src/lib/courses/routes/model.ts`; Zach, Mon 26 Oct):
 *  - `POST /api/courses/[courseId]/routes` with `{ markdown }`: reads a pasted
 *    or edited list and answers what it found and what would stop it being
 *    saved. Writes nothing.
 *  - `PUT` with `{ markdown }`: saves it, once nothing stops it; or with
 *    `{ remove: true }`: takes the course's routes off, so a week that lists
 *    routes shows the guide's own tables again.
 *
 * ADMINS ONLY, decided before anything is read: every run of the course shows
 * these on the week that asks for them, and the facilitators' notes read
 * them. A list is groups of rows of words, nothing a rule can walk, so no
 * browser writes the field (the rules pin it); this route is its one writer.
 * View-as is refused first.
 *
 * Stored field by field from what was read, never the request's own object.
 */

export type RoutesReadAnswer = {
  /** What the list reads as, or null when there is no list in it. */
  routes: CourseRoutes | null;
  /** What stops it being saved, each a sentence that says what to change. Empty when it can be saved. */
  problems: string[];
};

/** Admins only, and a course id that can address a document; then the database. */
async function gate(ctx: { params: Promise<{ courseId: string }> }, actor: SessionUser) {
  const { courseId } = await ctx.params;
  if (!isAddressableId(courseId)) return { response: NextResponse.json({ error: "Course not found" }, { status: 404 }) };
  if (actor.role !== "admin") {
    return { response: NextResponse.json({ error: "Only an admin can change a course’s routes and deadlines." }, { status: 403 }) };
  }
  const db = getAdminDb();
  if (!db) return { response: NextResponse.json({ error: "Server not configured" }, { status: 500 }) };
  return { courseId, db };
}

async function bodyOf(req: Request): Promise<{ markdown?: string; remove?: boolean; error?: string }> {
  let body: { markdown?: unknown; remove?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return { error: "Send the routes as text." };
  }
  if (body.remove === true) return { remove: true };
  if (typeof body.markdown !== "string") return { error: "Send the routes as text." };
  return { markdown: body.markdown };
}

/** A list as stored: every field written out from what was read. */
function stored(routes: CourseRoutes) {
  const runs = (list: ReadonlyArray<{ text: string; bold?: boolean; italic?: boolean; href?: string }>) =>
    list.map((run) => ({
      text: run.text,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.href ? { href: run.href } : {}),
    }));
  return {
    checkedOn: routes.checkedOn,
    intro: JSON.parse(JSON.stringify(routes.intro)) as unknown[],
    groups: routes.groups.map((group) => ({
      heading: group.heading,
      routes: group.routes.map((route) => ({
        name: route.name,
        url: route.url,
        what: runs(route.what),
        suits: runs(route.suits),
        deadline: route.deadline,
        rolling: route.rolling,
        nextRound: runs(route.nextRound),
      })),
    })),
    after: JSON.parse(JSON.stringify(routes.after)) as unknown[],
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(ctx, actor);
  if ("response" in gated) return gated.response;
  const sent = await bodyOf(req);
  if (sent.error || sent.markdown === undefined) {
    return NextResponse.json({ error: sent.error ?? "Send the routes as text." }, { status: 400 });
  }
  const answer: RoutesReadAnswer = readRoutesMarkdown(sent.markdown);
  return NextResponse.json(answer);
}

export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(ctx, actor);
  if ("response" in gated) return gated.response;
  const { courseId, db } = gated;
  const sent = await bodyOf(req);
  if (sent.error) return NextResponse.json({ error: sent.error }, { status: 400 });

  let routes: CourseRoutes | null = null;
  if (!sent.remove) {
    const read = readRoutesMarkdown(sent.markdown ?? "");
    if (!read.routes || read.problems.length > 0) {
      return NextResponse.json({ error: read.problems[0] ?? "There are no routes in that.", problems: read.problems }, { status: 400 });
    }
    const problems = courseRoutesProblems(read.routes);
    if (problems.length > 0) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
    routes = read.routes;
  }

  const ref = db.collection("courses").doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  await ref.update({
    routes: routes ? stored(routes) : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, routes });
}
