"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplicationContent } from "@/lib/applications/model";
import type { ApplicantApplication } from "@/lib/applications/applicant/types";
import { saveDraft } from "./applyClient";

/**
 * Saving the draft as somebody goes.
 *
 * The form tells this hook that something changed, and the hook decides when
 * to save: a few seconds after the last change, at the latest after a longer
 * stretch of unbroken typing, at once when the person moves to another step,
 * and as the page is put away. One request is in flight at a time; a change
 * made while one is in flight is saved by the next.
 *
 * NOTHING IS SAVED UNTIL THE PERSON HAS DONE SOMETHING. The first save is what
 * creates an application, and somebody who opened the form, read it and left
 * has not started one. So a new form is saved only once a field has changed
 * or the person has pressed on (`confirm`); merely putting the page away
 * writes nothing.
 *
 * THE ONE PROMISE: the screen never says "Saved" about something that is not.
 * `state` is `saved` only when the last thing the form held is the last thing
 * the server accepted. A failure says so, keeps what was typed on the screen,
 * and tries again unless trying again cannot help (the form has closed, the
 * session has ended).
 */

export type SaveState =
  /** Nothing has been saved in this visit, and nothing is waiting to be. */
  | { kind: "idle" }
  | { kind: "saved" }
  /** A change is waiting, or a save is on its way. */
  | { kind: "saving" }
  /** The last save failed. `final` means another try cannot succeed. */
  | { kind: "failed"; message: string; final: boolean; status: number };

/** How long after the last change a save waits, so a sentence is one save and not forty. */
const SETTLE_MS = 2000;
/** The longest a change waits while somebody keeps typing. */
const MAX_WAIT_MS = 12_000;
const RETRY_FIRST_MS = 4000;
const RETRY_MAX_MS = 30_000;

/**
 * A refusal another try cannot fix: the request itself was refused (unreadable,
 * signed out, not allowed, gone, already decided). Everything else (offline,
 * too many requests, a fault on our side) is tried again.
 */
function isFinal(status: number, retry: boolean): boolean {
  if (retry) return false;
  return status >= 400 && status < 500;
}

export function useDraftSaver({
  roundId,
  enabled,
  alreadySaved,
  read,
  onSaved,
}: {
  roundId: string;
  /** False when nothing may be saved: the form is not open, or this is a view-as session. */
  enabled: boolean;
  /** The JSON of the draft the server already holds, or null when there is no application yet. */
  alreadySaved: string | null;
  /** The latest content, read at the moment of saving. */
  read: () => ApplicationContent;
  onSaved: (application: ApplicantApplication | null) => void;
}) {
  const [state, setState] = useState<SaveState>(alreadySaved === null ? { kind: "idle" } : { kind: "saved" });

  const savedJson = useRef(alreadySaved);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingSince = useRef<number | null>(null);
  const retryMs = useRef(RETRY_FIRST_MS);
  const stopped = useRef(false);
  /** False on a form nobody has touched yet. See the note at the top. */
  const started = useRef(alreadySaved !== null);
  const latest = useRef({ read, onSaved, enabled });
  const flushLater = useRef<() => void>(() => {});
  useEffect(() => {
    latest.current = { read, onSaved, enabled };
  });

  const clearSettle = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = null;
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      clearSettle();
      settle.current = setTimeout(() => flushLater.current(), delay);
    },
    [clearSettle],
  );

  /**
   * Save now if there is anything to save. Resolves true when the server
   * holds the latest content, or when there is nothing it ought to hold yet.
   * `confirm` marks a deliberate act (pressing on, or sending), which is
   * enough to start an application even when nothing was edited. `always`
   * saves even when this page believes the server already holds the same
   * content: a send uses it, because a save from an earlier visit to the page
   * can land after this one loaded, and what is sent must be what is on
   * the screen.
   */
  const flush = useCallback(
    async (leaving = false, confirm = false, always = false): Promise<boolean> => {
      clearSettle();
      if (!latest.current.enabled || stopped.current) return false;
      if (confirm) started.current = true;
      if (!started.current) return true;
      // One at a time: wait for a save already on its way, then look again.
      while (inFlight.current) await inFlight.current;
      const content = latest.current.read();
      const json = JSON.stringify(content);
      if (json === savedJson.current && !always) {
        waitingSince.current = null;
        setState((current) => (current.kind === "saving" ? { kind: "saved" } : current));
        return true;
      }
      setState({ kind: "saving" });
      const attempt = saveDraft(roundId, content, leaving).then((result) => {
        if (result.ok) {
          savedJson.current = json;
          waitingSince.current = null;
          retryMs.current = RETRY_FIRST_MS;
          latest.current.onSaved(result.application);
          return true;
        }
        const final = isFinal(result.status, result.retry);
        if (final) stopped.current = true;
        setState({ kind: "failed", message: result.error, final, status: result.status });
        return false;
      });
      inFlight.current = attempt;
      const ok = await attempt;
      inFlight.current = null;
      if (ok) {
        // Something may have been typed while the request was away.
        if (JSON.stringify(latest.current.read()) === savedJson.current) setState({ kind: "saved" });
        else schedule(SETTLE_MS);
      } else if (!stopped.current) {
        schedule(retryMs.current);
        retryMs.current = Math.min(RETRY_MAX_MS, retryMs.current * 2);
      }
      return ok;
    },
    [roundId, clearSettle, schedule],
  );

  useEffect(() => {
    flushLater.current = () => void flush();
  }, [flush]);

  /** The form calls this after every change. */
  const changed = useCallback(() => {
    if (!latest.current.enabled || stopped.current) return;
    started.current = true;
    const now = Date.now();
    if (waitingSince.current === null) waitingSince.current = now;
    setState((current) => (current.kind === "failed" ? current : { kind: "saving" }));
    const waited = now - waitingSince.current;
    schedule(Math.max(0, Math.min(SETTLE_MS, MAX_WAIT_MS - waited)));
  }, [schedule]);

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
      clearSettle();
    };
  }, [flush, clearSettle]);

  return { state, changed, flush };
}
