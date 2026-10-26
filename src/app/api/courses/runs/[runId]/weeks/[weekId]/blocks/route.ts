import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { weekToMarkdown } from "@/lib/courses/weekBlocks/markdownWrite";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import {
  answersOnRemoved,
  pasteAnswer,
  pasteBodyOf,
  readPasteAgainst,
  unconfirmedAnswers,
  type PasteBody,
} from "@/lib/courses/weekPaste";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { emptyWeekFields, normalizeCourse, normalizeCourseRun, normalizeCourseWeek, type CourseWeekDoc } from "@/lib/firestore/courses";

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
 * WHO. Admins, and the lead of the programme that names the run, while they
 * stand as one (`programmeLedBy`, the lead's half of the gate every run route
 * a lead passes asks): the run's week editor sends here for an admin, the
 * programme's Weeks tab for its lead and admins (board pr-weeks, Q39). The
 * gate is decided before anything of the run is read (only the forms, for
 * whether the caller leads the programme that names it); every other caller
 * meets the same 403. Everything below is asked of the lead exactly as of an
 * admin. A group's own copy of a week has its own route
 * (`/api/courses/groups/[groupId]/weeks/[weekId]/blocks`).
 *
 * WHAT SAVE CHECKS. The paste is read again against the week as stored at
 * that moment, so what is saved is what was read, with its ids settled. A
 * paste with a problem is refused (400). A paste that takes out items with
 * answers is refused (409) until the body confirms the count it was shown,
 * so a count that has grown since "Read it" asks again.
 *
 * A WEEK WITH NO PAGE YET (Zach, 26 October 2026). A week of the run's plan
 * that nobody has opened in the run's week editor is read as an empty one,
 * and its first save makes its page: the same document the week editor makes
 * (`emptyWeekFields`, unpublished), with the blocks and the title in it, so
 * the lead needs nobody else to start a week. `create` refuses if the page
 * was made since the read (409, read it again). A week that is not in the
 * plan and has no page is not a week of the run (404).
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

/** The week document id the plan uses: "w01" to "w60". */
const WEEK_ID = /^w\d\d$/;

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * The gate and the address, before any document of the run is read. Each
 * handler has refused a missing session first. An admin, or the lead of the
 * programme that names the run, asked of the forms alone.
 */
async function gate(db: Firestore, actor: Actor, params: Params["params"]): Promise<{ runId: string; weekId: string; uid: string } | NextResponse> {
  const { runId, weekId } = await params;
  if (actor.role !== "admin" && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isAddressableId(runId)) return badRequest("That isn’t a run.");
  if (!WEEK_ID.test(weekId)) return badRequest("That isn’t a week of the run: weeks are w01 to w60.");
  return { runId, weekId, uid: actor.uid };
}

/** The Markdown in a request's body, or a 400 that says what is wrong with it. */
async function markdownOf(req: Request): Promise<PasteBody | NextResponse> {
  const sent = await pasteBodyOf(req);
  return "error" in sent ? badRequest(sent.error) : sent;
}

/** `exists` is false for a week of the plan with no page yet, read as an empty one. */
type Loaded = { week: CourseWeekDoc; weekNumber: number; dayBeforeTime: string | null; exists: boolean };

/** The run, its course's day-before time and the week, or a 404 that says which is missing. */
async function load(db: Firestore, runId: string, weekId: string): Promise<Loaded | NextResponse> {
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const slot = run.weekPlan.find((entry) => entry.kind === "week" && entry.weekId === weekId);
  const planned = slot && slot.kind === "week" ? slot.weekNumber : null;
  const weekSnap = await db.collection("courseRuns").doc(runId).collection("weeks").doc(weekId).get();
  let week: CourseWeekDoc;
  if (weekSnap.exists) week = normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {});
  else if (planned !== null) week = normalizeCourseWeek(weekId, emptyWeekFields(planned));
  else return NextResponse.json({ error: "That week isn’t in this run’s week plan." }, { status: 404 });
  const courseSnap = run.courseId ? await db.collection("courses").doc(run.courseId).get() : null;
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}) : null;
  return { week, weekNumber: planned ?? week.weekNumber, dayBeforeTime: course?.dayBeforeDueTime ?? null, exists: weekSnap.exists };
}

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/** The paste, read against the week as stored. */
function readAgainst(markdown: string, loaded: Loaded) {
  return readPasteAgainst(markdown, { blocks: loaded.week.blocks ?? null, weekNumber: loaded.weekNumber, dayBeforeTime: loaded.dayBeforeTime });
}

export async function GET(_req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const gated = await gate(db, actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
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
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const gated = await gate(db, actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const sent = await markdownOf(req);
  if (sent instanceof NextResponse) return sent;
  const loaded = await load(db, gated.runId, gated.weekId);
  if (loaded instanceof NextResponse) return loaded;
  const read = readAgainst(sent.markdown, loaded);
  const counts = await answersOnRemoved(db, gated.runId, gated.weekId, read.removed);
  return NextResponse.json(pasteAnswer(read, counts, loaded.dayBeforeTime));
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
  const sent = await markdownOf(req);
  if (sent instanceof NextResponse) return sent;
  const loaded = await load(db, gated.runId, gated.weekId);
  if (loaded instanceof NextResponse) return loaded;
  const read = readAgainst(sent.markdown, loaded);
  const counts = await answersOnRemoved(db, gated.runId, gated.weekId, read.removed);
  const answer = pasteAnswer(read, counts, loaded.dayBeforeTime);
  if (read.problems.length > 0) return badRequest(read.problems[0], answer);
  const unconfirmed = unconfirmedAnswers(answer, sent.confirmAnswers);
  if (unconfirmed) return NextResponse.json({ error: unconfirmed, ...answer }, { status: 409 });
  const weekRef = db.collection("courseRuns").doc(gated.runId).collection("weeks").doc(gated.weekId);
  const written = {
    blocks: read.blocks,
    ...(read.title ? { title: read.title } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: gated.uid,
  };
  if (loaded.exists) {
    await weekRef.update(written);
  } else {
    // The week's first save makes its page, unpublished, as the week editor would.
    try {
      await weekRef.create({ ...emptyWeekFields(loaded.weekNumber), ...written });
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
      return NextResponse.json({ error: "This week has just changed. Read it again, then save." }, { status: 409 });
    }
  }
  return NextResponse.json({
    saved: true,
    blockCount: read.blocks.length,
    kept: read.kept,
    minted: read.minted,
    removed: read.removed.length,
    answers: answer.answers,
  });
}
