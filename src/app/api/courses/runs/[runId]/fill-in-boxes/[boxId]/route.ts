import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { weekFillInBoxes } from "@/lib/courses/weekBlocks/reader";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import {
  FILL_IN_MAX_CHARS,
  exerciseResponseId,
  isFillInResponse,
} from "@/lib/firestore/courseExercises";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";

/**
 * A PERSON WRITING IN ONE FILL-IN BOX (board wk-week6-phone, week 6's action
 * plan): the box saves as they type, and this route is the only writer of a
 * fill-in box.
 *
 * WHERE IT IS STORED. In `courseExerciseResponses`, as a row of its own kind
 * (`kind: "fillIn"`, see `courseExercises.ts`): addressed by
 * `exerciseResponseId(runId, uid, weekId, boxId)`, readable by its writer
 * (and by admins, as every row of that store is) and by nobody else from a
 * browser, written only by routes, and deleted with the account and in the
 * run's destroy, like every row of the store. A fill-in box is NEVER reviewed
 * and never sent: this route stores no `submittedAt`, no verdict and no
 * feedback, and the readers that review, queue or count answers leave it out
 * (`isOwnBoxResponse`).
 *
 * WHO MAY WRITE, always their OWN box (the row's id is built from the
 * caller's own uid; nothing here can address anybody else's). The same people
 * as a reflection box's (`../../reflections/[promptId]/route.ts`; keep the two
 * the same):
 *  - somebody taking part: an ACTIVE learner enrolment on this run, told its
 *    group by Publish, on an account in standing;
 *  - a facilitator of a live group of this run, as themselves (Zach, Mon 26
 *    Oct: facilitators are fellows). Their own boxes are read by the
 *    programme's lead and admins only, never by their co-facilitators
 *    (`../route.ts`, the one reader of somebody else's).
 * Nobody writes on anybody else's behalf: not the lead, not an admin.
 *
 * WHICH BOX. The box must be one of the fill-in boxes of the week as this
 * person reads it: their own group's copy of the week when it has one (a
 * learner's placement, or the one group a facilitator holds, the overview
 * route's own choice), the run's otherwise (`resolveWeekDoc`), found by the
 * one reader of a week's content (`weekFillInBoxes`). A week written before
 * blocks has none. An id that is a reflection prompt's, a written answer's,
 * or anything else's, is refused, so this route can never write over another
 * kind of row, and a row that already holds one is refused again inside the
 * transaction.
 *
 * AN EMPTIED BOX deletes the row: nothing written is nothing stored, and the
 * count ("every box has something in it") reads the same either way.
 *
 * What a person writes is plain text, stored as typed (ends trimmed) and
 * drawn as text nodes only.
 */

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
/** The rules' and the plan's bound on a week number. */
const MAX_WEEK_NUMBER = 60;

/** Thrown out of the transaction to refuse with a status. */
class FillInError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ runId: string; boxId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, boxId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(boxId)) {
    return NextResponse.json({ error: "That box isn’t on this programme." }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { weekId?: unknown; text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the week and what you wrote." }, { status: 400 });
  }
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week the box is on, like "w06".' }, { status: 400 });
  }
  if (typeof body.text !== "string") {
    return NextResponse.json({ error: "Send what you wrote as text." }, { status: 400 });
  }
  const text = body.text.trim();
  if (text.length > FILL_IN_MAX_CHARS) {
    return NextResponse.json(
      { error: `That’s too long for one box: keep it under ${FILL_IN_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  // ---- Who may write: their own box, on a run they take part in -------------
  // The enrolment is addressed (one read, nobody else's), the run's groups
  // are one equality on the run, as the overview route reads them.
  const [enrolSnap, groupSnap] = await Promise.all([
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
  ]);
  const enrolment = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  const takesPart =
    enrolment !== null &&
    enrolment.status === "active" &&
    enrolment.role === "learner" &&
    // The enrolment row is an authority written for an approved account, so
    // that account's standing is asked again here.
    isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid) &&
    // A placement Publish has not told its owner about opens nothing yet.
    placementIsShownTo(enrolment, { isAdmin: actor.role === "admin" });
  // Archived groups staff nobody, as everywhere else.
  const liveGroups = groupSnap.docs.map((d) => normalizeCourseGroup(d.id, d.data() ?? {})).filter((g) => !g.archived);
  const facilitates = liveGroups.filter((g) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", g.facilitatorUids));
  if (!takesPart && facilitates.length === 0) {
    return NextResponse.json(
      { error: "Only somebody taking part in this programme can write in its boxes." },
      { status: 403 },
    );
  }

  // ---- Which box: a fill-in box of the week as this person reads it ---------
  // Their own group: their placement, or else the one group they facilitate
  // (the overview's `ownGroup`); somebody holding two groups reads the run's.
  const ownGroup =
    (takesPart && enrolment?.groupId ? (liveGroups.find((g) => g.id === enrolment.groupId) ?? null) : null) ??
    (facilitates.length === 1 ? facilitates[0] : null);
  const { week } = await resolveWeekDoc(db, runId, ownGroup?.id ?? null, weekId);
  if (!week || !isBlockWeek(week) || !weekFillInBoxes(week).some((box) => box.id === boxId)) {
    return NextResponse.json({ error: "That box isn’t on this week any more. Reload the page." }, { status: 404 });
  }

  const id = exerciseResponseId(runId, actor.uid, weekId, boxId);
  const ref = db.collection("courseExerciseResponses").doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // A row of any other kind is never written over, whatever its id says.
      if (snap.exists && !isFillInResponse(snap.data() ?? {})) {
        throw new FillInError("That box holds something else, not what you fill in here.", 409);
      }
      if (!text) {
        if (snap.exists) tx.delete(ref);
        return;
      }
      tx.set(ref, {
        runId,
        uid: actor.uid,
        weekId,
        // The number derived from the week's id, as every row of the store stores it.
        weekNumber,
        exerciseId: boxId,
        kind: "fillIn",
        responseType: "text",
        text,
        // Never sent, never reviewed: stated so a reader filtering on either
        // finds a fill-in box where it expects nothing.
        submittedAt: null,
        reviewStatus: "unreviewed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof FillInError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses fill-in box] write failed", runId, weekId, boxId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. It tries again as you type." }, { status: 500 });
  }

  // Echoed from what was written: the box shows what it holds.
  const response: ExerciseResponseWire = {
    id,
    weekId,
    weekNumber,
    exerciseId: boxId,
    kind: "fillIn",
    responseType: "text",
    text: text || null,
    linkUrl: null,
    submittedAt: null,
    reviewStatus: "unreviewed",
    reviewerName: null,
    reviewerComment: null,
    reviewedAt: null,
  };
  return NextResponse.json({ ok: true, response });
}
