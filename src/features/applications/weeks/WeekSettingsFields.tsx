"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { COURSE_FIELD_LIMITS, oneLineQuestion } from "@/lib/firestore/courses";
import {
  ADD_QUESTION,
  PITCHING_HINT,
  PITCHING_LABEL,
  QUESTIONS_HINT,
  QUESTIONS_LABEL,
  REMOVE,
  SAVE_SETTINGS,
  SAVING,
  SUMMARY_HINT,
  SUMMARY_LABEL,
  TITLE_EMPTY,
  TITLE_HINT,
  TITLE_LABEL,
  otherPitchingWeekWords,
  pitchingWeekWords,
  questionEmptyWords,
  questionName,
  removeQuestionName,
} from "@/lib/courses/weekSettings/words";
import styles from "./weeks.module.css";
import own from "./weekSettings.module.css";

/**
 * THE REST OF "THIS WEEK’S SETTINGS" on a week's page on a programme's Weeks
 * tab: the title, the summary, the pitching week tick and the questions to
 * think about, saved together by "Save the week’s settings" through the one
 * route (`PUT /api/courses/runs/[runId]/weeks/[weekId]/settings`), which
 * decides who may and checks every field again. The facilitator guide box,
 * which saves on its own, is handed in as `children` and drawn above the
 * press, where the week's settings end.
 *
 * The save carries the settings' fingerprint as the page read them (`base`),
 * so the route refuses a save from a page older than what is stored, and it
 * refuses while somebody else holds the week's lock, as every save of a week
 * does. The line under the pitching tick names the week the pitching pages
 * treat as pitching week, which may be another week.
 *
 * Nothing is written until the press. Once the route has answered the page is
 * read again from the server, so what the boxes hold is what is stored. Every
 * control is drawn disabled until the page's script has arrived.
 */

type Settings = { title: string; summary: string; pitching: boolean; questions: string[] };
type Row = { key: string; text: string };

function rowsOf(questions: readonly string[]): Row[] {
  return questions.map((text, index) => ({ key: `saved-${index}`, text }));
}

export default function WeekSettingsFields({
  runId,
  weekId,
  weekNumber,
  stored,
  base,
  pitchingWeek,
  children,
}: {
  runId: string;
  weekId: string;
  weekNumber: number;
  /** The week's settings as stored. */
  stored: Settings;
  /** Their fingerprint, sent with the save so a save from an older page is refused (`settingsFingerprint`). */
  base: string;
  /** The week the pitching pages treat as pitching week (`readPitchingWeek`), or null while none is ticked. */
  pitchingWeek: number | null;
  children?: ReactNode;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const storedKey = JSON.stringify(stored);
  const [synced, setSynced] = useState(storedKey);
  const [title, setTitle] = useState(stored.title);
  const [summary, setSummary] = useState(stored.summary);
  const [pitching, setPitching] = useState(stored.pitching);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(stored.questions));
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "done" | "error"; text: string } | null>(null);

  // The page read again after a save: the boxes take what is stored now.
  if (storedKey !== synced) {
    setSynced(storedKey);
    setTitle(stored.title);
    setSummary(stored.summary);
    setPitching(stored.pitching);
    setRows(rowsOf(stored.questions));
  }

  const off = !hydrated || busy;
  const full = rows.length >= COURSE_FIELD_LIMITS.maxWeekQuestions;

  async function save() {
    if (!title.trim()) {
      setSaid({ tone: "error", text: TITLE_EMPTY });
      return;
    }
    const blank = rows.findIndex((row) => !oneLineQuestion(row.text));
    if (blank !== -1) {
      setSaid({ tone: "error", text: questionEmptyWords(blank + 1) });
      return;
    }
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base, title, summary, pitching, questions: rows.map((row) => row.text) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? "That didn’t save. Try again.");
      setSaid({ tone: "done", text: body.message ?? "" });
      router.refresh();
    } catch (err) {
      setSaid({ tone: "error", text: err instanceof Error ? err.message : "That didn’t save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const titleId = `week-title-${weekId}`;
  const summaryId = `week-summary-${weekId}`;
  const pitchingId = `week-pitching-${weekId}`;
  return (
    <>
      <Field id={titleId} label={TITLE_LABEL} hint={TITLE_HINT}>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={COURSE_FIELD_LIMITS.weekTitle}
          disabled={off}
        />
      </Field>
      <Field id={summaryId} label={SUMMARY_LABEL} hint={SUMMARY_HINT}>
        <Textarea
          id={summaryId}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={COURSE_FIELD_LIMITS.weekSummary}
          rows={3}
          disabled={off}
        />
      </Field>
      <div className={own.tick}>
        <input
          id={pitchingId}
          type="checkbox"
          className={own.box}
          checked={pitching}
          onChange={(event) => setPitching(event.target.checked)}
          disabled={off}
        />
        <label htmlFor={pitchingId} className={own.tickLabel}>
          <span className={own.tickName}>{PITCHING_LABEL}</span>
          <span className={styles.muted}>
            {pitchingWeek === null
              ? PITCHING_HINT
              : pitchingWeek === weekNumber
                ? pitchingWeekWords(weekNumber)
                : otherPitchingWeekWords(pitchingWeek)}
          </span>
        </label>
      </div>

      <div className={styles.setting}>
        <p className={styles.settingLabel} id={`week-questions-${weekId}`}>
          {QUESTIONS_LABEL}
        </p>
        <p className={styles.muted}>{QUESTIONS_HINT}</p>
        {rows.length > 0 && (
          <ol className={own.questions} aria-labelledby={`week-questions-${weekId}`}>
            {rows.map((row, index) => (
              <li key={row.key} className={own.question}>
                <Input
                  aria-label={questionName(index + 1)}
                  value={row.text}
                  onChange={(event) => {
                    const text = event.target.value;
                    setRows((current) => current.map((each) => (each.key === row.key ? { ...each, text } : each)));
                  }}
                  maxLength={COURSE_FIELD_LIMITS.weekQuestion}
                  disabled={off}
                />
                <button
                  type="button"
                  className={styles.button}
                  aria-label={removeQuestionName(index + 1)}
                  onClick={() => setRows((current) => current.filter((each) => each.key !== row.key))}
                  disabled={off}
                >
                  {REMOVE}
                </button>
              </li>
            ))}
          </ol>
        )}
        <div>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setRows((current) => [...current, { key: `added-${added}`, text: "" }]);
              setAdded((n) => n + 1);
            }}
            disabled={off || full}
          >
            {ADD_QUESTION}
          </button>
        </div>
      </div>

      {children}

      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void save()} disabled={off}>
          {busy ? SAVING : SAVE_SETTINGS}
        </button>
      </div>
      {said && (
        <p className={said.tone === "error" ? styles.problem : styles.done} role={said.tone === "error" ? "alert" : "status"}>
          {said.text}
        </p>
      )}
    </>
  );
}
