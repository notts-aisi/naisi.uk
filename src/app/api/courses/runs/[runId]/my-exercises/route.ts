import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeExerciseResponse } from "@/lib/firestore/courseExercises";
import { weekOneDoorFor } from "@/lib/courses/weekOne/door";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isWordCountedAnswer, readWrittenAnswer } from "@/lib/courses/writtenAnswers/model";
import { namedIn, writtenAnswerWire } from "@/lib/courses/writtenAnswers/wire";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";

/**
 * The member's OWN exercise responses for one week — what the week page hydrates
 * its answer boxes from, and how it knows which rows are still editable. On a
 * week written as blocks it also carries their own REFLECTIONS and FILL-IN
 * BOXES (rows of kind "reflection" and "fillIn", see `courseExercises.ts`),
 * each tagged with its kind, which is what the week page's boxes are seeded
 * from: the one person a box is read back to here is the person who wrote it.
 *
 * OWN ROWS ONLY, structurally: the query pins `uid` to the caller's own uid,
 * which comes from the session and never from a parameter. There is no code
 * path here that can widen it, and nothing about anyone else's submission
 * reaches this payload — the facilitator queue is the only cohort-wide exercise
 * surface and it lives behind a group-facilitator gate.
 *
 * ── WHY A ROUTE, NOT A CLIENT QUERY ─────────────────────────────────────────
 * `courseExerciseResponses` IS own-row readable in firestore.rules, so a client
 * query would work. It comes through a route anyway because `reviewerName` has
 * to be resolved from a `users` doc the member cannot read (member PII is
 * SU-committee-and-admin only), and a member seeing "reviewed by <uid>" is not
 * a feature. Resolving it here keeps the one join server-side and keeps the
 * wire shape identical to the queue's.
 *
 * WHO MAY READ: the caller, about themselves — a live enrolment (active or
 * completed, matching the run overview's read boundary) or an admin; a
 * facilitator of one of the run's live groups, holding a place there or not,
 * who does the coursework as themselves and whom the reflection route lets
 * write in their own boxes before Publish has told their place, so the week
 * page can read back what they wrote; and, for week 1 alone, somebody holding
 * a place whom Publish has not told yet, once week 1's door is open to them
 * (Q35 B: `weekOneDoorFor`). Note the
 * asymmetry with the submit route, which requires an ACTIVE learner enrolment:
 * a completed cohort is the member's own history to re-read but not to rewrite.
 *
 * PII: display names only, never an email (see `displayNameOf`).
 */

// ---------------------------------------------------------------------------
// Wire types (the contract the week page's exercise section renders from)
// ---------------------------------------------------------------------------

export type MyExercisesPayload = {
  /**
   * The caller's rows for the requested week, in `exerciseId` order. DISPLAY
   * order is the week doc's `exercises` array, which the page already holds —
   * a response can outlive a reordering, or the exercise itself.
   */
  responses: ExerciseResponseWire[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Matches the rules' `weekNumber` bounds and COURSE_FIELD_LIMITS.maxWeekPlanEntries. */
const MAX_WEEK_NUMBER = 60;

/** The run's groups read for who facilitates: the reflection route's own bound. */
const MAX_GROUPS = 50;

/**
 * A week can hold at most `COURSE_FIELD_LIMITS.maxExercises` (15) exercises,
 * plus, on a week written as blocks, one row per reflection box the member
 * has written in (a week's stops hold a handful: week 1 has six). The
 * headroom covers rows orphaned by an exercise or a box being deleted after
 * it was answered: the member should still see what they wrote.
 */
const MAX_ROWS = 120;

/**
 * Dynamic segments arrive URL-DECODED, so a `%2F` reaches us as a real path
 * separator. Same guard as `runAccess.ts`.
 */
function isAddressableId(value: string): boolean {
  return Boolean(value) && !value.includes("/") && value !== "." && value !== "..";
}

/**
 * Display-name fallback chain: preferred name, then account name, then a
 * neutral placeholder — NEVER an email address. (Duplicated per route by house
 * convention; route handlers don't import from one another.)
 */
function displayNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = profile.preferredName;
  const display = data.displayName;
  return (
    (typeof preferred === "string" && preferred.trim()) ||
    (typeof display === "string" && display.trim()) ||
    "NAISI member"
  );
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** `?week=N` — a positive integer inside the plan's bounds, or null. */
function parseWeek(raw: string | null): number | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_WEEK_NUMBER ? n : null;
}

/**
 * ── THE `weekNumber` INVARIANT (why this route needs no fallback) ────────────
 * `weekNumber` is stored on the response doc but is not part of
 * `CourseExerciseResponseDoc`. It never has to be re-derived here: the SUBMIT
 * ROUTE IS THE ONLY WRITER of that collection (`allow write: if false` in
 * firestore.rules) and it always stores the number derived from `weekId`, and
 * the query below FILTERS on `weekNumber == week`. So every row this route can
 * see carries exactly `week`, and the echoed value is `week` itself.
 *
 * An id-derived fallback would be dead code, not a safety net: Firestore
 * excludes docs missing a filtered field, so a field-less row could never reach
 * one. Such a row would be invisible to this route entirely — the page would
 * render an empty writable box over a stored answer — which is why the single
 * writer stamping the field is the invariant that matters, and the only place
 * it can be broken.
 */

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const week = parseWeek(new URL(req.url).searchParams.get("week"));
  if (week === null) {
    return NextResponse.json(
      { error: `week must be a whole number between 1 and ${MAX_WEEK_NUMBER}.` },
      { status: 400 },
    );
  }

  const isAdmin = actor.role === "admin";

  // The enrolment is ADDRESSED, never queried: `courseEnrolmentId` binds
  // (run, uid), so there is no way to spell another member's row. The run doc
  // is not read at all — this payload contains nothing about the run, and the
  // enrolment's existence already establishes that the run exists.
  if (!isAdmin) {
    const enrolSnap = await db
      .collection("courseEnrolments")
      .doc(courseEnrolmentId(runId, actor.uid))
      .get();
    const enrolment = enrolSnap.exists
      ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {})
      : null;
    // Withdrawn / removed enrolments lose access the moment they are written,
    // whatever the member's open tab still shows. A placement Publish has not
    // told its owner about is no way in either: the run is shut to them.
    const live =
      enrolment &&
      (enrolment.status === "active" || enrolment.status === "completed") &&
      isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid) &&
      placementIsShownTo(enrolment, { isAdmin });
    // A facilitator of one of the run's live groups reads back their own
    // rows, as the reflection route lets them write them: somebody who holds
    // a place in the group they run is the run's facilitator from the moment
    // they are appointed, before Publish has told their own place. The run's
    // groups are one equality on the run, as the reflection route reads them;
    // archived groups staff nobody.
    const facilitates =
      !live &&
      (await db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get()).docs
        .map((d) => normalizeCourseGroup(d.id, d.data() ?? {}))
        .some((g) => !g.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", g.facilitatorUids));
    // Week 1 before groups go out (Q35 B): somebody holding a place whom
    // Publish has not told reads back what they wrote in week 1's boxes, once
    // week 1's door is open to them (`weekOneDoorFor`), and no other week.
    const beforeGroups = !live && !facilitates && week === 1 && (await weekOneDoorFor(db, actor, runId)).open;
    if (!live && !facilitates && !beforeGroups) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Three equality filters, served by the EXISTING
  // (runId, weekNumber, uid) composite — an equality-only query matches an index
  // holding exactly those fields whatever order the clauses are written in. No
  // new index. `uid` is the session's, so this is own-rows-only by construction.
  //
  // `week` is the id-derived number, which is exactly what the submit route
  // stores (see the invariant above) — the page asking for week N and the row
  // written on /weeks/N agree by construction.
  const snap = await db
    .collection("courseExerciseResponses")
    .where("runId", "==", runId)
    .where("weekNumber", "==", week)
    .where("uid", "==", actor.uid)
    .limit(MAX_ROWS)
    .get();

  const rows = snap.docs.map((d) => normalizeExerciseResponse(d.id, d.data() ?? {}));
  // A block week's written answer (counted in words) travels with its own
  // fields: boxes, its count, when it was first sent, who opened it, the
  // feedback. Never whether it was late.
  const writtenById = new Map(
    snap.docs.flatMap((d) => {
      const data = (d.data() ?? {}) as Record<string, unknown>;
      return isWordCountedAnswer(data) ? [[d.id, readWrittenAnswer(data)] as const] : [];
    }),
  );

  // One `getAll` for the names: the reviewer of a summer answer (usually
  // nobody, or one facilitator across a week's rows), and whoever opened,
  // reopened or sent feedback on a written answer. Names only.
  const reviewerUids = [
    ...new Set([
      ...rows.map((r) => r.reviewerUid).filter((u): u is string => Boolean(u)),
      ...[...writtenById.values()].flatMap(namedIn),
    ]),
  ];
  const userDocs = reviewerUids.length
    ? await db.getAll(...reviewerUids.map((uid) => db.collection("users").doc(uid)))
    : [];
  const nameByUid = new Map<string, string>();
  const firstNameByUid = new Map<string, string>();
  for (const doc of userDocs) {
    if (!doc.exists) continue;
    nameByUid.set(doc.id, displayNameOf(doc.data() ?? {}));
    firstNameByUid.set(doc.id, firstNameOfUser(doc.data() ?? {}) || displayNameOf(doc.data() ?? {}));
  }

  const responses: ExerciseResponseWire[] = rows
    .map((doc) => ({
      id: doc.id,
      weekId: doc.weekId,
      // The queried number, echoed straight back: the filter above is an
      // equality on this field, so every row here holds exactly it.
      weekNumber: week,
      exerciseId: doc.exerciseId,
      // Own rows only, so a reflection or a fill-in box travels here to the
      // one person it is for, marked as what it is.
      ...(doc.kind === "reflection" ? { kind: "reflection" as const } : doc.kind === "fillIn" ? { kind: "fillIn" as const } : {}),
      responseType: doc.responseType,
      text: doc.text ?? null,
      linkUrl: doc.linkUrl ?? null,
      submittedAt: iso(doc.submittedAt),
      reviewStatus: doc.reviewStatus,
      reviewerName: doc.reviewerUid
        ? (nameByUid.get(doc.reviewerUid) ?? "NAISI member")
        : null,
      reviewerComment: doc.reviewerComment ?? null,
      reviewedAt: iso(doc.reviewedAt),
      ...(writtenById.has(doc.id)
        ? { written: writtenAnswerWire(writtenById.get(doc.id)!, firstNameByUid) }
        : {}),
    }))
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));

  const payload: MyExercisesPayload = { responses };
  return NextResponse.json(payload);
}
