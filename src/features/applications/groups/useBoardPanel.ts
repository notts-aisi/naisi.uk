"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardPanelView } from "@/lib/applications/handover/boardPanelView";

/**
 * THE PERSON'S PANEL'S ONE READ, for everybody on People in groups at once:
 * `GET /api/admissions/forms/[roundId]/programmes/[programmeId]/panel`,
 * which answers each person as this reader may be shown them (the server
 * decides; nothing is filtered here).
 *
 * Read only once somebody opens a panel (`wanted`), so a board nobody opens
 * a panel on reads nothing more than it did. Read again when `groupsKey`
 * changes while it is wanted: the weeks are drawn against the run's groups,
 * and a group added or retimed elsewhere would leave the chart behind. A
 * move inside the board changes no group's time, so it reads nothing again:
 * the board says which group somebody is in.
 */
export type BoardPanelRead = {
  panel: BoardPanelView | null;
  loading: boolean;
  failed: boolean;
  /** The read's own status when it failed, or undefined when no answer came (no connection). */
  failedStatus?: number;
  retry: () => void;
};

export function useBoardPanel(roundId: string, programmeId: string, wanted: boolean, groupsKey: string): BoardPanelRead {
  const [panel, setPanel] = useState<BoardPanelView | null>(null);
  const [readFor, setReadFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [failedStatus, setFailedStatus] = useState<number | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const key = `${groupsKey}#${nonce}`;

  useEffect(() => {
    if (!wanted || readFor === key) return;
    let cancelled = false;
    fetch(`/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/panel`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { panel?: BoardPanelView } | null;
        if (!res.ok || !body?.panel) throw Object.assign(new Error(String(res.status)), { status: res.status });
        return body.panel;
      })
      .then((read) => {
        if (cancelled) return;
        setPanel(read);
        setFailedFor(null);
        setReadFor(key);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: unknown } | null)?.status;
        setFailedStatus(typeof status === "number" ? status : undefined);
        setFailedFor(key);
        setReadFor(key);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, key, readFor, roundId, programmeId]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const loading = wanted && readFor !== key;
  const failed = !loading && failedFor === key;
  return { panel, loading, failed, ...(failed ? { failedStatus } : {}), retry };
}
