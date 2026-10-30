"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import type { BlanksRow } from "@/lib/surveys/blanks";
import { BLANKS_WORDS, blanksConfirmButtonWords, blanksConfirmWords, leftBlankWords } from "@/lib/surveys/words";
import styles from "./blanks.module.css";

/**
 * "SEND THE QUESTIONS THEY LEFT BLANK" for one person, on Who answered and on
 * their own answers page (docs/surveys.md): how many required questions they
 * left blank, the last press and what became of it, and the button, which
 * asks once more, naming the person and the count, before anything is sent.
 * Only while the survey takes answers: a closed survey says why instead.
 *
 * One person a press, never a list, and nothing goes on its own. The number
 * the confirmation names goes with the press; when it is no longer the number
 * blank, nothing is sent and the new number is shown.
 */
export default function BlanksButton({ surveyId, who, name, row }: { surveyId: string; who: string; name: string; row: BlanksRow }) {
  const hydrated = useHydrated();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState(row.count);
  const [pressed, setPressed] = useState(row.pressed);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/people/${encodeURIComponent(who)}/blanks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: count }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; questions?: number; pressed?: string };
      if (!response.ok) {
        if (typeof result.questions === "number") setCount(result.questions);
        setError(result.error ?? BLANKS_WORDS.failed);
        return;
      }
      setPressed(result.pressed ?? pressed);
      setAsking(false);
    } catch {
      setError(BLANKS_WORDS.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.blanks}>
      {count > 0 && <span className={styles.marker}>{leftBlankWords(count)}</span>}
      {pressed && <span className={styles.line}>{pressed}</span>}
      {row.why && <span className={styles.line}>{row.why}</span>}
      {row.can && count > 0 && !asking && (
        <Button variant="secondary" size="md" onClick={() => setAsking(true)} disabled={!hydrated}>
          {BLANKS_WORDS.button}
        </Button>
      )}
      {asking && (
        <div className={styles.confirm} role="group" aria-label={BLANKS_WORDS.button}>
          <p className={styles.confirmText}>{blanksConfirmWords(name, count)}</p>
          <div className={styles.confirmButtons}>
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
              {BLANKS_WORDS.confirmCancel}
            </Button>
            <Button onClick={send} disabled={busy}>
              {busy ? BLANKS_WORDS.sending : blanksConfirmButtonWords(count)}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
