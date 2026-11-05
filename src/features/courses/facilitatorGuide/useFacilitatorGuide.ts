"use client";

import { useEffect, useState } from "react";
import { COURSE_DOCUMENT_KEYS } from "@/lib/courses/facilitatorGuide/model";

/**
 * What a course's facilitator guide has loaded, for a page drawn in the
 * browser that links into it (a facilitator's Home): which weeks have
 * something, so this week's link is drawn only when this week has, and, by
 * being there at all, that the guide has something in it, so the link to the
 * guide's course page (every week and the course's own documents) is drawn
 * only then. One fetch of `/api/courses/[courseId]/facilitator-guide`, which
 * answers only the guide's own readers, with titles and never the words
 * under them.
 *
 * An empty `courseId` is idle and fetches nothing. A refusal, a failure and
 * a guide with nothing loaded all read as null: the page then simply draws no
 * link, which is the right answer for each.
 */
export type FacilitatorGuideWeeks = {
  courseId: string;
  /**
   * The week numbers with a session plan or notes loaded. Empty when only the
   * course's own documents are (the Handbook, the printables): the guide's
   * course page is still worth a link then.
   */
  weeks: number[];
};

/** The route's answer, read: the weeks it names for this course, or null when it names nothing loaded. */
export function guideWeeksFrom(body: unknown, courseId: string): FacilitatorGuideWeeks | null {
  if (!body || typeof body !== "object") return null;
  const answer = body as { courseId?: unknown; weeks?: unknown; documents?: unknown };
  if (answer.courseId !== courseId || !Array.isArray(answer.weeks)) return null;
  const weeks = answer.weeks
    .map((week) => (week && typeof week === "object" ? (week as { weekNumber?: unknown }).weekNumber : null))
    .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1);
  // The course's own documents count only by a key the guide has.
  const documents = Array.isArray(answer.documents)
    ? answer.documents.filter((doc) => {
        const key = doc && typeof doc === "object" ? (doc as { key?: unknown }).key : null;
        return typeof key === "string" && (COURSE_DOCUMENT_KEYS as readonly string[]).includes(key);
      }).length
    : 0;
  return weeks.length > 0 || documents > 0 ? { courseId, weeks } : null;
}

export function useFacilitatorGuide(courseId: string): FacilitatorGuideWeeks | null {
  const [store, setStore] = useState<{ key: string; data: FacilitatorGuideWeeks | null }>({ key: "", data: null });

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    fetch(`/api/courses/${encodeURIComponent(courseId)}/facilitator-guide`)
      .then(async (res) => (res.ok ? guideWeeksFrom(await res.json().catch(() => null), courseId) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setStore({ key: courseId, data });
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  return store.key === courseId ? store.data : null;
}

export default useFacilitatorGuide;
