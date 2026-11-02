"use client";

import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/client";
import { routeRefusalOf } from "./routeRefusal";
import {
  buildProgressWrite,
  courseProgressId,
  type CourseProgressDoc,
  type ProgressItemKind,
} from "@/lib/firestore/courseProgress";
import { weekDocId } from "@/lib/firestore/courses";

/**
 * The member's writes on `courseProgress`: ticks, ratings, comments and
 * private notes.
 *
 * A TICK goes through a route (`PUT /api/courses/runs/[runId]/ticks/[itemId]`,
 * `tickThroughRoute`), the only writer of `completed` and `completedAt`: a
 * week written as blocks locks when it is submitted or its group's session
 * starts, which no rule in `firestore.rules` can know, and an untick is
 * recorded there with its time. The rules refuse a browser write that sets or
 * changes either field.
 *
 * A RATING, A COMMENT OR A PRIVATE NOTE is still THE one client-direct write
 * in the courses feature (see the `courseProgress.ts` header and the matching
 * firestore.rules block): the deterministic doc id `runId + '__' + uid + '__'
 * + itemId` makes own-row-only writes structural. Three properties it keeps,
 * none optional:
 *
 *  - **`buildProgressWrite` builds the payload, always.** It is the one place
 *    `hasPublicComment` is derived from the trimmed comment, and the rules pin
 *    the mirror to the comment — hand-rolling a payload here is how the two
 *    drift and the cohort comments lane starts lying.
 *  - **`setDoc` WITHOUT merge.** The rules validate `request.resource.data` as
 *    a whole (closed key set, absent-not-null optionals, the mirror pin), so a
 *    partial merge would be checked against a document the client never
 *    assembled. Full-document writes are what make the shape check meaningful
 *    — and are why every field the caller wants to keep must be passed in.
 *  - **The completion and the moderation stamp are carried VERBATIM, read
 *    back off the live document** (`storedCarry`): the rules pin all four
 *    fields to what is stored, so a write that rounds or drops one is refused.
 */

/** The row a save addresses, plus what is already stored there. */
type ProgressTarget = {
  runId: string;
  uid: string;
  weekNumber: number;
  itemKind: ProgressItemKind;
  itemId: string;
  /**
   * The row as last read (`null` before the member has ever touched the item).
   * The panel reads its rating and comments from it; the completion and the
   * moderation stamp are read again off the live document.
   */
  current: CourseProgressDoc | null;
};

export type SaveReflectionArgs = ProgressTarget & {
  /**
   * Integer 1–5. OMITTING IT CLEARS THE RATING — a full-document write has no
   * way to say "leave this one alone", so a panel that only edits the comment
   * must pass `current.rating` back. Same for the two text fields below.
   */
  rating?: number;
  /** Visible to everyone on the run. Plain text; rendered as text nodes only. */
  publicComment?: string;
  /** Visible to facilitators + admins only. Plain text. */
  privateNote?: string;
};

type StoredCarry = { completed: boolean; completedAt?: unknown; moderatedByUid?: string; moderatedAt?: unknown };

/**
 * What a rating or a comment carries through VERBATIM from the live
 * document: whether the item is ticked and when, and the moderation stamp.
 * The rules pin all four to their stored values, so dropping or rounding any
 * of them fails the write.
 *
 * Read back off the live document rather than taken from the normalised row:
 * `normalizeCourseProgress` hands back a JS `Date`, which is millisecond
 * precision, while a server timestamp carries microseconds. Re-writing the
 * normalised value would round it and be DENIED. And the listener's row may
 * not have caught up with a tick the route has just made, so whether the
 * item is ticked is read here too, never assumed.
 */
async function storedCarry(ref: DocumentReference): Promise<StoredCarry> {
  const data = (await getDoc(ref)).data();
  const carry: StoredCarry = { completed: data?.completed === true };
  if (carry.completed && data?.completedAt !== undefined) carry.completedAt = data.completedAt;
  const moderatedByUid = data?.moderatedByUid;
  if (typeof moderatedByUid === "string" && moderatedByUid) {
    carry.moderatedByUid = moderatedByUid;
    if (data?.moderatedAt !== undefined) carry.moderatedAt = data.moderatedAt;
  }
  return carry;
}

/**
 * Save the reflection panel: star rating, cohort-visible comment, private
 * note. Whether the item is ticked, and when, is carried through exactly as
 * stored: editing a comment three weeks later never rewrites when the
 * material was finished, and never ticks or unticks it.
 *
 * Rejects on a denied or failed write; the panel says so.
 */
export async function saveProgressReflection(args: SaveReflectionArgs): Promise<void> {
  const ref = doc(getClientDb(), "courseProgress", courseProgressId(args.runId, args.uid, args.itemId));
  const carry = await storedCarry(ref);
  await setDoc(
    ref,
    buildProgressWrite({
      runId: args.runId,
      uid: args.uid,
      weekNumber: args.weekNumber,
      itemKind: args.itemKind,
      itemId: args.itemId,
      completed: carry.completed,
      completedAt: carry.completedAt,
      rating: args.rating,
      publicComment: args.publicComment,
      privateNote: args.privateNote,
      moderatedByUid: carry.moderatedByUid,
      moderatedAt: carry.moderatedAt,
    }),
  );
}

/**
 * Tick an item of a week off, or untick it, through the tick route, which
 * writes only the caller's own row, refuses a week that is submitted or
 * locked, and records the tick or the untick with its time. The row comes
 * back through the live listener. Rejects with a `RouteRefusal` carrying the
 * route's own sentence when it refuses, and with what `fetch` threw when no
 * answer came back, so the page can tell the two apart.
 */
export async function tickThroughRoute(args: { runId: string; weekNumber: number; itemId: string; next: boolean }): Promise<void> {
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(args.runId)}/ticks/${encodeURIComponent(args.itemId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: weekDocId(args.weekNumber), completed: args.next }),
    },
  );
  if (!res.ok) throw (await routeRefusalOf(res)) ?? new Error("That tick didn’t save.");
}
