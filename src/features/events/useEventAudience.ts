"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InvitationCount } from "@/lib/events/inviteWords";
import type { EventProgramme } from "@/lib/firestore/events";

/**
 * WHO AN EVENT FOR CHOSEN PEOPLE IS FOR, as the editor holds it.
 *
 * What is stored comes from `GET /api/events/[id]/audience`: the choice (for
 * the person who made it, or an admin), who made it, the programme it is part
 * of, the programmes this person may make it part of, and what publishing it
 * would do. What the person changes is a draft beside it, counted as they go
 * by the route's POST, with the same plan publishing walks, and kept by the
 * editor's Save through `save()` (PUT). Nothing is kept by changing a tag:
 * like every other field of the editor, a choice is saved with Save.
 */

export type ChoiceTags = { include: string[]; exclude: string[] };

export type TieableProgramme = { roundId: string; programmeId: string; name: string; shortName: string };

export type StoredAudience = {
  choice: ChoiceTags | null;
  chosenBy: string | null;
  chosenByYou: boolean;
  programme: EventProgramme | null;
  mayChoose: boolean;
  programmes: TieableProgramme[];
  /** The programme it is part of is shown, not offered: this person may not take it off. */
  programmeFixed: boolean;
  count: InvitationCount | null;
  problem: string | null;
};

/** A programme's key in the editor: "<roundId>:<programmeId>". */
export const programmeChoiceKey = (p: { roundId: string; programmeId: string }) => `${p.roundId}:${p.programmeId}`;

/** How long a change waits for the next before it is counted. */
const SETTLE_MS = 300;

/** Whether two choices name the same tags, in whatever order. */
export const sameTags = (a: ChoiceTags | null, b: ChoiceTags | null) => {
  const norm = (tags: ChoiceTags | null) =>
    JSON.stringify({ include: [...(tags?.include ?? [])].sort(), exclude: [...(tags?.exclude ?? [])].sort() });
  return norm(a) === norm(b);
};

/**
 * `enabled`: read what is stored at all (somebody who may open the editor).
 * `counting`: the step shows an event for chosen people, so its numbers are
 * wanted: a choice on the screen that differs from what is stored, or one
 * stored while the event was not yet for chosen people, is counted.
 */
export function useEventAudience(eventId: string, enabled: boolean, wantCount: boolean) {
  const [stored, setStored] = useState<StoredAudience | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** The tags on the screen, or null while the person has not touched them. */
  const [draft, setDraft] = useState<ChoiceTags | null>(null);
  /** The programme on the screen as a key, "" for none, or null while untouched. */
  const [partOf, setPartOf] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; count: InvitationCount | null; problem: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/events/${encodeURIComponent(eventId)}/audience`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (StoredAudience & { ok?: boolean }) | null;
        if (!res.ok || !body?.ok) throw new Error(`status ${res.status}`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setStored({
          choice: body.choice,
          chosenBy: body.chosenBy,
          chosenByYou: body.chosenByYou,
          programme: body.programme,
          mayChoose: body.mayChoose,
          programmes: body.programmes ?? [],
          programmeFixed: body.programmeFixed !== false,
          count: body.count,
          problem: body.problem,
        });
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, enabled, attempt]);

  const storedPartOf = stored?.programme ? programmeChoiceKey(stored.programme) : "";
  const tags = draft ?? stored?.choice ?? null;
  const programmeKey = partOf ?? storedPartOf;
  const tagsChanged = draft !== null && !sameTags(draft, stored?.choice ?? null);
  const programmeChanged = partOf !== null && partOf !== storedPartOf;
  const dirty = tagsChanged || programmeChanged;
  // Counted afresh: a change on the screen, or a stored choice with no stored
  // count (it was kept while the event was listed). Only by somebody who may
  // choose: the count is the route's answer to a choice they could save.
  const previewing =
    enabled && wantCount && stored !== null && stored.mayChoose && (dirty || stored.count === null) && (tags?.include.length ?? 0) > 0;

  const body = useMemo(() => {
    // The one on the screen: one this person may tie, or the one stored, which
    // anybody saving keeps (the route refuses only a change).
    const programme =
      stored?.programmes.find((each) => programmeChoiceKey(each) === programmeKey) ??
      (stored?.programme && programmeChoiceKey(stored.programme) === programmeKey ? stored.programme : null);
    return JSON.stringify({
      include: tags?.include ?? [],
      exclude: tags?.exclude ?? [],
      programme: programme ? { roundId: programme.roundId, programmeId: programme.programmeId } : null,
    });
  }, [tags, programmeKey, stored]);

  // What the choice on the screen would do, a moment after the last change.
  useEffect(() => {
    if (!previewing) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/audience`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        });
        const answer = (await res.json().catch(() => null)) as { ok?: boolean; count?: InvitationCount; error?: string } | null;
        if (!res.ok || !answer?.ok || !answer.count) {
          setPreview({ key: body, count: null, problem: answer?.error ?? "We couldn’t count the invitations. Try again in a moment." });
          return;
        }
        setPreview({ key: body, count: answer.count, problem: null });
      } catch {
        if (!controller.signal.aborted) {
          setPreview({ key: body, count: null, problem: "We couldn’t count the invitations. Try again in a moment." });
        }
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [eventId, previewing, body]);

  const current = previewing ? (preview?.key === body ? preview : null) : null;
  const nothingChosen = (tags?.include.length ?? 0) === 0;
  const count = previewing ? (current?.count ?? null) : nothingChosen && dirty ? null : (stored?.count ?? null);
  const problem = previewing ? (current?.problem ?? null) : (stored?.problem ?? null);
  const counting = previewing && current === null;

  // Save reads the latest body even when called from a closure made before it.
  const latest = useRef(body);
  useEffect(() => {
    latest.current = body;
  }, [body]);

  /** Keep the choice on the screen. Throws with the route's sentence when it is refused. */
  const save = useCallback(async () => {
    const sent = latest.current;
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/audience`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: sent,
    });
    const answer = (await res.json().catch(() => null)) as { ok?: boolean; count?: InvitationCount; error?: string } | null;
    if (!res.ok || !answer?.ok) throw new Error(answer?.error ?? `Saving who it’s for failed (${res.status})`);
    const kept = JSON.parse(sent) as ChoiceTags & { programme: { roundId: string; programmeId: string } | null };
    setStored((was) => {
      if (!was) return was;
      const same = (p: { roundId: string; programmeId: string }) =>
        kept.programme !== null && programmeChoiceKey(p) === programmeChoiceKey(kept.programme);
      const offered = was.programmes.find(same);
      const programme = offered
        ? { roundId: offered.roundId, programmeId: offered.programmeId, name: offered.shortName }
        : was.programme && same(was.programme)
          ? was.programme
          : null;
      return {
        ...was,
        choice: { include: kept.include, exclude: kept.exclude },
        chosenBy: was.chosenByYou ? was.chosenBy : null,
        chosenByYou: true,
        programme,
        count: answer.count ?? was.count,
        problem: null,
      };
    });
    setDraft(null);
    setPartOf(null);
  }, [eventId]);

  return {
    stored,
    loadFailed,
    retry: () => setAttempt((n) => n + 1),
    tags,
    setTags: (next: ChoiceTags) => setDraft(next),
    programmeKey,
    setProgrammeKey: (key: string) => setPartOf(key),
    dirty,
    count,
    problem,
    counting,
    save,
  };
}

export type EventAudienceHandle = ReturnType<typeof useEventAudience>;
