"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextSessionReply } from "@/app/api/courses/runs/[runId]/next-session/route";

/**
 * WHAT HOME'S CARD FOR THE NEXT SESSION CAN BE TOLD: `GET
 * /api/courses/runs/[runId]/next-session`, the programme page's own server
 * answers (`nextSessionAnswersFor`) for a page that learns the run in the
 * browser. One-shot, with `reload` for the card's own presses (a request
 * sent or withdrawn), as `useRunOverview` is.
 *
 * Until it lands, or when the first read fails, `answers` is null and the
 * card offers no button, as the programme page does when a read fails: never
 * a button the server did not offer. A read again that fails keeps what the
 * card already showed. Asked at once, beside the overview, since Home draws
 * this form for somebody taking part.
 */
export function useNextSessionAnswers(runId: string, enabled: boolean): { answers: NextSessionReply | null; reload: () => void } {
  const [answers, setAnswers] = useState<NextSessionReply | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/next-session`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json().catch(() => null)) as NextSessionReply | null) : null))
      .then((body) => {
        if (!cancelled && body) setAnswers(body);
      })
      .catch(() => {
        // Kept as it was: a read that failed says nothing new.
      });
    return () => {
      cancelled = true;
    };
  }, [runId, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { answers, reload };
}
