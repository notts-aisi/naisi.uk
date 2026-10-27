"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useAuth } from "@/auth/AuthProvider";
import type { PredictionCardReadAnswer } from "@/app/api/courses/[courseId]/predictions/route";
import { foundWords, predictionCardToText } from "@/lib/courses/predictions/cardText";
import { PREDICTION_LIMITS, type PredictionCard } from "@/lib/courses/predictions/model";
import {
  CARD_EDITOR_HINT,
  CARD_EDITOR_TITLE,
  CARD_FIELD_HINT,
  CARD_FIELD_LABEL,
  CARD_NONE,
  CARD_ONLY_ADMIN,
  CARD_SAVED,
  CARD_TAKEN_OFF,
  OPEN_WEEK_LABEL,
  SEAL_WEEK_LABEL,
  cardWeeksWords,
  kindWords,
} from "@/lib/courses/predictions/words";
import styles from "./adminCourses.module.css";
import own from "./coursePredictions.module.css";

/**
 * THE COURSE'S CARD FOR SEALED PREDICTIONS, IN ITS DETAILS
 * (`CourseDoc.predictionCard`): the questions every run of the course asks
 * in the week the card is sealed in and again in the week it opens in, with
 * those two weeks. An admin pastes the card as printed, or edits the copy
 * shown here, says the two weeks, reads it back and saves it; or takes the
 * card off, so no week shows one.
 *
 * No board draws this card: its words are listed for the boards' designers.
 * Everybody else who can open the course sees the card as it stands and that
 * an admin changes it. Writes go through `/api/courses/[courseId]/predictions`.
 */
export default function CoursePredictionsCard({ courseId, stored }: { courseId: string; stored: PredictionCard | null }) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const fieldId = useId();
  const hintId = useId();
  const sealId = useId();
  const openId = useId();
  const [saved, setSaved] = useState<PredictionCard | null>(stored);
  const [text, setText] = useState(stored ? predictionCardToText(stored) : "");
  const [sealWeek, setSealWeek] = useState(stored ? String(stored.sealWeek) : "");
  const [openWeek, setOpenWeek] = useState(stored ? String(stored.openWeek) : "");
  const [read, setRead] = useState<PredictionCardReadAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weeksSent = () => ({
    sealWeek: sealWeek.trim() === "" ? null : Number(sealWeek),
    openWeek: openWeek.trim() === "" ? null : Number(openWeek),
  });

  const call = async (method: "POST" | "PUT", body: Record<string, unknown>) => {
    const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}/predictions`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => null)) as (PredictionCardReadAnswer & { error?: string; ok?: boolean }) | null;
    if (!res.ok) throw new Error(out?.error ?? "That didn’t go through. Try again.");
    return out;
  };

  const readIt = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setRead((await call("POST", { text, ...weeksSent() })) as PredictionCardReadAnswer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (remove: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const out = await call("PUT", remove ? { remove: true } : { text, ...weeksSent() });
      const next = (out?.card ?? null) as PredictionCard | null;
      setSaved(next);
      setText(next ? predictionCardToText(next) : "");
      setSealWeek(next ? String(next.sealWeek) : "");
      setOpenWeek(next ? String(next.openWeek) : "");
      setRead(null);
      setMessage(next ? CARD_SAVED : CARD_TAKEN_OFF);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const shown = read?.card ?? saved;
  const changed = () => {
    setRead(null);
    setMessage(null);
  };
  return (
    <Card padding="lg">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{CARD_EDITOR_TITLE}</h2>
          <p className={styles.sectionHint}>{CARD_EDITOR_HINT}</p>
        </div>

        {shown ? (
          <div className={own.preview}>
            {shown.title && <p className={own.title}>{shown.title}</p>}
            {shown.intro && <p className={own.line}>{shown.intro}</p>}
            <ol className={own.questions} role="list">
              {shown.questions.map((question) => (
                <li key={question.id} className={own.question}>
                  <span className={own.statement}>
                    {question.number && <span className={own.number}>{question.number}.</span>} {question.statement}
                  </span>
                  <span className={own.kind}>{kindWords(question)}</span>
                </li>
              ))}
            </ol>
            {Number.isInteger(shown.sealWeek) && Number.isInteger(shown.openWeek) && (
              <p className={own.line}>{cardWeeksWords(shown.sealWeek, shown.openWeek)}</p>
            )}
          </div>
        ) : (
          <p className={own.line}>{CARD_NONE}</p>
        )}

        {isAdmin ? (
          <div className={own.form}>
            <div className={own.weeks}>
              <div className={own.weekField}>
                <label htmlFor={sealId} className={own.label}>
                  {SEAL_WEEK_LABEL}
                </label>
                <input
                  id={sealId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={PREDICTION_LIMITS.maxWeek}
                  step={1}
                  className={own.weekInput}
                  value={sealWeek}
                  disabled={busy}
                  onChange={(event) => {
                    setSealWeek(event.currentTarget.value);
                    changed();
                  }}
                />
              </div>
              <div className={own.weekField}>
                <label htmlFor={openId} className={own.label}>
                  {OPEN_WEEK_LABEL}
                </label>
                <input
                  id={openId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={PREDICTION_LIMITS.maxWeek}
                  step={1}
                  className={own.weekInput}
                  value={openWeek}
                  disabled={busy}
                  onChange={(event) => {
                    setOpenWeek(event.currentTarget.value);
                    changed();
                  }}
                />
              </div>
            </div>
            <label htmlFor={fieldId} className={own.label}>
              {CARD_FIELD_LABEL}
            </label>
            <p id={hintId} className={own.hint}>
              {CARD_FIELD_HINT}
            </p>
            <textarea
              id={fieldId}
              className={own.box}
              rows={12}
              value={text}
              aria-describedby={hintId}
              onChange={(event) => {
                setText(event.currentTarget.value);
                changed();
              }}
              disabled={busy}
            />
            {read && read.card && <p className={own.line}>What we found: {foundWords(read.card.questions)}.</p>}
            {read && read.problems.length > 0 && (
              <div className={own.problems}>
                <p className={own.label}>Before it can be saved</p>
                <ul>
                  {read.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.formActions}>
              <Button variant="ghost" onClick={() => void readIt()} disabled={busy || !text.trim()}>
                Read it
              </Button>
              <Button onClick={() => void save(false)} disabled={busy || !read?.card || read.problems.length > 0}>
                Save the card
              </Button>
              {saved && (
                <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
                  Take it off
                </Button>
              )}
            </div>
            {message && (
              <p className={own.line} role="status">
                {message}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p className={own.line}>{CARD_ONLY_ADMIN}</p>
        )}
      </section>
    </Card>
  );
}
