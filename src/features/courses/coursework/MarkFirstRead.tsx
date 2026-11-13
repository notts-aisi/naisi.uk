"use client";

import { useEffect } from "react";

/**
 * NAMES THE ANSWERS A READING PAGE HAS DRAWN IN FULL, so the time each was
 * first read by somebody on the team is kept
 * (`/api/courses/runs/[runId]/first-read`): once the page is in the browser
 * and in front of its reader, never while it is drawn on the server, so a
 * link preview or a prefetch marks nothing. A page opened in a tab nobody is
 * looking at waits until it is looked at.
 *
 * It draws nothing and says nothing: whether anything was kept is nobody's to
 * be told, and a refusal (a view-as session among them) changes nothing on
 * the page. The route asks every gate again, and keeps only times that are
 * missing; never who read anything.
 */
export default function MarkFirstRead({
  runId,
  weekId,
  people,
}: {
  runId: string;
  weekId: string;
  people: ReadonlyArray<{ uid: string; ids: readonly string[] }>;
}) {
  const body = JSON.stringify({ weekId, people });
  useEffect(() => {
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      document.removeEventListener("visibilitychange", send);
      void fetch(`/api/courses/runs/${encodeURIComponent(runId)}/first-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };
    send();
    if (!sent) document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, [runId, body]);
  return null;
}
