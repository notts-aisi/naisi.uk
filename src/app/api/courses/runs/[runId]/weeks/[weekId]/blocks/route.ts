import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  COURSE_FIELD_LIMITS,
  normalizeCourse,
  normalizeCourseRun,
  normalizeCourseWeek,
  type CourseWeekDoc,
} from "@/lib/firestore/courses";
import { dayBeforeWords, weekToMarkdown } from "@/lib/courses/weekBlocks/markdownWrite";
import { isBlockWeek, type WeekItem } from "@/lib/courses/weekBlocks/model";
import { MAX_PASTE_CHARS, readPastedWeek, type PastedWeek } from "@/lib/courses/weekBlocks/paste";

/**
 * LOADING A WEEK AS BLOCKS (board pr-weeks, Option B; Q39): the run's week
 * editor sends the week's Markdown here.
 *
 *   GET  ...  "Copy as Markdown": the stored block week, ids written in.
 *   POST ...  "Read it": what the Markdown holds, what to check, what stops a
 *             save, and the answers on whatever the paste would take out.
 *             Writes nothing.
 *   PUT  ...  "Save": the same read, then the blocks and the title written.
 *
 * WHY A ROUTE AND NOT THE EDITOR'S OWN WRITES. The rest of the week editor
 * writes client-direct, but a paste cannot: whether it may take an item out
 * depends on the answers people have given to it, which live in other
 * people's rows (ticks, written answers, reflections, facilitators' notes)
 * that no browser may read; and blocks are nested lists a rule cannot walk, so
 * only the server can hold them to `weekBlocksProblems`. The rules keep every
 * browser write off `blocks`, so this is the only way in.
 *
 * WHO. Admins only, for now (Q39: the curriculum is loaded by an admin; a
 * lead's Weeks tab and a group's own copy come later and will widen this).
 * The gate is decided before anything is read; every other caller meets the
 * same 403.
 *
 * WHAT SAVE CHECKS. The paste is read again against the week as stored at
 * that moment, so what is saved is what was read, with its ids settled. A
 * paste with a problem is refused (400). A paste that takes out items with
 * answers is refused (409) until the body confirms the count it was shown,
 * so a count that has grown since "Read it" asks again.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

/** The week document id the plan uses: "w01" to "w60". */
const WEEK_ID = /^w\d\d$/;

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

/** The gate and the address, before any document is read. */
async function gate(params: Params["params"]): Promise<{ runId: string; weekId: string; uid: string } | NextResponse> {
  const { runId, weekId } = await params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isAddressableId(runId)) return badRequest("That isn’t a run.");
  if (!WEEK_ID.test(weekId)) return badRequest("That isn’t a week of the run: weeks are w01 to w60.");
  return { runId, weekId, uid: actor.uid };
}

/** The Markdown in a request's body, or the sentence that says what is wrong with it. */
async function markdownOf(req: Request): Promise<{ markdown: string; confirmAnswers: number | null } | NextResponse> {
  let body: { markdown?: unknown; confirmAnswers?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Send the week’s Markdown as JSON.");
  }
  if (typeof body?.markdown !== "string" || body.markdown.trim() === "") {
    return badRequest("Paste the week’s Markdown first.");
  }
  if (body.markdown.length > MAX_PASTE_CHARS) {
    return badRequest(`That is ${body.markdown.length} characters; a week’s Markdown can be at most ${MAX_PASTE_CHARS}.`);
  }
  const confirm = body.confirmAnswers;
  if (confirm !== undefined && confirm !== null && !(typeof confirm === "number" && Number.isInteger(confirm) && confirm >= 0)) {
    return badRequest("The number of answers to confirm has to be a whole number.");
  }
  return { markdown: body.markdown, confirmAnswers: typeof confirm === "number" ? confirm : null };
}

type Loaded = { week: CourseWeekDoc; weekNumber: number; dayBeforeTime: string | null };

/** The run, its course's day-before time and the week, or a 404 that says which is missing. */
async function load(db: Firestore, runId: string, weekId: string): Promise<Loaded | NextResponse> {
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const weekSnap = await db.collection("courseRuns").doc(runId).collection("weeks").doc(weekId).get();
  if (!weekSnap.exists) {
    return NextResponse.json({ error: "This week has no document yet: open it from the run’s week plan first." }, { status: 404 });
  }
  const week = normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {});
  const courseSnap = run.courseId ? await db.collection("courses").doc(run.courseId).get() : null;
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}) : null;
  const slot = run.weekPlan.find((entry) => entry.kind === "week" && entry.weekId === weekId);
  const weekNumber = slot && slot.kind === "week" ? slot.weekNumber : week.weekNumber;
  return { week, weekNumber, dayBeforeTime: course?.dayBeforeDueTime ?? null };
}

/** The paste, read against the week as stored, with the title's cap held too. */
function readAgainst(markdown: string, loaded: Loaded): PastedWeek {
  const read = readPastedWeek({
    markdown,
    weekNumber: loaded.weekNumber,
    stored: loaded.week.blocks ?? null,
    dayBeforeTime: loaded.dayBeforeTime,
  });
  if (read.title.length > COURSE_FIELD_LIMITS.weekTitle) {
    read.problems.push(`The title is ${read.title.length} characters; the most is ${COURSE_FIELD_LIMITS.weekTitle}.`);
  }
  return read;
}

/**
 * The answers on the items a paste takes out, by item id: ticks and ratings
 * (`courseProgress`), written answers and reflections (`courseExerciseResponses`,
 * this week's), and facilitators' notes on a source (`courseMaterialNotes`).
 * Each read is equality on the run alone, filtered here, so no read needs a
 * composite index. Nothing is read when nothing goes.
 */
async function answersOn(db: Firestore, runId: string, weekId: string, removed: readonly WeekItem[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const ids = new Set(removed.map((item) => item.id));
  if (ids.size === 0) return counts;
  const add = (id: unknown) => {
    if (typeof id === "string" && ids.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  const [progress, responses, notes] = await Promise.all([
    db.collection("courseProgress").where("runId", "==", runId).get(),
    db.collection("courseExerciseResponses").where("runId", "==", runId).get(),
    db.collection("courseMaterialNotes").where("runId", "==", runId).get(),
  ]);
  for (const doc of progress.docs) add(doc.data()?.itemId);
  for (const doc of responses.docs) {
    const row = doc.data();
    if (row?.weekId === weekId) add(row.exerciseId);
  }
  for (const doc of notes.docs) add(doc.data()?.itemId);
  return counts;
}

/** What "Read it" and a refused save show: the read, field by field, and the answers at stake. */
function readAnswer(read: PastedWeek, counts: Map<string, number>, loaded: Loaded) {
  const answers = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return {
    /** The course's day-before rule in words ("by noon the day before"), for the line under the found list. */
    due: dayBeforeWords(loaded.dayBeforeTime),
    title: read.title,
    found: read.found.map((row) => ({ state: row.state, label: row.label, detail: row.detail, indent: row.indent })),
    checks: [...read.checks],
    problems: [...read.problems],
    removed: read.removed.map((item) => ({ id: item.id, kind: item.kind, label: item.label, answers: counts.get(item.id) ?? 0 })),
    answers,
    kept: read.kept,
    minted: read.minted,
    blockCount: read.blocks.length,
  };
}

export async function GET(_req: Request, ctx: Params) {
  const gated = await gate(ctx.params);
  if (gated instanceof NextResponse) return gated;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const loaded = await load(db, gated.runId, gated.weekId);
  if (loaded instanceof NextResponse) return loaded;
  if (!isBlockWeek(loaded.week)) {
    return NextResponse.json({ error: "This week isn’t written as blocks yet, so there is nothing to copy." }, { status: 404 });
  }
  const markdown = weekToMarkdown(
    { weekNumber: loaded.weekNumber, title: loaded.week.title, blocks: loaded.week.blocks },
    { dayBeforeTime: loaded.dayBeforeTime },
  );
  return NextResponse.json({ markdown });
}

export async function POST(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const gated = await gate(ctx.params);
  if (gated instanceof NextResponse) return gated;
  const sent = await markdownOf(req);
  if (sent instanceof NextResponse) return sent;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const loaded = await load(db, gated.runId, gated.weekId);
  if (loaded instanceof NextResponse) return loaded;
  const read = readAgainst(sent.markdown, loaded);
  const counts = await answersOn(db, gated.runId, gated.weekId, read.removed);
  return NextResponse.json(readAnswer(read, counts, loaded));
}

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const gated = await gate(ctx.params);
  if (gated instanceof NextResponse) return gated;
  const sent = await markdownOf(req);
  if (sent instanceof NextResponse) return sent;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const loaded = await load(db, gated.runId, gated.weekId);
  if (loaded instanceof NextResponse) return loaded;
  const read = readAgainst(sent.markdown, loaded);
  const counts = await answersOn(db, gated.runId, gated.weekId, read.removed);
  const answer = readAnswer(read, counts, loaded);
  if (read.problems.length > 0) return badRequest(read.problems[0], answer);
  if (answer.answers > 0 && sent.confirmAnswers !== answer.answers) {
    return NextResponse.json(
      {
        error: `This paste takes out ${answer.removed.filter((item) => item.answers > 0).length === 1 ? "an item" : "items"} with ${answer.answers} ${answer.answers === 1 ? "answer" : "answers"}. Confirm to save it anyway.`,
        ...answer,
      },
      { status: 409 },
    );
  }
  await db
    .collection("courseRuns")
    .doc(gated.runId)
    .collection("weeks")
    .doc(gated.weekId)
    .update({
      blocks: read.blocks,
      ...(read.title ? { title: read.title } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: gated.uid,
    });
  return NextResponse.json({
    saved: true,
    blockCount: read.blocks.length,
    kept: read.kept,
    minted: read.minted,
    removed: read.removed.length,
    answers: answer.answers,
  });
}
