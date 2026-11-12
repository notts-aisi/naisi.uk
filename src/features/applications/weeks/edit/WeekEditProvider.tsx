"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { WeekEditorView } from "@/lib/courses/weekEdit/editor";
import { useWeekLock, type WeekLock } from "./useWeekLock";

/**
 * ONE WEEK'S EDITING, SHARED ACROSS ITS PAGE: the week as the editor reads it
 * (`GET /api/courses/runs/[runId]/weeks/[weekId]/editor`, first handed in
 * from the server's own read) and the week's one lock, so the block list,
 * its side panel and the paste further down the page take, keep and give
 * back ONE hold and see the same holder.
 *
 * After a save the week is read again through the editor route; a fresh
 * server render of the page (Mark ready, the owner, a paste's save) hands a
 * new read in, which replaces what was read here.
 */

export type WeekEdit = {
  runId: string;
  weekId: string;
  weekNumber: number;
  /** The programme's short name, for "Every group on AGI Strategy (11)". */
  programme: string;
  roundId: string;
  programmeId: string;
  view: WeekEditorView;
  /** Read the week again through the editor route. */
  reload: () => Promise<void>;
  lock: WeekLock;
};

const Context = createContext<WeekEdit | null>(null);

/** The week's editing, or null outside a week's page (the run's week editor in Courses, a group's paste). */
export function useWeekEdit(): WeekEdit | null {
  return useContext(Context);
}

export default function WeekEditProvider({
  view,
  programme,
  roundId,
  programmeId,
  children,
}: {
  view: WeekEditorView;
  programme: string;
  roundId: string;
  programmeId: string;
  children: ReactNode;
}) {
  // The server's read until the page reads it again; a new server read replaces both.
  const [handed, setHanded] = useState(view);
  const [fetched, setFetched] = useState<WeekEditorView | null>(null);
  if (handed !== view) {
    setHanded(view);
    setFetched(null);
  }
  const current = fetched ?? view;
  const lock = useWeekLock(view.runId, view.weekId, view.lock);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(view.runId)}/weeks/${encodeURIComponent(view.weekId)}/editor`, { cache: "no-store" });
      if (!res.ok) return;
      setFetched((await res.json()) as WeekEditorView);
    } catch {
      // The page keeps what it last read; the next save or reload reads again.
    }
  }, [view.runId, view.weekId]);

  return (
    <Context.Provider
      value={{
        runId: view.runId,
        weekId: view.weekId,
        weekNumber: view.weekNumber,
        programme,
        roundId,
        programmeId,
        view: current,
        reload,
        lock,
      }}
    >
      {children}
    </Context.Provider>
  );
}
