"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WeekLockState } from "@/lib/courses/weekEdit/lock";
import { lockBeat } from "@/lib/courses/weekEdit/pageModel";

/**
 * ONE EDITOR AT A TIME, FROM THE PAGE: the week's lock routes
 * (`/api/courses/runs/[runId]/weeks/[weekId]/lock`) driven as an edit opens
 * and closes.
 *
 *  - `take` when a block's panel or the paste opens: POST. Refused (409) with
 *    the holder's name while somebody else is editing the week.
 *  - Kept alive while the edit stays open: PUT every `keepAliveMs` the route
 *    gave. Refused (409) once the hold has lapsed and somebody else has it:
 *    the page says so (`lost`) and keeps what was typed, and the next beat
 *    tries to take it again.
 *  - NEVER HELD FROM A HIDDEN TAB OR AN IDLE PAGE (`lockBeat`): the hold is
 *    given back the moment the tab is hidden, as the admin pages' own lock
 *    does, and after ten minutes with no typing, clicking or scrolling, so a
 *    panel left open does not keep the week from everybody else for hours.
 *    The person comes back to the same path as a lapsed hold: the page says
 *    the hold ended, keeps what was typed, and takes it again as soon as
 *    they are back (the tab shown again, or any input).
 *  - `give` on a save, on cancel and on leaving the page: DELETE (sent with
 *    `keepalive` on the way out, so a closed tab gives it back too).
 *  - While somebody else holds it, the lock is read again on a timer and
 *    whenever the window comes back into focus, so editing opens when they
 *    save or leave.
 *
 * A save never needs the hold: the routes refuse one only while somebody
 * else's is live. A hold this page did not take (another tab of the same
 * person) reads as free here.
 */

export type LockHolder = { name: string; since: string };

export type WeekLock = {
  /** The lock as the route last answered. */
  lock: WeekLockState;
  /** This page holds the week for an edit it has open. */
  holding: boolean;
  /** This page's hold ended while its edit was open. */
  lost: boolean;
  /** Somebody else is editing the week: every editing control is off. */
  heldBy: LockHolder | null;
  /** Take the week for an edit. False, with the holder named in `lock`, when somebody else has it. */
  take: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Give the week back: the edit closed. */
  give: () => void;
  /** A save was refused with a holder: show them. */
  refusedBy: (holder: LockHolder, line: string) => void;
};

/** How often the page asks again while somebody else holds the week. */
const RECHECK_MS = 15_000;

/** The keep-alive a hold uses when the route has not said: a third of the hold. */
const DEFAULT_KEEP_ALIVE_MS = 30_000;

export function useWeekLock(runId: string, weekId: string, initial: WeekLockState): WeekLock {
  const url = `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/lock`;
  const [lock, setLock] = useState<WeekLockState>(initial);
  const [holding, setHolding] = useState(false);
  const [lost, setLost] = useState(false);
  const holdingRef = useRef(false);
  const lostRef = useRef(false);
  // When the person last typed, clicked or scrolled; when this page last gave its hold back itself.
  const lastInputRef = useRef(0);
  const letGoAtRef = useRef<number | null>(null);
  const retakingRef = useRef(false);

  const call = useCallback(
    async (method: "GET" | "POST" | "PUT" | "DELETE", keepalive = false): Promise<{ status: number; body: Record<string, unknown> } | null> => {
      try {
        const res = await fetch(url, { method, keepalive, cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return { status: res.status, body };
      } catch {
        return null;
      }
    },
    [url],
  );

  const settle = useCallback((body: Record<string, unknown>) => {
    const next = body.lock as WeekLockState | undefined;
    if (next && typeof next === "object" && "state" in next) setLock(next);
  }, []);

  const heldFrom = useCallback((body: Record<string, unknown>) => {
    const holder = body.holder as LockHolder | undefined;
    if (holder && typeof holder.name === "string") {
      setLock({ state: "held", name: holder.name, since: holder.since, line: typeof body.error === "string" ? body.error : "" });
    }
  }, []);

  const take = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const answer = await call("POST");
    if (!answer) return { ok: false, error: "Couldn’t reach the site. Check your connection and try again." };
    if (answer.status === 200) {
      settle(answer.body);
      holdingRef.current = true;
      lostRef.current = false;
      lastInputRef.current = Date.now();
      letGoAtRef.current = null;
      setHolding(true);
      setLost(false);
      return { ok: true };
    }
    if (answer.status === 409) heldFrom(answer.body);
    return { ok: false, error: typeof answer.body.error === "string" ? answer.body.error : "That didn’t work. Try again." };
  }, [call, settle, heldFrom]);

  const give = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    lostRef.current = false;
    letGoAtRef.current = null;
    setHolding(false);
    setLost(false);
    void call("DELETE", true).then((answer) => {
      if (answer?.status === 200) settle(answer.body);
    });
  }, [call, settle]);

  const refusedBy = useCallback((holder: LockHolder, line: string) => {
    setLock({ state: "held", name: holder.name, since: holder.since, line });
  }, []);

  // Keep the hold alive while an edit is open and the person is here; give it
  // back from a hidden tab or an idle page; after a loss, take it again.
  const keepAliveMs = lock.state === "yours" ? lock.keepAliveMs : DEFAULT_KEEP_ALIVE_MS;
  useEffect(() => {
    if (!holding) return;
    const visible = () => document.visibilityState !== "hidden";
    /** The page gives its own hold back: the edit stays open, and says the hold ended. */
    const letGo = () => {
      if (!holdingRef.current || lostRef.current) return;
      lostRef.current = true;
      letGoAtRef.current = Date.now();
      setLost(true);
      void call("DELETE", true);
    };
    const takeAgain = async () => {
      if (retakingRef.current || !holdingRef.current) return;
      retakingRef.current = true;
      try {
        const again = await call("POST");
        if (again?.status === 200 && holdingRef.current) {
          settle(again.body);
          lostRef.current = false;
          letGoAtRef.current = null;
          setLost(false);
        } else if (again?.status === 409) heldFrom(again.body);
      } finally {
        retakingRef.current = false;
      }
    };
    const act = async () => {
      if (!holdingRef.current) return;
      const next = lockBeat({
        visible: visible(),
        lost: lostRef.current,
        now: Date.now(),
        lastInputAt: lastInputRef.current,
        letGoAt: letGoAtRef.current,
      });
      if (next === "letGo") letGo();
      else if (next === "takeAgain") await takeAgain();
      else if (next === "keep") {
        const kept = await call("PUT");
        if (!holdingRef.current || !kept) return;
        if (kept.status === 200) settle(kept.body);
        else if (kept.status === 409) {
          lostRef.current = true;
          setLost(true);
        }
      }
    };
    // Any input is the person being here; back after a let go, the hold is taken again at once.
    const onInput = () => {
      lastInputRef.current = Date.now();
      if (lostRef.current && letGoAtRef.current !== null && visible()) void act();
    };
    const onVisibility = () => {
      if (visible()) onInput();
      else void act();
    };
    const inputs = ["pointerdown", "keydown", "input", "wheel", "touchstart"] as const;
    for (const name of inputs) window.addEventListener(name, onInput, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const beat = window.setInterval(() => void act(), Math.max(5_000, keepAliveMs));
    return () => {
      for (const name of inputs) window.removeEventListener(name, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(beat);
    };
  }, [holding, keepAliveMs, call, settle, heldFrom]);

  // While somebody else holds it: ask again on a timer and on focus.
  const heldByOther = lock.state === "held";
  useEffect(() => {
    if (holding) return;
    const recheck = () => {
      void call("GET").then((answer) => {
        if (answer?.status === 200 && !holdingRef.current) settle(answer.body);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisible);
    const timer = heldByOther ? window.setInterval(recheck, RECHECK_MS) : null;
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [holding, heldByOther, call, settle]);

  // Leaving the page gives the week back.
  useEffect(() => {
    const leave = () => {
      if (!holdingRef.current) return;
      holdingRef.current = false;
      void call("DELETE", true);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [call]);

  return {
    lock,
    holding,
    lost,
    heldBy: lock.state === "held" ? { name: lock.name, since: lock.since } : null,
    take,
    give,
    refusedBy,
  };
}
