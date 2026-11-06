"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { JoiningOnlineView } from "@/lib/courses/joiningOnline/model";
import {
  IN_THE_ROOM_AFTER_ALL,
  JOINING_ONLINE,
  JOINING_ONLINE_REFUSAL,
  SAVING,
  joiningOnlineLabel,
  onlineSavedWords,
  saidOnlineWords,
} from "@/lib/courses/joiningOnline/words";
import styles from "./weekly.module.css";

/**
 * "JOINING ONLINE" ON THE TICKET OF THE NEXT SESSION, beside Add to calendar
 * and "Can't make it", on the programme page of somebody taking part in the
 * group, until the session starts, for a session held in a room.
 *
 * One press tells us (`POST /api/courses/groups/[groupId]/joining-online`,
 * which decides everything again): the register keeps their word, never as a
 * mark, and the group's facilitators are asked for a meeting link for that
 * week. Nothing asks why, and nobody is emailed. Once said, the ticket says
 * so and where the link is, with "I'll be in the room after all" to take it
 * back while the session has not started. A refusal is the route's own
 * sentence.
 *
 * `hasLink` is whether this ticket already carries the session's link, so the
 * line says the link is here rather than that it will be. `onSaidChange`
 * hears every press that saved, so the ticket offers "Can't make it" only
 * while they have not said this (`TicketAnswers`). `locked` is a view-as
 * session: an admin looking as the member reads the ticket and can press
 * nothing (the route refuses it too). Disabled until the page has hydrated.
 */
export default function JoiningOnline({
  view,
  hasLink,
  locked = false,
  onSaidChange,
}: {
  view: JoiningOnlineView;
  hasLink: boolean;
  locked?: boolean;
  onSaidChange?: (said: boolean) => void;
}) {
  const hydrated = useHydrated();
  const [said, setSaid] = useState(view.said);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once pressed, the line says what the press did, either way.
  const [pressed, setPressed] = useState(false);
  const inactive = !hydrated || locked || busy;
  const line = error ?? (pressed ? onlineSavedWords(said, hasLink) : said ? saidOnlineWords(hasLink) : "");

  async function press(online: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/groups/${encodeURIComponent(view.groupId)}/joining-online`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: view.sessionKey, online }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; online?: boolean; error?: string };
      if (!res.ok || body.ok !== true) {
        setError(body.error ?? JOINING_ONLINE_REFUSAL.failed);
        return;
      }
      setSaid(body.online === true);
      setPressed(true);
      onSaidChange?.(body.online === true);
    } catch {
      setError(JOINING_ONLINE_REFUSAL.failed);
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
      {said ? (
        <button type="button" className={styles.calendarButton} onClick={() => void press(false)} disabled={inactive}>
          {busy ? SAVING : IN_THE_ROOM_AFTER_ALL}
        </button>
      ) : (
        <button
          type="button"
          className={styles.calendarButton}
          aria-label={busy ? SAVING : joiningOnlineLabel(view.day)}
          onClick={() => void press(true)}
          disabled={inactive}
        >
          {busy ? SAVING : JOINING_ONLINE}
        </button>
      )}
    </div>
  );
}
