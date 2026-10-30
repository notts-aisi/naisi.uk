import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import {
  WRITTEN_ANSWER_LIMITS,
  answerWords,
  isWordCountedAnswer,
  readWrittenAnswer,
} from "@/lib/courses/writtenAnswers/model";
import { writtenAnswerWire, type WrittenAnswerWire } from "@/lib/courses/writtenAnswers/wire";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import {
  ANSWER_EMPTY_TO_SEND,
  ANSWER_LOCKED,
  ANSWER_NOT_HERE,
  ANSWER_NOT_SAVED,
  ANSWER_SENT_CANNOT_EMPTY,
  ANSWER_TOO_LONG_TO_STORE,
  overLimitWords,
} from "@/lib/courses/writtenAnswerWords";
import { firstWrittenFor } from "@/lib/legal/courseworkUseStamp";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";

/**
 * A PERSON WRITING AND SENDING THEIR OWN WRITTEN ANSWER (boards wk-week,
 * wk-week-phone; Q33): `PUT /api/courses/runs/[runId]/written-answers/[answerId]`
 * with `{ weekId, text }` (an answer of one box) or `{ weekId, boxes }` (an
 * answer in labelled boxes, box id to words), and `send: true` to send it.
 * The box saves as they type; this route is the only writer of what they
 * wrote.
 *
 * WHO MAY WRITE, always their OWN answer (the row's id is built from the
 * caller's own uid; nothing here can address anybody else's): somebody taking
 * part, an active learner enrolment on the run, told its group by Publish,
 * on an account in standing; or a facilitator of a live group of the run, as
 * themselves (Zach, Mon 26 Oct: facilitators take part too, and their own
 * answer is the lead's and admins' to give feedback on). Nobody writes on
 * anybody else's behalf: not a facilitator, not the lead, not an admin.
 *
 * WHICH ANSWER: the Written answer block of that id on the week as this
 * person reads it, their group's own copy when it has one (the reflection
 * route's choice), found by the one reader of a week's content. A week
 * written before blocks has none here: its exercises keep their own route.
 *
 * SENDING. The first send stores the time once (`firstSentAt`, and
 * `submittedAt` with it) and it never moves. It needs something written,
 * and the answer within its word range's top, which is a limit (the guides:
 * "Word limits are limits, not targets"); the bottom is not enforced. After
 * the first send the answer stays sent and still saves as they type, each
 * change stamping `editedAt`, held to the same limit, UNTIL ONE OF ITS
 * REVIEWERS OPENS IT on the review page: from then on every write is refused
 * (409), checked inside the transaction that writes. "Reopen for edits"
 * hands it back.
 *
 * Counted in words, stored with `words`. Plain text, drawn as text nodes.
 */

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;
/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

/** Thrown out of the transaction to refuse with a status. */
class AnswerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ runId: string; answerId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, answerId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(answerId)) {
    return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { weekId?: unknown; text?: unknown; boxes?: unknown; send?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the week and what you wrote." }, { status: 400 });
  }
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week the answer is on, like "w03".' }, { status: 400 });
  }
  if (body.send !== undefined && typeof body.send !== "boolean") {
    return NextResponse.json({ error: "Say whether to send it as true or false." }, { status: 400 });
  }
  const send = body.send === true;
  const sentText = body.text !== undefined;
  const sentBoxes = body.boxes !== undefined;
  if (sentText === sentBoxes) {
    return NextResponse.json({ error: "Send what you wrote: the answer as text, or its boxes." }, { status: 400 });
  }
  let text = "";
  let boxes: Record<string, string> | null = null;
  if (sentText) {
    if (typeof body.text !== "string") return NextResponse.json({ error: "Send what you wrote as text." }, { status: 400 });
    text = body.text.trim();
    if (text.length > WRITTEN_ANSWER_LIMITS.maxChars) return NextResponse.json({ error: ANSWER_TOO_LONG_TO_STORE }, { status: 400 });
  } else {
    if (!body.boxes || typeof body.boxes !== "object" || Array.isArray(body.boxes)) {
      return NextResponse.json({ error: "Send the boxes as each box's id and what is in it." }, { status: 400 });
    }
    boxes = {};
    let total = 0;
    for (const [id, value] of Object.entries(body.boxes as Record<string, unknown>)) {
      if (!isAddressableId(id) || typeof value !== "string") {
        return NextResponse.json({ error: "Send each box as its id and what is in it, as text." }, { status: 400 });
      }
      const trimmed = value.trim();
      if (trimmed.length > WRITTEN_ANSWER_LIMITS.boxChars) return NextResponse.json({ error: ANSWER_TOO_LONG_TO_STORE }, { status: 400 });
      total += trimmed.length;
      if (trimmed) boxes[id] = trimmed;
    }
    if (total > WRITTEN_ANSWER_LIMITS.maxChars) return NextResponse.json({ error: ANSWER_TOO_LONG_TO_STORE }, { status: 400 });
  }

  // ---- Who may write: their own answer, on a run they take part in ----------
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
      { error: "Only somebody taking part in this programme can write its written answers." },
      { status: 403 },
    );
  }

  // ---- Which answer: a written answer of the week as this person reads it ---
  const ownGroup =
    (takesPart && enrolment?.groupId ? (liveGroups.find((g) => g.id === enrolment.groupId) ?? null) : null) ??
    (facilitates.length === 1 ? facilitates[0] : null);
  const { week } = await resolveWeekDoc(db, runId, ownGroup?.id ?? null, weekId);
  const answer = week && isBlockWeek(week) ? (weekWrittenAnswers(week).find((candidate) => candidate.id === answerId) ?? null) : null;
  if (!answer) return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });
  // The answer's shape is the block's: boxes for an answer in boxes, one box otherwise.
  if (answer.boxes.length > 0) {
    if (!boxes) return NextResponse.json({ error: "This answer is written in its boxes: send each box." }, { status: 400 });
    const known = new Set(answer.boxes.map((box) => box.id));
    if (Object.keys(boxes).some((id) => !known.has(id))) {
      return NextResponse.json({ error: "One of those boxes isn’t on this answer any more. Reload the page." }, { status: 400 });
    }
  } else if (boxes) {
    return NextResponse.json({ error: "This answer is one box: send it as text." }, { status: 400 });
  }
  const words = answerWords(text, boxes);
  const limit = answer.words?.max ?? null;

  const id = exerciseResponseId(runId, actor.uid, weekId, answerId);
  const ref = db.collection("courseExerciseResponses").doc(id);

  let stored: Record<string, unknown> | null;
  try {
    stored = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prior = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
      // A reflection's row, or an answer counted some other way, is never written
      // over: every row this route writes carries its count of words.
      if (prior && (isReflectionResponse(prior) || !isWordCountedAnswer(prior))) {
        throw new AnswerError("That box holds something else. Reload the page.", 409);
      }
      const record = prior ? readWrittenAnswer(prior) : null;
      // THE LOCK: opened by one of its reviewers, or given feedback.
      if (record && (record.openedAt || record.feedback)) throw new AnswerError(ANSWER_LOCKED, 409);
      const alreadySent = record?.firstSentAt != null;
      const sending = send && !alreadySent;

      if (words === 0) {
        if (alreadySent) throw new AnswerError(ANSWER_SENT_CANNOT_EMPTY, 400);
        if (send) throw new AnswerError(ANSWER_EMPTY_TO_SEND, 400);
        // Nothing written is nothing stored.
        if (prior) tx.delete(ref);
        return null;
      }
      // The top of the range is a limit for what is sent, and for every change to it after.
      if ((sending || alreadySent) && limit !== null && words > limit) {
        throw new AnswerError(overLimitWords(words, limit, alreadySent), 400);
      }

      const now = new Date();
      const write: Record<string, unknown> = {
        runId,
        uid: actor.uid,
        weekId,
        // The number derived from the week's id, as every answer stores it.
        weekNumber,
        exerciseId: answerId,
        responseType: "text",
        words,
        // Stated, never used for a written answer: summer's verdicts keep their meaning.
        reviewStatus: "unreviewed",
        updatedAt: FieldValue.serverTimestamp(),
      };
      // One shape at a time: the other field goes, where the row holds it.
      if (boxes) {
        write.boxes = boxes;
        if (prior && "text" in prior) write.text = FieldValue.delete();
      } else {
        write.text = text;
        if (prior && "boxes" in prior) write.boxes = FieldValue.delete();
      }
      if (sending) {
        // Stored once and never moved: the time it was first sent.
        write.firstSentAt = FieldValue.serverTimestamp();
        write.submittedAt = FieldValue.serverTimestamp();
      } else if (alreadySent) {
        const changed = boxes
          ? JSON.stringify(record?.boxes ?? {}) !== JSON.stringify(boxes)
          : (record?.text ?? "") !== text;
        if (changed) write.editedAt = FieldValue.serverTimestamp();
      } else if (!prior) {
        write.submittedAt = null;
      }
      // When the row was first written, stamped once on a new row (the merge
      // keeps it after): an answer counts outside its programme only when it
      // was written entirely after its writer agreed to privacy v13
      // (courseworkUse.ts).
      if (!prior) Object.assign(write, firstWrittenFor(null));
      tx.set(ref, write, { merge: true });
      // What the row holds once written, for the echo: the stamps are this moment's.
      const after: Record<string, unknown> = { ...(prior ?? {}), ...write, updatedAt: now };
      if (boxes) delete after.text;
      else delete after.boxes;
      if (sending) {
        after.firstSentAt = now;
        after.submittedAt = now;
      }
      if (write.editedAt) after.editedAt = now;
      if (!sending && !alreadySent && !prior) after.submittedAt = null;
      return after;
    });
  } catch (err) {
    if (err instanceof AnswerError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses written answer] write failed", runId, weekId, answerId, err);
    return NextResponse.json({ error: ANSWER_NOT_SAVED }, { status: 500 });
  }

  const written: WrittenAnswerWire | null = stored ? writtenAnswerWire(readWrittenAnswer(stored), new Map()) : null;
  const response: ExerciseResponseWire = {
    id,
    weekId,
    weekNumber,
    exerciseId: answerId,
    responseType: "text",
    text: stored && !boxes ? text || null : null,
    linkUrl: null,
    submittedAt: written?.firstSentAt ?? null,
    reviewStatus: "unreviewed",
    reviewerName: null,
    reviewerComment: null,
    reviewedAt: null,
    written: written ?? undefined,
  };
  return NextResponse.json({ ok: true, response });
}
