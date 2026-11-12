"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

/**
 * EVERY BOX'S WAITING SAVE, IN ONE PLACE ON THE WEEK PAGE. Each box on a week
 * page (a reflection, a fill-in box, the written answer) saves as its writer
 * types, a moment after they stop (`useDebouncedWrite`). Nothing closes at a
 * send any more, but a send must carry the last words typed, so whatever on
 * the page sends writes everything still waiting first (`flushAll`, or the
 * box's own `flush`, which the written answer's Send calls).
 *
 * The week page holds one registry (`WeekSavesProvider`); each box registers
 * its saver's `flush` while it is on the page (`useRegisterFlush`); `flushAll`
 * waits for every write to settle.
 */

type Flush = () => Promise<unknown>;

type Registry = { add: (flush: () => Flush) => () => void };

const WeekSaves = createContext<Registry | null>(null);

/** The page's registry, and the one call that writes everything waiting. */
export function useWeekSaves(): { registry: Registry; flushAll: () => Promise<void> } {
  const live = useRef(new Set<() => Flush>());
  return useMemo(
    () => ({
      registry: {
        add: (latest: () => Flush) => {
          live.current.add(latest);
          return () => {
            live.current.delete(latest);
          };
        },
      },
      flushAll: async () => {
        // A write that fails says so on its own box; whatever asked goes on.
        await Promise.allSettled([...live.current].map((latest) => latest()()));
      },
    }),
    [],
  );
}

export function WeekSavesProvider({ registry, children }: { registry: Registry; children: ReactNode }) {
  return <WeekSaves.Provider value={registry}>{children}</WeekSaves.Provider>;
}

/** Registers a box's `flush` with the page's registry while the box is on the page. */
export function useRegisterFlush(flush: Flush): void {
  const registry = useContext(WeekSaves);
  const latest = useRef(flush);
  useEffect(() => {
    latest.current = flush;
  }, [flush]);
  useEffect(() => {
    if (!registry) return;
    return registry.add(() => latest.current);
  }, [registry]);
}
