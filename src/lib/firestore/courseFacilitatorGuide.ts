import {
  parseSlotKey,
  sanitizeGuideBlocks,
  sanitizeGuideTitle,
  slotKey,
  type GuideBlock,
  type GuideSlot,
} from "@/lib/courses/facilitatorGuide/model";

/**
 * `courseFacilitatorGuide/{courseId}__{slot}`: one document of a course's
 * facilitator guide. Per COURSE, not per run: every run of a course is
 * facilitated from the same plans. The slot is a week's session plan
 * (`w03-plan`), a week's notes (`w03-notes`), or one of the course's own
 * documents (`how-to-use`, `handbook`, `case-studies`, `printables`,
 * `sessions`, `week-notes`); the shapes are
 * `src/lib/courses/facilitatorGuide/model.ts`.
 *
 * TWO DOCUMENTS A WEEK, NOT ONE WITH TWO PARTS. A session's plan and a week's
 * notes are two tabs of the course docs, exported as two files and pasted
 * one at a time, so each is stored as itself: "Copy as Markdown" gives back
 * exactly the document that was pasted, and one is replaced without the
 * other. The week's page reads both and shows them as one page.
 *
 * WHO READS IT: a facilitator of a live group on a run of the course, the
 * lead of a programme that names a run of the course, and admins, through
 * the one gate (`src/lib/courses/facilitatorGuide/access.ts`). NOBODY TAKING
 * PART. It is never written into a week: anyone signed in can read a week's
 * document.
 *
 * WRITTEN AND READ ONLY ON THE SERVER. The one writer is the loader's route
 * (`src/app/api/courses/[courseId]/facilitator-guide/[slot]/route.ts`, admins
 * only); every read goes through `src/lib/courses/facilitatorGuide/store.ts`
 * behind the gate. `firestore.rules` refuses every browser, admins included.
 * So this file holds the shape and the normaliser, and nothing that reads or
 * writes.
 *
 * NOTHING PERSONAL. A document holds course material and when it was saved:
 * no uid, no name, no address. So it is not part of the per-account deletion
 * sweep, and it is deleted with its course (`destroyCourseCascade` in
 * `src/lib/firestore/courseDeletion.ts`).
 *
 * Pure.
 */

export const COURSE_FACILITATOR_GUIDE_COLLECTION = "courseFacilitatorGuide";

/** The document id: the course and the slot, with the house separator between. */
export function facilitatorGuideDocId(courseId: string, slot: GuideSlot): string {
  return `${courseId}__${slotKey(slot)}`;
}

export type CourseFacilitatorGuideDoc = {
  id: string;
  courseId: string;
  slot: GuideSlot;
  /** The document's title line, as written. */
  title: string;
  blocks: GuideBlock[];
  updatedAt: Date | null;
};

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/**
 * A stored document, or null for a row that cannot say which course and
 * which place it is, or whose id does not match them. A null row is shown
 * to nobody, which is the safe direction for a row nobody can place.
 */
export function normalizeCourseFacilitatorGuide(id: string, data: Record<string, unknown>): CourseFacilitatorGuideDoc | null {
  const courseId = typeof data.courseId === "string" ? data.courseId : "";
  const slot = parseSlotKey(data.slot);
  if (!courseId || !slot || id !== facilitatorGuideDocId(courseId, slot)) return null;
  return {
    id,
    courseId,
    slot,
    title: sanitizeGuideTitle(data.title),
    blocks: sanitizeGuideBlocks(data.blocks),
    updatedAt: tsToDate(data.updatedAt),
  };
}
