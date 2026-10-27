"use client";

import { useEffect, useState } from "react";
import type { FacilitatorSummary } from "@/app/api/courses/groups/[groupId]/summary/route";

/**
 * What Home says about a facilitator's group beside the run's overview: how
 * many are expected, how many exercises wait for a review, when next week's
 * email goes, who left recently. One fetch of the summary route, whose gate
 * is the group page's.
 *
 * An empty `groupId` is idle (no group to ask about) and fetches nothing.
 * The store carries the group it was fetched for, so switching group never
 * shows one group's figures under another's name.
 */
export type FacilitatorSummaryState = {
  data: FacilitatorSummary | null;
  error: Error | null;
  loading: boolean;
};

export function useFacilitatorSummary(groupId: string): FacilitatorSummaryState {
  const [store, setStore] = useState<{ key: string; data: FacilitatorSummary | null; error: Error | null }>({
    key: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/summary`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (FacilitatorSummary & { error?: string }) | null;
        if (!res.ok || !body || body.groupId !== groupId) {
          throw new Error(body?.error ?? `Couldn't load your group (${res.status}).`);
        }
        return body;
      })
      .then((data) => {
        if (!cancelled) setStore({ key: groupId, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setStore({ key: groupId, data: null, error: e instanceof Error ? e : new Error(String(e)) });
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const fresh = store.key === groupId ? store : null;
  return {
    data: fresh?.data ?? null,
    error: fresh?.error ?? null,
    loading: Boolean(groupId) && fresh === null,
  };
}

export default useFacilitatorSummary;
