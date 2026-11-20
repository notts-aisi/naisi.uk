"use client";

import { useEffect, useState } from "react";
import type { OverviewPayload } from "@/app/api/courses/runs/[runId]/overview/route";

/**
 * THE OVERVIEWS OF SEVERAL RUNS AT ONCE, for a Home that shows somebody's
 * groups across courses: one `GET /api/courses/runs/[runId]/overview` per run
 * id, the same request `useRunOverview` makes for one, read the same way.
 *
 * NO IDS, NO REQUEST: a Home about one run hands none, and this asks for
 * nothing and answers settled at once, so that Home asks exactly what it
 * asked before.
 *
 * `settled` once every run has answered, failed or given up. A run that
 * failed is left out of `byRun`: Home then draws the groups it could read,
 * and the run's own page is a tap away on My programmes.
 *
 * EACH RUN HAS `OVERVIEW_LIMIT_MS` TO ANSWER. A request still open then is
 * stopped and counts as failed, so one run that hangs (a cold start, a
 * stalled connection) never keeps Home waiting on the others.
 *
 * Its own module rather than a second export of `useRunOverview`, whose
 * module the page suites replace whole.
 */

export type RunOverviews = {
  /** Each run that answered, by its id. */
  byRun: ReadonlyMap<string, OverviewPayload>;
  /** Every run has answered or failed. */
  settled: boolean;
};

const NOTHING: RunOverviews = { byRun: new Map(), settled: true };

/** How long one run's overview may take before it counts as failed. */
export const OVERVIEW_LIMIT_MS = 8_000;

/**
 * One run's overview, as `useRunOverview` reads it: refused, failed, not a
 * run, or not answered within `limitMs` (the request is then stopped), null.
 */
export async function overviewOf(runId: string, limitMs: number = OVERVIEW_LIMIT_MS): Promise<OverviewPayload | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limitMs);
  try {
    const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/overview`, { signal: controller.signal });
    const body = (await res.json().catch(() => null)) as OverviewPayload | null;
    if (!res.ok || !body || !body.run) return null;
    // `groups` is newer than `group`: an answer from a container that predates it is read as `useRunOverview` reads it.
    return {
      ...body,
      groups: Array.isArray(body.groups) ? body.groups : body.group ? [body.group] : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function useRunOverviews(runIds: readonly string[]): RunOverviews {
  const key = runIds.join("\u0000");
  const [store, setStore] = useState<{ key: string; byRun: Map<string, OverviewPayload> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split("\u0000");
    void Promise.all(ids.map(async (runId) => [runId, await overviewOf(runId)] as const)).then((answers) => {
      if (cancelled) return;
      const byRun = new Map<string, OverviewPayload>();
      for (const [runId, payload] of answers) if (payload) byRun.set(runId, payload);
      setStore({ key, byRun });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!key) return NOTHING;
  if (store?.key !== key) return { byRun: new Map(), settled: false };
  return { byRun: store.byRun, settled: true };
}

export default useRunOverviews;
