"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The access-requirements box: loading what the person wrote before, and
 * saving what they type.
 *
 * It has its own two requests and its own state because the answer is not
 * part of the application. It is not in the draft, it is not in what is sent,
 * and it is not on the page the form is first drawn from: it is asked for
 * here, once, when the form opens, and kept for as long as the form is on
 * the screen, so moving between steps does not lose what was typed.
 *
 * ## It saves with the draft
 *
 * A change is saved a moment after the person stops typing, at once when they
 * leave the box, and as the page is put away, the way the draft is. Each save
 * first makes sure the draft itself is saved (`saveDraftFirst`), because the
 * first save of a draft is what creates the application this answer is kept
 * beside. `settle` is what the form awaits before it sends or leaves, so
 * nothing typed here is left behind by either.
 *
 * ## Two promises
 *
 *  - Nothing can be typed until what was written before has loaded. A box
 *    that opened empty and then saved would write over an answer the person
 *    could not see.
 *  - The box never says "Saved" about something that is not: the word is
 *    shown only when the last thing typed is the last thing the server
 *    accepted.
 *
 * Nothing is read or saved during a view-as session (`enabled` is false). The
 * routes refuse one anyway.
 */

export type AccessRequirementsStatus =
  /** A view-as session: the box is not shown and nothing is asked for. */
  | { kind: "off" }
  | { kind: "loading" }
  /** What was written before could not be loaded, so the box is switched off. */
  | { kind: "unloaded"; message: string }
  /** Loaded, and nothing has been typed in this visit. */
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  /** The last save failed. `final` means another try cannot succeed. */
  | { kind: "failed"; message: string; final: boolean };

export type AccessRequirements = {
  status: AccessRequirementsStatus;
  /** What the box opens holding. Changes only when a load lands. */
  first: string;
  /** Counts loads, so the box can be drawn afresh from `first` after one. */
  loads: number;
  /** The box calls this after every change. */
  typed: (value: string) => void;
  /** The box calls this when the person leaves it. */
  left: () => void;
  /** Ask again for what was written before, after a load that failed. */
  reload: () => void;
  /**
   * Save now if there is anything to save. Resolves true when the server
   * holds what the box holds, or when there is nothing it ought to hold.
   */
  settle: () => Promise<boolean>;
};

type Answer =
  | { ok: true; accessRequirements: string }
  | { ok: false; status: number; error: string; retry: boolean };

/** How long after the last change a save waits. */
const SETTLE_MS = 1500;
/** The longest a change waits while somebody keeps typing. */
const MAX_WAIT_MS = 12_000;
const RETRY_FIRST_MS = 4000;
const RETRY_MAX_MS = 30_000;

const OFFLINE = "We could not reach the site. Check your connection.";
const NOT_LOADED = "We could not load what you wrote here before.";
const NOT_SAVED = "We could not save what you wrote here.";
const DRAFT_NOT_SAVED = "We could not save your application yet, so this is not saved either.";

function url(roundId: string): string {
  return `/api/admissions/forms/${encodeURIComponent(roundId)}/application/access-requirements`;
}

async function answerOf(response: Response, fallback: string): Promise<Answer> {
  let body: { accessRequirements?: unknown; error?: unknown; retry?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Not JSON: the fallback sentence stands.
  }
  if (response.ok && typeof body.accessRequirements === "string") {
    return { ok: true, accessRequirements: body.accessRequirements };
  }
  return {
    ok: false,
    status: response.status,
    error: typeof body.error === "string" && body.error ? body.error : fallback,
    // Too many requests, a fault on our side, or the server saying so.
    retry: response.status === 429 || response.status >= 500 || body.retry === true,
  };
}

async function load(roundId: string): Promise<Answer> {
  try {
    return await answerOf(await fetch(url(roundId), { cache: "no-store" }), NOT_LOADED);
  } catch {
    return { ok: false, status: 0, error: OFFLINE, retry: true };
  }
}

async function save(roundId: string, accessRequirements: string, leaving: boolean): Promise<Answer> {
  try {
    const response = await fetch(url(roundId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessRequirements }),
      // A save made as the page is put away is finished even if the tab closes.
      keepalive: leaving,
    });
    return await answerOf(response, NOT_SAVED);
  } catch {
    return { ok: false, status: 0, error: OFFLINE, retry: true };
  }
}

export function useAccessRequirements({
  roundId,
  enabled,
  saveDraftFirst,
}: {
  roundId: string;
  /** False when nothing may be read or saved: this is a view-as session. */
  enabled: boolean;
  /** Saves the draft if it needs saving. Resolves true once the server holds it. */
  saveDraftFirst: () => Promise<boolean>;
}): AccessRequirements {
  const [status, setStatus] = useState<AccessRequirementsStatus>(
    enabled ? { kind: "loading" } : { kind: "off" },
  );
  const [first, setFirst] = useState("");
  const [loads, setLoads] = useState(0);
  const [asked, setAsked] = useState(0);

  /** What the box holds now. */
  const value = useRef("");
  /** What the server holds, or null until that is known. */
  const stored = useRef<string | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingSince = useRef<number | null>(null);
  const retryMs = useRef(RETRY_FIRST_MS);
  const stopped = useRef(false);
  const latest = useRef({ enabled, saveDraftFirst });
  const flushLater = useRef<() => void>(() => {});
  useEffect(() => {
    latest.current = { enabled, saveDraftFirst };
  });

  // Ask once for what was written before, and again when asked to.
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void load(roundId).then((answer) => {
      if (!current) return;
      if (!answer.ok) {
        setStatus({ kind: "unloaded", message: answer.error });
        return;
      }
      stored.current = answer.accessRequirements;
      value.current = answer.accessRequirements;
      setFirst(answer.accessRequirements);
      setLoads((count) => count + 1);
      setStatus({ kind: "idle" });
    });
    return () => {
      current = false;
    };
  }, [roundId, enabled, asked]);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      timer.current = setTimeout(() => flushLater.current(), delay);
    },
    [clearTimer],
  );

  const flush = useCallback(
    async (leaving = false, again = false): Promise<boolean> => {
      clearTimer();
      // A try the person made (leaving the box, pressing Send) starts the
      // waits over. Only the timer's own tries wait longer each time.
      if (!again) retryMs.current = RETRY_FIRST_MS;
      // Nothing can have been typed into a box that never opened.
      if (!latest.current.enabled || stored.current === null) return true;
      // One at a time: wait for a save already on its way, then look again.
      while (inFlight.current) await inFlight.current;
      const typed = value.current;
      // The server trims, so a trailing space is not a change.
      if (typed.trim() === stored.current) {
        waitingSince.current = null;
        // Something was waiting, or a save had failed, and the box is back to
        // what is stored: that is saved. A box nobody has touched stays quiet,
        // and one refused for good goes on saying so.
        setStatus((now) =>
          now.kind === "saving" || (now.kind === "failed" && !now.final) ? { kind: "saved" } : now,
        );
        return true;
      }
      if (stopped.current) return false;
      setStatus({ kind: "saving" });
      const attempt = (async (): Promise<boolean> => {
        // The draft first, because its first save is what creates the
        // application this is kept beside. Not as the page is put away: the
        // draft is saving itself then, and waiting for it may never return.
        if (!leaving && !(await latest.current.saveDraftFirst())) {
          setStatus({ kind: "failed", message: DRAFT_NOT_SAVED, final: false });
          return false;
        }
        const answer = await save(roundId, typed, leaving);
        if (answer.ok) {
          stored.current = answer.accessRequirements;
          waitingSince.current = null;
          retryMs.current = RETRY_FIRST_MS;
          return true;
        }
        // A request refused as it stands (signed out, closed, not allowed)
        // is not tried again. Everything else is.
        const final = !answer.retry && answer.status >= 400 && answer.status < 500;
        if (final) stopped.current = true;
        setStatus({ kind: "failed", message: answer.error, final });
        return false;
      })();
      inFlight.current = attempt;
      const ok = await attempt;
      inFlight.current = null;
      if (ok) {
        // Something may have been typed while the request was away.
        if (value.current.trim() === stored.current) setStatus({ kind: "saved" });
        else schedule(SETTLE_MS);
      } else if (!stopped.current) {
        // Also after a save made as the page was put away: if the page comes
        // back, the try is made again; if it does not, the timer never fires.
        schedule(retryMs.current);
        retryMs.current = Math.min(RETRY_MAX_MS, retryMs.current * 2);
      }
      return ok;
    },
    [roundId, clearTimer, schedule],
  );

  useEffect(() => {
    flushLater.current = () => void flush(false, true);
  }, [flush]);

  const typed = useCallback(
    (next: string) => {
      value.current = next;
      if (!latest.current.enabled || stored.current === null || stopped.current) return;
      const now = Date.now();
      if (waitingSince.current === null) waitingSince.current = now;
      setStatus((current) => (current.kind === "failed" ? current : { kind: "saving" }));
      schedule(Math.max(0, Math.min(SETTLE_MS, MAX_WAIT_MS - (now - waitingSince.current))));
    },
    [schedule],
  );

  const left = useCallback(() => void flush(), [flush]);
  const settle = useCallback(() => flush(), [flush]);

  const reload = useCallback(() => {
    setStatus({ kind: "loading" });
    setAsked((count) => count + 1);
  }, []);

  // Save as the page is put away: a phone switching apps may never bring it back.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    const onPageHide = () => void flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      clearTimer();
    };
  }, [flush, clearTimer]);

  return { status, first, loads, typed, left, reload, settle };
}
