import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { facilitatorGuideWriter, type GuideWriter } from "@/lib/courses/facilitatorGuide/access";
import { guideToMarkdown, readGuideMarkdown, type ReadGuide } from "@/lib/courses/facilitatorGuide/markdown";
import { GUIDE_LIMITS, parseSlotKey, slotLabel, type GuideSlot } from "@/lib/courses/facilitatorGuide/model";
import { readGuideSlot, saveGuideSlot } from "@/lib/courses/facilitatorGuide/store";

/**
 * LOADING ONE DOCUMENT OF A COURSE'S FACILITATOR GUIDE: the admin's paste
 * card (`/admin/courses/[courseId]/facilitator-guide`) sends a document's
 * Markdown here, for one place in the guide (`[slot]`: `handbook`,
 * `w03-plan`, `w03-notes`, ...).
 *
 *   GET  ...  "Copy as Markdown": the stored document, written out.
 *   POST ...  "Read it": what the Markdown holds, what to check, what stops a
 *             save, and what saving would replace. Writes nothing.
 *   PUT  ...  "Save": the same read, then the document written in its place.
 *
 * WHO. Admins, decided on the session before anything is read, and the lead
 * of a programme that names a live run of the course, while they stand as
 * one: the Weeks tab's "Facilitator guide" box (board pr-weeks) sends here
 * for each week's session plan and notes. Every other caller meets the same
 * 403 (`facilitatorGuideWriter`). The store takes a `GuideWriter`, which only
 * the gate mints.
 *
 * THE COLLECTION IS SHUT TO EVERY BROWSER (`courseFacilitatorGuide`), so this
 * is the only way a document gets in. What is saved is what was read: the
 * paste is read again on Save, and refused (400) while anything stops it.
 */

type Params = { params: Promise<{ courseId: string; slot: string }> };

type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type Db = NonNullable<ReturnType<typeof getAdminDb>>;

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

/**
 * The gate and the address, before any document of the guide is read. Each
 * handler has refused a missing session first. An admin on an id that is not
 * one is told so; everybody the gate does not admit gets the one 403.
 */
async function gate(db: Db, actor: Actor, params: Params["params"]): Promise<{ writer: GuideWriter; slot: GuideSlot } | NextResponse> {
  const { courseId, slot } = await params;
  const writer = await facilitatorGuideWriter(db, actor, courseId);
  if (!writer) return actor.role === "admin" ? badRequest("That isn’t a course.") : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const place = parseSlotKey(slot);
  if (!place) {
    return badRequest("That isn’t a place in the facilitator guide: a course document, or a week’s session plan or notes (w01-plan to w60-notes).");
  }
  return { writer, slot: place };
}

/** The Markdown in a request's body, or the sentence that says what is wrong with it. */
async function markdownOf(req: Request): Promise<string | NextResponse> {
  let body: { markdown?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Send the document’s Markdown as JSON.");
  }
  if (typeof body?.markdown !== "string" || body.markdown.trim() === "") {
    return badRequest("Paste the document’s Markdown first.");
  }
  if (body.markdown.length > GUIDE_LIMITS.maxPasteChars) {
    return badRequest(`That is ${body.markdown.length} characters; a document’s Markdown can be at most ${GUIDE_LIMITS.maxPasteChars}.`);
  }
  return body.markdown;
}

/** Whether the course is there: a 404 for the admin when it is not. */
async function courseThere(db: Db, writer: GuideWriter): Promise<NextResponse | null> {
  const snap = await db.collection("courses").doc(writer.courseId).get();
  return snap.exists ? null : NextResponse.json({ error: "Course not found" }, { status: 404 });
}

/** What "Read it" and a refused save show, field by field. */
function readAnswer(read: ReadGuide, slot: GuideSlot, replaces: string | null) {
  return {
    place: slotLabel(slot),
    title: read.doc.title,
    found: read.found.map((row) => ({ state: row.state, label: row.label, detail: row.detail, indent: row.indent })),
    checks: [...read.checks],
    problems: [...read.problems],
    /** The title of the document saving would replace, or null when the place is empty. */
    replaces,
  };
}

export async function GET(_req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const gated = await gate(db, actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const missing = await courseThere(db, gated.writer);
  if (missing) return missing;
  const stored = await readGuideSlot(db, gated.writer, gated.slot);
  if (!stored) {
    return NextResponse.json({ error: `Nothing is loaded as ${slotLabel(gated.slot)} yet, so there is nothing to copy.` }, { status: 404 });
  }
  return NextResponse.json({ markdown: guideToMarkdown(stored) });
}

export async function POST(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const gated = await gate(db, actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const markdown = await markdownOf(req);
  if (markdown instanceof NextResponse) return markdown;
  const missing = await courseThere(db, gated.writer);
  if (missing) return missing;
  const stored = await readGuideSlot(db, gated.writer, gated.slot);
  return NextResponse.json(readAnswer(readGuideMarkdown(markdown, gated.slot), gated.slot, stored?.title ?? null));
}

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const gated = await gate(db, actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const markdown = await markdownOf(req);
  if (markdown instanceof NextResponse) return markdown;
  const missing = await courseThere(db, gated.writer);
  if (missing) return missing;
  const read = readGuideMarkdown(markdown, gated.slot);
  if (read.problems.length > 0) {
    const stored = await readGuideSlot(db, gated.writer, gated.slot);
    return badRequest(read.problems[0], readAnswer(read, gated.slot, stored?.title ?? null));
  }
  await saveGuideSlot(db, gated.writer, gated.slot, read.doc);
  return NextResponse.json({ saved: true, place: slotLabel(gated.slot), title: read.doc.title, blocks: read.doc.blocks.length });
}
