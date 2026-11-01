"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { CantMakeItView } from "@/lib/courses/cantMakeIt/model";
import {
  CAN_MAKE_IT_AFTER_ALL,
  CANT_MAKE_IT,
  CANT_MAKE_IT_REFUSAL,
  SAVING,
  TOLD_US,
  cantMakeItLabel,
  savedWords,
} from "@/lib/courses/cantMakeIt/words";
import styles from "./weekly.module.css";

/**
 * "CAN'T MAKE IT" ON THE TICKET OF THE NEXT SESSION, beside Add to calendar,
 * on the programme page of somebody taking part in the group, until the
 * session starts.
 *
 * One press tells us: the register records them as excused, and says so to
 * the group's facilitators (`POST /api/courses/groups/[groupId]/cant-make-it`,
 * which decides everything again). Nothing asks why, and nobody is emailed.
 * Once told, the ticket says so, with "I can make it after all" to take it
 * back while the session has not started, and says that too once pressed. A
 * refusal is the route's own sentence ("That session has already started, so
 * tell your facilitators yourself.").
 *
 * `locked` is a view-as session: an admin looking as the member reads the
 * ticket and can press nothing (the route refuses it too). Disabled until the
 * page has hydrated, as every control that needs its script is.
 */
export default function CantMakeIt({ view, locked = false }: { view: CantMakeItView; locked?: boolean }) {
  const hydrated = useHydrated();
  const [told, setTold] = useState(view.told);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once pressed, the line says what the press did, either way.
  const [pressed, setPressed] = useState(false);
  const inactive = !hydrated || locked || busy;
  const line = error ?? (pressed ? savedWords(told) : told ? TOLD_US : "");

  async function press(cantMakeIt: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/groups/${encodeURIComponent(view.groupId)}/cant-make-it`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: view.sessionKey, cantMakeIt }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; told?: boolean; error?: string };
      if (!res.ok || body.ok !== true) {
        setError(body.error ?? CANT_MAKE_IT_REFUSAL.failed);
        return;
      }
      setTold(body.told === true);
      setPressed(true);
    } catch {
      setError(CANT_MAKE_IT_REFUSAL.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={line ? `${styles.cantMakeIt} ${styles.cantMakeItWide}` : styles.cantMakeIt}>
      {/* One line, there from the first render, so a screen reader hears what
          a press did rather than a new region appearing. */}
      <p className={styles.cantMakeItLine} role="status">
        {line}
      </p>
      {told ? (
        <button type="button" className={styles.calendarButton} onClick={() => void press(false)} disabled={inactive}>
          {busy ? SAVING : CAN_MAKE_IT_AFTER_ALL}
        </button>
      ) : (
        <button
          type="button"
          className={styles.calendarButton}
          aria-label={busy ? SAVING : cantMakeItLabel(view.day)}
          onClick={() => void press(true)}
          disabled={inactive}
        >
          {busy ? SAVING : CANT_MAKE_IT}
        </button>
      )}
    </div>
  );
}
