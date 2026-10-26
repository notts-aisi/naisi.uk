import { NextResponse } from "next/server";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { groupWeekRef, resolveCalendar, runWeekRef } from "@/lib/courses/groupResolve";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { weekToMarkdown } from "@/lib/courses/weekBlocks/markdownWrite";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import {
  answersOnRemoved,
  pasteAnswer,
  pasteBodyOf,
  readPasteAgainst,
  unconfirmedAnswers,
  type PasteBody,
} from "@/lib/courses/weekPaste";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, normalizeGroupWeek, type CourseGroupDoc, type GroupWeekDoc } from "@/lib/firestore/courseGroups";
import {
  normalizeCourse,
  normalizeCourseRun,
  normalizeCourseWeek,
  weekDocId,
  type CourseRunDoc,
  type CourseWeekDoc,
} from "@/lib/firestore/courses";
import { templateWeekFields } from "@/lib/firestore/courseTemplates";

/**
 * A WEEK FOR ONE GROUP, BY MARKDOWN (Q39): copy the week as Markdown, change
 * it, paste it back, checked block by block, for one group of a run.
 *
 *   GET  ...  "Copy as Markdown": the group's own copy of the week when it
 *             has one, otherwise the run's week, ids written in.
 *   POST ...  "Read it": the paste read against the group's copy, or against
 *             the run's week while the group has none (so the run's ids are
 *             kept), with what it takes out and the answers on it. Writes
 *             nothing.
 *   PUT  ...  "Save": the same read, then the group's own copy written.
 *
 * THE COPY IS THE GROUP'S OWN WEEK, `courseGroups/{groupId}/weeks/{wNN}`,
 * the copy every reader of a group's week already reads first
 * (`resolveWeekDoc`): the member's week page, the facilitator's pages, the
 * due days and the emails. The first save MAKES it through the one copy
 * function (`templateWeekFields`, as the fork route makes a copy), with the
 * pasted blocks in place of the run's, in one create: every id the run's
 * week holds and the paste keeps stays, so ticks and answers stay with their
 * blocks. Later saves change the copy's blocks and title alone. Nothing here
 * ever writes the run's week, or another group's.
 *
 * WHO. An admin and the lead of the programme that names the group's run (any
 * group of the run that still meets), and the group's own facilitators while
 * it meets and they still stand behind the role. Nobody else: not a run's
 * track lead, a facilitator of another group, or anybody taking part.
 * AUTHORIZATION BEFORE EXISTENCE: a missing group, one that no longer meets
 * and somebody else's are one 403 for everybody but an admin.
 *
 * WHAT SAVE CHECKS is what the run's week loader checks (`weekPaste.ts`): the
 * paste read again against the copy as stored (or the run's week while there
 * is none), refused while anything stops it (400), and refused while it takes
 * out answered items until the count shown is confirmed (409). The count is
 * of the answers of the people who read this group's week: anybody placed in
 * it and its facilitators. A copy is made only of a published week.
 */

type Params = { params: Promise<{ groupId: string; weekId: string }> };

const WEEK_ID = /^w\d\d$/;

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type Gated = { group: CourseGroupDoc; run: CourseRunDoc; weekId: string; weekNumber: number };

/** The run a group belongs to, while it is there and not being destroyed. */
async function readRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!isAddressableId(runId)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || (snap.data() ?? {}).destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/**
 * The gate, then the address. The group is read first because it names its
 * facilitators and its run; nothing else is read for a caller it refuses.
 */
async function gate(db: Firestore, actor: Actor, params: Params["params"]): Promise<Gated | NextResponse> {
  const { groupId, weekId } = await params;
  const isAdmin = actor.role === "admin";
  const snap = isAddressableId(groupId) ? await db.collection("courseGroups").doc(groupId).get() : null;
  const group = snap?.exists ? normalizeCourseGroup(snap.id, snap.data() ?? {}) : null;
  const meets = group !== null && !group.archived;
  const facilitates = meets && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
  const leads = !isAdmin && !facilitates && meets && (await programmeLedBy(db, actor, group.runId)) !== null;
  if (!isAdmin && !facilitates && !leads) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.archived) return badRequest("This group no longer meets, so its weeks can’t be changed.");
  const run = await readRun(db, group.runId);
  if (!run) return NextResponse.json({ error: "That group’s run isn’t on the site." }, { status: 404 });
  // The week must be a taught week of the group's OWN calendar, matched by
  // the addressing doctrine (`weekDocId` of the slot's number).
  const slot = WEEK_ID.test(weekId)
    ? resolveCalendar(run, group).weekPlan.find((entry) => entry.kind === "week" && weekDocId(entry.weekNumber) === weekId)
    : undefined;
  if (!slot || slot.kind !== "week") {
    return NextResponse.json({ error: "That isn’t a week in this group’s plan." }, { status: 404 });
  }
  return { group, run, weekId, weekNumber: slot.weekNumber };
}

/** The Markdown in a request's body, or a 400 that says what is wrong with it. */
async function markdownOf(req: Request): Promise<PasteBody | NextResponse> {
  const sent = await pasteBodyOf(req);
  return "error" in sent ? badRequest(sent.error) : sent;
}

type Loaded = {
  /** The run's week, or null when the run has no page for it. */
  canonical: CourseWeekDoc | null;
  /** The run's week as stored, for the copy's provenance stamp. */
  canonicalUpdatedAt: Timestamp | null;
  /** The group's own copy, or null while it reads the run's. */
  copy: GroupWeekDoc | null;
  dayBeforeTime: string | null;
};

async function load(db: Firestore, gated: Gated): Promise<Loaded | NextResponse> {
  const [canonicalSnap, copySnap, courseSnap] = await Promise.all([
    runWeekRef(db, gated.run.id, gated.weekId).get(),
    groupWeekRef(db, gated.group.id, gated.weekId).get(),
    gated.run.courseId ? db.collection("courses").doc(gated.run.courseId).get() : Promise.resolve(null),
  ]);
  const canonical = canonicalSnap.exists ? normalizeCourseWeek(canonicalSnap.id, canonicalSnap.data() ?? {}) : null;
  const copy = copySnap.exists ? normalizeGroupWeek(copySnap.id, copySnap.data() ?? {}) : null;
  if (!canonical && !copy) {
    return NextResponse.json({ error: `Week ${gated.weekNumber} has no page on this run yet.` }, { status: 404 });
  }
  const rawUpdated = canonicalSnap.exists ? (canonicalSnap.data() ?? {}).updatedAt : null;
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}) : null;
  return {
    canonical,
    canonicalUpdatedAt: rawUpdated instanceof Timestamp ? rawUpdated : null,
    copy,
    dayBeforeTime: course?.dayBeforeDueTime ?? null,
  };
}

/** The blocks a paste is read against: the group's copy's, or the run's while there is none. */
function storedBlocks(loaded: Loaded): WeekBlock[] | null {
  const week = loaded.copy ?? loaded.canonical;
  return week?.blocks ?? null;
}

/**
 * The people whose answers a paste to this group's week can take out of
 * sight: anybody whose place names the group (whatever its state, as their
 * rows stay), and its facilitators. One equality on the run, filtered here.
 */
async function readersOf(db: Firestore, group: CourseGroupDoc): Promise<Set<string>> {
  const snap = await db.collection("courseEnrolments").where("runId", "==", group.runId).get();
  const uids = new Set(group.facilitatorUids);
  for (const doc of snap.docs) {
    const enrolment = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (enrolment.groupId === group.id) uids.add(enrolment.uid);
  }
  return uids;
}

/** Thrown out of the save's transaction to answer with a status. */
class SaveRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

export async function GET(_req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const gated = await gate(db, actor, ctx.params);
  if (gated instanceof NextResponse) return gated;
  const loaded = await load(db, gated);
  if (loaded instanceof NextResponse) return loaded;
  const week = loaded.copy ?? loaded.canonical;
  if (!week || !isBlockWeek(week)) {
    return NextResponse.json({ error: "This week isn’t written as blocks yet, so there is nothing to copy." }, { status: 404 });
  }
  const markdown = weekToMarkdown({ weekNumber: gated.weekNumber, title: week.title, blocks: week.blocks }, { dayBeforeTime: loaded.dayBeforeTime });
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
  const loaded = await load(db, gated);
  if (loaded instanceof NextResponse) return loaded;
  const read = readPasteAgainst(sent.markdown, { blocks: storedBlocks(loaded), weekNumber: gated.weekNumber, dayBeforeTime: loaded.dayBeforeTime });
  const counts = await answersOnRemoved(db, gated.run.id, gated.weekId, read.removed, await readersOf(db, gated.group));
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
  const loaded = await load(db, gated);
  if (loaded instanceof NextResponse) return loaded;
  const read = readPasteAgainst(sent.markdown, { blocks: storedBlocks(loaded), weekNumber: gated.weekNumber, dayBeforeTime: loaded.dayBeforeTime });
  const counts = await answersOnRemoved(db, gated.run.id, gated.weekId, read.removed, await readersOf(db, gated.group));
  const answer = pasteAnswer(read, counts, loaded.dayBeforeTime);
  if (read.problems.length > 0) return badRequest(read.problems[0], answer);
  const unconfirmed = unconfirmedAnswers(answer, sent.confirmAnswers);
  if (unconfirmed) return NextResponse.json({ error: unconfirmed, ...answer }, { status: 409 });

  const copyRef = groupWeekRef(db, gated.group.id, gated.weekId);
  let made = false;
  try {
    made = await db.runTransaction(async (tx): Promise<boolean> => {
      const copySnap = await tx.get(copyRef);
      // A copy made, or changed, since this paste was read is read again by the next press.
      if (copySnap.exists !== (loaded.copy !== null)) {
        throw new SaveRefusal("This group’s week has just changed. Read it again, then save.", 409);
      }
      const content = { blocks: read.blocks, ...(read.title ? { title: read.title } : {}) };
      if (copySnap.exists) {
        tx.update(copyRef, { ...content, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
        return false;
      }
      const canonical = loaded.canonical;
      if (!canonical) throw new SaveRefusal(`Week ${gated.weekNumber} has no page on this run yet.`, 404);
      if (!canonical.published) {
        throw new SaveRefusal(
          `Week ${gated.weekNumber} isn’t published for the run yet, so it can’t have a group’s own copy. It can once an admin publishes it.`,
          409,
        );
      }
      // The one copy function, then the paste's blocks and title in place of the run's.
      tx.create(copyRef, {
        ...templateWeekFields(canonical),
        ...content,
        forkedAt: FieldValue.serverTimestamp(),
        forkedByUid: actor.uid,
        forkedFromRunWeekAt: loaded.canonicalUpdatedAt,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actor.uid,
      });
      return true;
    });
  } catch (err) {
    if (err instanceof SaveRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    if (isAlreadyExists(err)) {
      return NextResponse.json({ error: "This group’s week has just changed. Read it again, then save." }, { status: 409 });
    }
    console.error("[courses group week blocks] save failed", gated.group.id, gated.weekId, err);
    return NextResponse.json({ error: "That save didn’t go through, so nothing was changed." }, { status: 500 });
  }
  return NextResponse.json({
    saved: true,
    made,
    blockCount: read.blocks.length,
    kept: read.kept,
    minted: read.minted,
    removed: read.removed.length,
    answers: answer.answers,
  });
}
