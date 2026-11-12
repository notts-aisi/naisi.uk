"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { roomButtonWords, sentWords, type GroupPageView } from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * THE GROUP'S ROOM, from its page: the room it meets in every week, or Room
 * to be confirmed, saved through the programme's room route
 * (`PUT .../groups/[groupId]/room`, the programme's lead or an admin; the
 * route asks again). A changed room tells the group: the button says how
 * many it emails, the count being the send's own, and a count that no
 * longer holds is refused (409) with the new one, which the button then
 * shows. One week's room is Change this week's.
 */
export default function RoomPanel({
  view,
  roomPath,
  onClose,
  onDone,
}: {
  view: GroupPageView;
  /** The programme's room route for this group. */
  roomPath: string;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [room, setRoom] = useState(view.meets.room);
  const [tbc, setTbc] = useState(!view.meets.room);
  const [emails, setEmails] = useState(view.notice.refused ? 0 : view.notice.emails);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = !hydrated || busy;
  const value = tbc ? "" : room.replace(/\s+/g, " ").trim();
  const changed = value !== view.meets.room;
  const tell = changed && emails > 0 && !view.notice.refused;

  async function save() {
    setBusy(true);
    setProblem(null);
    let status = 0;
    let body: Record<string, unknown> | null = null;
    try {
      const response = await fetch(roomPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: value, tell, ...(tell ? { emailCount: emails } : {}) }),
      });
      status = response.status;
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setBusy(false);
      setProblem(UNKNOWN_OUTCOME);
      return;
    }
    setBusy(false);
    if (status === 409 && typeof body?.emails === "number") {
      setEmails(body.emails);
      setProblem(typeof body.error === "string" ? body.error : UNKNOWN_OUTCOME);
      return;
    }
    if (status !== 200 || body?.ok !== true) {
      setProblem(typeof body?.error === "string" ? body.error : UNKNOWN_OUTCOME);
      return;
    }
    const message = typeof body.message === "string" ? body.message : "";
    const tally = body.email as { sent: number; held: number; suppressed: number; failed: number } | null;
    onDone([message, sentWords(tally)].filter(Boolean).join(" "));
  }

  const titleId = `${ids}-title`;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {W.roomPanelTitle(view.groupName)}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CLOSE}
        </Button>
      </div>
      <p className={styles.panelLede}>{W.ROOM_PANEL_HINT}</p>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${ids}-room`}>
          {W.ROOM_FIELD}
        </label>
        <Input
          id={`${ids}-room`}
          type="text"
          autoComplete="off"
          maxLength={200}
          value={tbc ? "" : room}
          disabled={off || tbc}
          onChange={(e) => setRoom(e.target.value)}
        />
      </div>
      <label className={styles.tick}>
        <input type="checkbox" checked={tbc} disabled={off} onChange={(e) => setTbc(e.target.checked)} className={styles.checkbox} />
        <span className={styles.optionText}>
          <span className={styles.optionName}>{W.ROOM_TBC}</span>
          <span className={styles.optionHint}>{W.ROOM_TBC_HINT}</span>
        </span>
      </label>
      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}
      <div className={styles.panelActions}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CANCEL}
        </Button>
        <Button type="button" onClick={() => void save()} disabled={off || !changed}>
          {busy ? W.SAVING : roomButtonWords(tell ? emails : 0)}
        </Button>
      </div>
    </section>
  );
}
