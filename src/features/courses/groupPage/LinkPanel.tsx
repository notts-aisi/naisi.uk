"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import type { GroupPageView } from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import styles from "./GroupPage.module.css";

/**
 * SET THE LINK: a meeting link for one week, or for every week from the
 * next session on, saved through the group's meeting link route
 * (`POST /api/courses/groups/[groupId]/meeting-link`, which admits the
 * group's facilitators, the programme's lead, the run's track leads and
 * admins, and asks again). Nobody is emailed: the link is on the programme
 * page only, never in an email. The panel never shows a link the group
 * already has: the page is never handed one.
 */
export default function LinkPanel({
  view,
  week,
  onClose,
  onDone,
}: {
  view: GroupPageView;
  /** The week it is for, or null for every week from the next session on. */
  week: { weekNumber: number; sessionKey: string } | null;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const target = week ?? (view.linkSessionKey && view.linkWeekNumber !== null ? { weekNumber: view.linkWeekNumber, sessionKey: view.linkSessionKey } : null);
  const [url, setUrl] = useState("");
  const [everyWeek, setEveryWeek] = useState(week === null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = !hydrated || busy;

  async function save() {
    if (!target) return;
    setBusy(true);
    setProblem(null);
    let status = 0;
    let body: Record<string, unknown> | null = null;
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(view.groupId)}/meeting-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: target.sessionKey, url: url.trim(), everyWeek }),
      });
      status = response.status;
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setBusy(false);
      setProblem(UNKNOWN_OUTCOME);
      return;
    }
    setBusy(false);
    if (status !== 200 || body?.ok !== true) {
      setProblem(typeof body?.error === "string" ? body.error : UNKNOWN_OUTCOME);
      return;
    }
    onDone(W.linkSavedWords(target.weekNumber, everyWeek));
  }

  const titleId = `${ids}-title`;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {W.SET_THE_LINK}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CLOSE}
        </Button>
      </div>
      {!target ? (
        <p className={styles.panelNote}>{W.NO_SESSION_FOR_LINK}</p>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${ids}-url`}>
              {W.LINK_FIELD}
            </label>
            <Input
              id={`${ids}-url`}
              type="url"
              inputMode="url"
              autoComplete="off"
              maxLength={300}
              value={url}
              disabled={off}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className={styles.fieldHint}>{W.LINK_HINT}</p>
          </div>
          <fieldset className={styles.options}>
            <legend className={styles.legend}>{W.WHICH_SESSIONS}</legend>
            {[false, true].map((every) => (
              <label
                key={String(every)}
                className={[styles.option, everyWeek === every ? styles.optionChosen : ""].filter(Boolean).join(" ")}
              >
                <input
                  type="radio"
                  name={`${ids}-scope`}
                  checked={everyWeek === every}
                  disabled={off}
                  onChange={() => setEveryWeek(every)}
                  className={styles.radio}
                />
                <span className={styles.optionText}>
                  <span className={styles.optionName}>{every ? W.EVERY_WEEK : W.weekOnlyWords(target.weekNumber)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}
      <div className={styles.panelActions}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CANCEL}
        </Button>
        {target && (
          <Button type="button" onClick={() => void save()} disabled={off || !url.trim()}>
            {busy ? W.SAVING : W.SAVE_THE_LINK}
          </Button>
        )}
      </div>
    </section>
  );
}
