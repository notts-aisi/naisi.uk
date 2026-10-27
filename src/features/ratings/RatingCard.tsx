"use client";

import { useRef, useState, type FormEvent } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { RatingAnswers, RatingQuestion } from "@/lib/ratings/model";
import { RATINGS_WORDS } from "@/lib/ratings/words";
import styles from "./ratings.module.css";

/**
 * ONE RATER'S RATING OF ONE FELLOW: their name, the sessions they came to
 * (from the register, never typed), then the programme's questions, each a
 * row of real radio buttons left to the browser, starting on what this rater
 * saved. Save sends the whole rating; a question left blank is left out.
 * About two minutes a person. Save waits for the page's script.
 *
 * Handed only what it draws: the person's name, uid and sessions line, and
 * this rater's own answers. Nothing anybody else said reaches it.
 */

type Props = {
  groupId: string;
  uid: string;
  name: string;
  came: string;
  /** On an incubator, the fellow's team: the research the mentor rating is about. */
  team: string | null;
  facilitator: boolean;
  questions: RatingQuestion[];
  answers: RatingAnswers;
};

/** The answers in the form, in the shape the route reads. */
function answersIn(form: HTMLFormElement, questions: readonly RatingQuestion[]): Record<string, number | string> {
  const data = new FormData(form);
  const out: Record<string, number | string> = {};
  for (const question of questions) {
    const value = data.get(question.key);
    if (typeof value !== "string" || value === "") continue;
    out[question.key] = question.kind === "choice" ? value : Number(value);
  }
  return out;
}

/** "1 Low · 5 High": the words a scale has at its points, in order. */
function anchorsLine(question: Extract<RatingQuestion, { kind: "scale" }>): string {
  return question.anchors.map((anchor) => `${anchor.at} ${anchor.label}`).join(" · ");
}

export default function RatingCard({ groupId, uid, name, came, team, facilitator, questions, answers }: Props) {
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const headingId = `rate-${uid}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "idle" || !formRef.current) return;
    setState("saving");
    setError("");
    setSaid("");
    const sent = answersIn(formRef.current, questions);
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, answers: sent }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setError(result.error ?? RATINGS_WORDS.failed);
      else setSaid(Object.keys(sent).length > 0 ? RATINGS_WORDS.saved : RATINGS_WORDS.cleared);
    } catch {
      setError(RATINGS_WORDS.failed);
    } finally {
      setState("idle");
    }
  }

  const mentorFrom = questions.findIndex((question) => question.key === "m1");
  // What this rater saved, by question, read from the answers' own keys.
  const saved = new Map<string, unknown>(Object.entries(answers));
  return (
    <form ref={formRef} className={styles.card} onSubmit={onSubmit} aria-labelledby={headingId} noValidate>
      <div className={styles.cardHead}>
        <h3 id={headingId} className={styles.name}>
          {name}
        </h3>
        {facilitator && <span className={styles.chip}>{RATINGS_WORDS.facilitator}</span>}
      </div>
      <p className={styles.came}>{came}</p>
      {team && <p className={styles.came}>{team}</p>}
      {questions.map((question, index) => (
        <div key={question.key} className={styles.questionWrap}>
          {index === mentorFrom && <p className={styles.part}>{RATINGS_WORDS.mentorHeading}</p>}
          <fieldset className={styles.question}>
            <legend className={styles.legend}>{question.title}</legend>
            <div className={question.kind === "scale" && question.max > 5 ? `${styles.points} ${styles.ten}` : styles.points}>
              {question.kind === "scale"
                ? Array.from({ length: question.max - question.min + 1 }, (_, at) => question.min + at).map((point) => (
                    <label key={point} className={styles.point}>
                      <input
                        type="radio"
                        name={question.key}
                        value={String(point)}
                        defaultChecked={saved.get(question.key) === point}
                        className={styles.radio}
                      />
                      <span className={styles.pointFace}>{point}</span>
                    </label>
                  ))
                : question.options.map((option) => (
                    <label key={option.id} className={`${styles.point} ${styles.wide}`}>
                      <input
                        type="radio"
                        name={question.key}
                        value={option.id}
                        defaultChecked={saved.get(question.key) === option.id}
                        className={styles.radio}
                      />
                      <span className={styles.pointFace}>{option.label}</span>
                    </label>
                  ))}
            </div>
            {question.kind === "scale" && <p className={styles.anchors}>{anchorsLine(question)}</p>}
          </fieldset>
        </div>
      ))}
      <div className={styles.foot}>
        <button type="submit" className={styles.save} disabled={!hydrated || state === "saving"}>
          {state === "saving" ? RATINGS_WORDS.saving : RATINGS_WORDS.save}
        </button>
        {said && !error && (
          <p className={styles.said} role="status">
            {said}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
