import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { GUIDE_LIMITS } from "@/lib/courses/guide/limits";
import { startHereRubricCheck } from "@/lib/courses/guide/startHereRubric";
import { rubricOf, type CourseRubric } from "@/lib/courses/rubric";
import { normalizeCourse } from "@/lib/firestore/courses";
import {
  glossaryToMarkdown,
  readGlossaryMarkdown,
  readStartHereMarkdown,
  startHereToMarkdown,
  type GuideRead,
} from "@/lib/courses/guide/markdown";
import {
  GUIDE_FIELD,
  isGuideDocName,
  readRunGlossary,
  readRunStartHere,
  type GlossaryDoc,
  type GuideDocName,
  type StartHereDoc,
} from "@/lib/courses/guide/model";

/**
 * LOADING A PROGRAMME'S START HERE OR GLOSSARY (plan item 10; Q39 as for
 * weeks): the run editor's paste cards send the guide's Markdown here.
 *
 *   GET  ...  "Copy as Markdown": the stored document, as the guide's Markdown.
 *   POST ...  "Read it": what the Markdown holds, what to check, and what
 *             stops a save. Writes nothing.
 *   PUT  ...  "Save": the same read, then the document written onto the run.
 *
 * `[doc]` is `start-here` or `glossary`. Each document is stored on the run's
 * own document (`src/lib/courses/guide/model.ts`), which only the server
 * writes: a document is nested lists a rule cannot walk, so only here can it
 * be held to its check.
 *
 * WHO. Admins only, for now, as for a week (Q39: an admin loads the
 * curriculum; a lead's own loading comes with the Weeks tab). The gate is
 * decided before anything is read; every other caller meets the same 403.
 *
 * START HERE'S RUBRIC IS READ AGAINST THE COURSE'S. A fellow reads the rubric
 * on Start here, as guidance for writing, and the course keeps its own rubric
 * record, so a Start here paste whose rubric is not the course's says so
 * among the things to check (`startHereRubricCheck`). A check, never a
 * refusal: one more read, of the run's course, for Start here alone.
 */

type Params = { params: Promise<{ runId: string; doc: string }> };

type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const NAME: Record<GuideDocName, string> = { "start-here": "Start here", glossary: "The Glossary" };

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

/** The gate and the address, before any document is read. Each handler has refused a missing session first. */
async function gate(actor: Actor, params: Params["params"]): Promise<{ runId: string; doc: GuideDocName } | NextResponse> {
  const { runId, doc } = await params;
  if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isAddressableId(runId)) return badRequest("That isn’t a run.");
  if (!isGuideDocName(doc)) return badRequest("That isn’t a page of the guide: it’s start-here or glossary.");
  return { runId, doc };
}

/** The Markdown in a request's body, or the sentence that says what is wrong with it. */
async function markdownOf(req: Request, doc: GuideDocName): Promise<string | NextResponse> {
  let body: { markdown?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Send the Markdown as JSON.");
  }
  if (typeof body?.markdown !== "string" || body.markdown.trim() === "") {
    return badRequest(`Paste ${doc === "start-here" ? "Start here’s" : "the Glossary’s"} Markdown first.`);
  }
  if (body.markdown.length > GUIDE_LIMITS.pasteChars) {
    return badRequest(`That is ${body.markdown.length} characters; the most a paste can be is ${GUIDE_LIMITS.pasteChars}.`);
  }
  return body.markdown;
}

/** The run's stored data, or a 404. */
async function loadRun(db: Firestore, runId: string): Promise<Record<string, unknown> | NextResponse> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return snap.data() ?? {};
}

/** The rubric of the run's course, which feedback is given on, or null for a run with no course or a course with none. */
async function courseRubricOf(db: Firestore, run: Record<string, unknown>): Promise<CourseRubric | null> {
  const courseId = typeof run.courseId === "string" ? run.courseId : "";
  if (!isAddressableId(courseId)) return null;
  const snap = await db.collection("courses").doc(courseId).get();
  return snap.exists ? rubricOf(normalizeCourse(snap.id, snap.data() ?? {})) : null;
}

/** A paste, read; Start here's held to the course's rubric among the things to check. */
async function read(
  db: Firestore,
  doc: GuideDocName,
  markdown: string,
  run: Record<string, unknown>,
): Promise<GuideRead<StartHereDoc> | GuideRead<GlossaryDoc>> {
  if (doc !== "start-here") return readGlossaryMarkdown(markdown);
  const result = readStartHereMarkdown(markdown);
  const check = startHereRubricCheck(result.doc, await courseRubricOf(db, run));
  return check ? { ...result, checks: [...result.checks, check] } : result;
}

function stored(doc: GuideDocName, run: Record<string, unknown>): StartHereDoc | GlossaryDoc | null {
  return doc === "start-here" ? readRunStartHere(run) : readRunGlossary(run);
}

/** What "Read it" and a refused save show, field by field. */
function readAnswer(doc: GuideDocName, result: GuideRead<StartHereDoc> | GuideRead<GlossaryDoc>, has: boolean) {
  return {
    doc,
    found: result.found.map((row) => ({ state: row.state, label: row.label, detail: row.detail, indent: row.indent })),
    checks: [...result.checks],
    problems: [...result.problems],
    /** Whether the run has this page already: a save replaces it. */
    replaces: has,
  };
}

export async function GET(_req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const run = await loadRun(db, gated.runId);
  if (run instanceof NextResponse) return run;
  if (gated.doc === "start-here") {
    const doc = readRunStartHere(run);
    if (!doc) return NextResponse.json({ error: "This run has no Start here yet, so there is nothing to copy." }, { status: 404 });
    return NextResponse.json({ markdown: startHereToMarkdown(doc) });
  }
  const doc = readRunGlossary(run);
  if (!doc) return NextResponse.json({ error: "This run has no Glossary yet, so there is nothing to copy." }, { status: 404 });
  return NextResponse.json({ markdown: glossaryToMarkdown(doc), terms: doc.terms.length });
}

export async function POST(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const markdown = await markdownOf(req, gated.doc);
  if (markdown instanceof NextResponse) return markdown;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const run = await loadRun(db, gated.runId);
  if (run instanceof NextResponse) return run;
  return NextResponse.json(readAnswer(gated.doc, await read(db, gated.doc, markdown, run), stored(gated.doc, run) !== null));
}

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gated = await gate(actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const markdown = await markdownOf(req, gated.doc);
  if (markdown instanceof NextResponse) return markdown;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const run = await loadRun(db, gated.runId);
  if (run instanceof NextResponse) return run;
  // A run being destroyed is frozen, as every curriculum write treats it.
  if (run.destroying === true) {
    return NextResponse.json({ error: "This run is being destroyed and can’t be edited." }, { status: 409 });
  }
  const result = await read(db, gated.doc, markdown, run);
  const answer = readAnswer(gated.doc, result, stored(gated.doc, run) !== null);
  if (result.problems.length > 0) return badRequest(result.problems[0], answer);
  await db
    .collection("courseRuns")
    .doc(gated.runId)
    .update({ [GUIDE_FIELD[gated.doc]]: result.doc, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({
    saved: true,
    doc: gated.doc,
    message: `${NAME[gated.doc]} is saved.`,
  });
}
