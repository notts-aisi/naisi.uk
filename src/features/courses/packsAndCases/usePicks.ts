"use client";

import { useCallback, useState } from "react";
import type { OverviewPicks } from "@/app/api/courses/runs/[runId]/overview/route";
import type { PackCaseWire } from "@/app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route";

/**
 * THE PERSON'S OWN PACKS, CASES AND READY MARKS ON ONE WEEK'S PAGE (plan item
 * 8): what the overview handed in when the page loaded, with what they have
 * changed since laid over it, and the two ways to change it, each through
 * the one route that writes a person's own record
 * (`/api/courses/runs/[runId]/packs-and-cases/[blockId]`).
 *
 * Optimistic: a pick or a mark shows at once; a refused one goes back and
 * says so under the block, never kept on screen as if it had saved.
 */

export type Picks = {
  /** The pack the person has in this Choose one, or null. */
  packOf: (chooseOneId: string) => string | null;
  /** The case the person was given in this talk, or null. */
  caseOf: (talkId: string) => string | null;
  isReady: (talkId: string) => boolean;
  /** A pack the person picks can still change: until their session starts. */
  open: boolean;
  pick: (chooseOneId: string, packId: string) => void;
  setReady: (talkId: string, ready: boolean) => void;
  /** Why the last change to this block did not save, or null. */
  errorOf: (blockId: string) => string | null;
  /** A change to this block is on its way. */
  isSaving: (blockId: string) => boolean;
};

const NO_PICKS: OverviewPicks = { packs: {}, cases: {}, ready: [], open: true };

async function put(runId: string, blockId: string, body: Record<string, unknown>): Promise<PackCaseWire> {
  const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/packs-and-cases/${encodeURIComponent(blockId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => null)) as { record?: PackCaseWire; error?: string } | null;
  if (!res.ok || !answer?.record) throw new Error(answer?.error ?? "");
  return answer.record;
}

export function usePicks(runId: string, weekId: string, handed: OverviewPicks | null, notSaved: string): Picks {
  const base = handed ?? NO_PICKS;
  const [packs, setPacks] = useState<ReadonlyMap<string, string>>(new Map());
  const [ready, setReadyMap] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());

  const setOne = useCallback(<T,>(set: (fn: (prev: ReadonlyMap<string, T>) => ReadonlyMap<string, T>) => void, key: string, value: T | null) => {
    set((prev) => {
      const next = new Map(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }, []);

  const mark = useCallback((blockId: string, on: boolean) => {
    setSaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(blockId);
      else next.delete(blockId);
      return next;
    });
  }, []);

  const pick = useCallback(
    (chooseOneId: string, packId: string) => {
      const before = packs.has(chooseOneId) ? (packs.get(chooseOneId) ?? null) : (base.packs[chooseOneId] ?? null);
      setOne(setPacks, chooseOneId, packId);
      setOne(setErrors, chooseOneId, null);
      mark(chooseOneId, true);
      put(runId, chooseOneId, { weekId, packId })
        .catch((err: unknown) => {
          setOne(setPacks, chooseOneId, before);
          setOne(setErrors, chooseOneId, err instanceof Error && err.message ? err.message : notSaved);
        })
        .finally(() => mark(chooseOneId, false));
    },
    [base.packs, mark, notSaved, packs, runId, setOne, weekId],
  );

  const setReady = useCallback(
    (talkId: string, next: boolean) => {
      const before = ready.has(talkId) ? (ready.get(talkId) ?? false) : base.ready.includes(talkId);
      setOne(setReadyMap, talkId, next);
      setOne(setErrors, talkId, null);
      mark(talkId, true);
      put(runId, talkId, { weekId, ready: next })
        .catch((err: unknown) => {
          setOne(setReadyMap, talkId, before);
          setOne(setErrors, talkId, err instanceof Error && err.message ? err.message : notSaved);
        })
        .finally(() => mark(talkId, false));
    },
    [base.ready, mark, notSaved, ready, runId, setOne, weekId],
  );

  return {
    packOf: (chooseOneId) => (packs.has(chooseOneId) ? (packs.get(chooseOneId) ?? null) : (base.packs[chooseOneId] ?? null)),
    caseOf: (talkId) => base.cases[talkId] ?? null,
    isReady: (talkId) => (ready.has(talkId) ? ready.get(talkId) === true : base.ready.includes(talkId)),
    open: base.open,
    pick,
    setReady,
    errorOf: (blockId) => errors.get(blockId) ?? null,
    isSaving: (blockId) => saving.has(blockId),
  };
}
