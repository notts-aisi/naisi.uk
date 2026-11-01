"use client";

import { useCallback, useState } from "react";
import { useRunProgress } from "@/features/courses/useRunProgress";
import type { CourseProgressDoc, ProgressItemKind } from "@/lib/firestore/courseProgress";
import { tickThroughRoute } from "../progressMutations";
import { TICK_NOT_SAVED, tickNotSavedWords } from "./tickWords";

/**
 * TICKING A READING OFF, the one way every page does it (C33): the week page,
 * the programme home before the first session, and Home's card.
 *
 * A tick is the member's own `courseProgress` row for the item, written by
 * the tick route (`tickThroughRoute`), which refuses a week that is submitted
 * or locked and records the tick with its time. Home and the programme home
 * tick through this hook, and so does the week page, so a tick on Home and a
 * tick on the week's own page are the same write of the same document, and
 * each page shows the other's tick as soon as it lands (the rows are live).
 *
 * WHO MAY TICK is the caller's to say (`canTick`): somebody taking part, as
 * the session's own uid (`uid`), on a week that takes work. Staff reading the
 * week tick nothing, and a refused write is put back and reported, never kept
 * on screen as if it had saved. The route asks again: an active seat told its
 * group, a facilitator of a live group, or, in week 1 before groups go out,
 * somebody holding a place.
 *
 * Optimistic: the box flips at once, and the live row settles it.
 *
 * WHAT A REFUSED TICK SAYS (`tick`'s `words`): the route's own sentence when
 * it refused (a week that locked while the page was open says so), and the
 * connection only when nothing came back (`./tickWords.ts`).
 */

/** What became of a tick: saved, or put back with what the page says about it. */
export type TickOutcome = { saved: true } | { saved: false; words: string };

export type MaterialTicks = {
  /** Whether an item is done, the flip in flight included. */
  isDone: (itemId: string) => boolean;
  /**
   * Ticks or unticks one item of `weekNumber`'s. Resolves once the write has
   * landed, or once it was refused (the box goes back), with the words that
   * say why.
   */
  tick: (itemKind: ProgressItemKind, itemId: string, next: boolean) => Promise<TickOutcome>;
  /** `tick`, for a page that only says that a tick did not save: true once it landed. */
  toggle: (itemKind: ProgressItemKind, itemId: string, next: boolean) => Promise<boolean>;
  /** The member's own rows for the run, by item id. */
  byItemId: Map<string, CourseProgressDoc>;
  canTick: boolean;
  loading: boolean;
  error: Error | null;
};

export function useMaterialTicks(
  runId: string,
  uid: string | null,
  weekNumber: number,
  canTick: boolean,
): MaterialTicks {
  const progress = useRunProgress(runId);
  const [flips, setFlips] = useState<ReadonlyMap<string, boolean>>(new Map());

  const setFlip = useCallback((itemId: string, value: boolean | null) => {
    setFlips((prev) => {
      const next = new Map(prev);
      if (value === null) next.delete(itemId);
      else next.set(itemId, value);
      return next;
    });
  }, []);

  const isDone = useCallback(
    (itemId: string) => flips.get(itemId) ?? progress.byItemId.get(itemId)?.completed ?? false,
    [flips, progress.byItemId],
  );

  const allowed = canTick && uid !== null && weekNumber >= 1;

  const tick = useCallback(
    async (itemKind: ProgressItemKind, itemId: string, next: boolean): Promise<TickOutcome> => {
      if (!allowed || !uid) return { saved: false, words: TICK_NOT_SAVED };
      setFlip(itemId, next);
      try {
        await tickThroughRoute({ runId, weekNumber, itemId, next });
        setFlip(itemId, null);
        return { saved: true };
      } catch (err) {
        setFlip(itemId, null);
        return { saved: false, words: tickNotSavedWords(err) };
      }
    },
    [allowed, runId, setFlip, uid, weekNumber],
  );

  const toggle = useCallback(
    async (itemKind: ProgressItemKind, itemId: string, next: boolean): Promise<boolean> =>
      (await tick(itemKind, itemId, next)).saved,
    [tick],
  );

  return {
    isDone,
    tick,
    toggle,
    byItemId: progress.byItemId,
    canTick: allowed,
    loading: progress.loading,
    error: progress.error,
  };
}

export default useMaterialTicks;
