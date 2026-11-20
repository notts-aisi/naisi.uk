"use client";

import { useEffect, useState } from "react";
import { GUIDE_READ_FAILED, guideReadOfAnswer, type GuideRead } from "@/lib/courses/facilitatorGuide/links";

/**
 * What a course's facilitator guide has loaded, for a page drawn in the
 * browser that links into it (a facilitator's Home): one fetch of
 * `/api/courses/[courseId]/facilitator-guide`, which answers only the guide's
 * own readers, with titles and never the words under them, read as one of
 * the three answers the session card's rule takes
 * (`src/lib/courses/facilitatorGuide/links.ts`): failed (a refusal, a
 * failure, an answer about another course), nothing loaded, or the weeks
 * that have something.
 *
 * Null while the answer is on its way, and for an empty `courseId`, which is
 * idle and fetches nothing: the page then draws nothing of the guide yet.
 */
export function useFacilitatorGuide(courseId: string): GuideRead | null {
  const [store, setStore] = useState<{ key: string; data: GuideRead | null }>({ key: "", data: null });

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    fetch(`/api/courses/${encodeURIComponent(courseId)}/facilitator-guide`)
      .then(async (res) => guideReadOfAnswer(res.ok, await res.json().catch(() => null), courseId))
      .catch(() => GUIDE_READ_FAILED)
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
