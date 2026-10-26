"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { newSurveyId, type SurveyItem, type SurveyQuestion } from "@/lib/surveys/items";
import styles from "./surveyAdmin.module.css";

/**
 * A survey's words and questions, until it is sent (sv-edit), as small as is
 * honest: the title and intro people see, about how many minutes it takes,
 * the day it closes, and each question's words, options and lines, and their
 * order. Questions are not added, taken out or changed in kind here: the six
 * are the pair's, and the after survey asks them again.
 *
 * The whole survey is saved at once, through the route that refuses a survey
 * already sent. Nothing can be typed before the page's script has arrived
 * (the fields are disabled until then), so nothing is lost to it.
 */

export type EditorValues = {
  title: string;
  intro: string;
  minutes: number;
  /** "YYYY-MM-DD", London. */
  closesOn: string;
  items: SurveyItem[];
};

const TYPE_WORDS: Record<string, string> = {
  singleChoice: "Choose one",
  multipleChoice: "Pick any",
  rating: "1 to 5",
  lines: "1 to 5 for each line",
  shortText: "Short answer",
  longText: "Long answer",
};

function typeWords(question: SurveyQuestion): string {
  if (question.type === "singleChoice" && "look" in question && question.look === "agree") return "Agree or disagree";
  return TYPE_WORDS[question.type] ?? "";
}

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

export default function QuestionsEditor({
  surveyId,
  initial,
  measures,
  today,
}: {
  surveyId: string;
  initial: EditorValues;
  /** A section's id to the measure it asks about, for the template's sections. */
  measures: Record<string, string>;
  today: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [values, setValues] = useState<EditorValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<EditorValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setSaved(false);
  };
  const setItem = (index: number, item: SurveyItem) => {
    const items = [...values.items];
    items[index] = item;
    set({ items });
  };

  /** Swap a question with the question before or after it, wherever they are. */
  function move(index: number, by: -1 | 1) {
    const positions = values.items.map((item, at) => (item.kind === "question" ? at : -1)).filter((at) => at >= 0);
    const here = positions.indexOf(index);
    const there = positions[here + by];
    if (there === undefined) return;
    const items = [...values.items];
    [items[index], items[there]] = [items[there], items[index]];
    set({ items });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "That couldn’t be saved. Try again in a minute.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("That couldn’t be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const questionPositions = values.items.map((item, at) => (item.kind === "question" ? at : -1)).filter((at) => at >= 0);
  // Each item's page, and each question's number, worked out once per render.
  const placed = values.items.reduce<{ page: number; number: number; rows: { page: number; number: number }[] }>(
    (acc, item) => {
      const page = item.kind === "pageBreak" ? acc.page + 1 : acc.page;
      const number = item.kind === "question" ? acc.number + 1 : acc.number;
      return { page, number, rows: [...acc.rows, { page, number }] };
    },
    { page: 1, number: 0, rows: [] },
  ).rows;

  return (
    <fieldset className={`${styles.main} ${styles.plainFieldset}`} disabled={!hydrated}>
      <section className={`${styles.card} ${styles.section}`} aria-labelledby={`${id}-seen`}>
        <h2 id={`${id}-seen`} className={styles.sectionTitle}>
          What people see
        </h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-title`}>
            Title
          </label>
          <Input id={`${id}-title`} value={values.title} maxLength={120} onChange={(event) => set({ title: event.target.value })} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-intro`}>
            Intro
          </label>
          <Textarea id={`${id}-intro`} value={values.intro} rows={5} maxLength={1000} onChange={(event) => set({ intro: event.target.value })} />
          <p className={styles.muted}>
            A blank line starts a new paragraph. It opens the email too. The privacy box under it can’t be edited.
          </p>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-minutes`}>
              About how many minutes
            </label>
            <Input
              id={`${id}-minutes`}
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={values.minutes}
              onChange={(event) => set({ minutes: Number(event.target.value) })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-closes`}>
              It closes on
            </label>
            <Input id={`${id}-closes`} type="date" min={today} value={values.closesOn} onChange={(event) => set({ closesOn: event.target.value })} />
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.section}`} aria-labelledby={`${id}-questions`}>
        <h2 id={`${id}-questions`} className={styles.sectionTitle}>
          Questions
        </h2>
        <p className={styles.muted}>Each section is its own page on a phone.</p>
        {values.items.map((item, index) => {
          if (item.kind === "pageBreak") return null;
          const { page, number } = placed[index];
          if (item.kind === "section") {
            return (
              <div key={item.id} className={styles.qSection}>
                <div className={styles.qSectionHead}>
                  {measures[item.id] ? <span className={styles.qMeasure}>{measures[item.id]}</span> : <span />}
                  <span className={styles.qPage}>Page {page}</span>
                </div>
                <Input aria-label="Section heading" value={item.heading} maxLength={120} onChange={(event) => setItem(index, { ...item, heading: event.target.value })} />
              </div>
            );
          }
          const question = item;
          const at = questionPositions.indexOf(index);
          return (
            <div key={question.id} className={styles.question}>
              <span className={styles.qNumber}>{number}</span>
              <div className={styles.qBody}>
                <Textarea
                  aria-label={`Question ${number}`}
                  value={question.title}
                  rows={2}
                  maxLength={200}
                  onChange={(event) => setItem(index, { ...question, title: event.target.value } as SurveyQuestion)}
                />
                <span className={styles.qType}>{typeWords(question)}</span>
                {question.type === "lines" && (
                  <div className={styles.editRows}>
                    {question.lines.map((line, lineAt) => (
                      <div key={line.id} className={styles.editRow}>
                        <Input
                          aria-label={`Question ${number}, line ${lineAt + 1}`}
                          value={line.label}
                          maxLength={120}
                          onChange={(event) => {
                            const lines = question.lines.map((each) => (each.id === line.id ? { ...each, label: event.target.value } : each));
                            setItem(index, { ...question, lines });
                          }}
                        />
                        <button
                          type="button"
                          className={styles.textButton}
                          disabled={question.lines.length <= 1}
                          onClick={() => setItem(index, { ...question, lines: question.lines.filter((each) => each.id !== line.id) })}
                        >
                          Take out
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={question.lines.length >= 10}
                      onClick={() => setItem(index, { ...question, lines: [...question.lines, { id: newSurveyId("l"), label: "" }] })}
                    >
                      Add a line
                    </button>
                  </div>
                )}
                {(question.type === "singleChoice" || question.type === "multipleChoice") && (
                  <div className={styles.editRows}>
                    {(question.options ?? []).map((option, optionAt) => (
                      <div key={option.id} className={styles.editRow}>
                        <Input
                          aria-label={`Question ${number}, answer ${optionAt + 1}`}
                          value={option.label}
                          maxLength={120}
                          onChange={(event) => {
                            const options = (question.options ?? []).map((each) => (each.id === option.id ? { ...each, label: event.target.value } : each));
                            setItem(index, { ...question, options });
                          }}
                        />
                        <button
                          type="button"
                          className={styles.textButton}
                          disabled={(question.options ?? []).length <= 2}
                          onClick={() => setItem(index, { ...question, options: (question.options ?? []).filter((each) => each.id !== option.id) })}
                        >
                          Take out
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={(question.options ?? []).length >= 20}
                      onClick={() => setItem(index, { ...question, options: [...(question.options ?? []), { id: newSurveyId("o"), label: "" }] })}
                    >
                      Add an answer
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.moves}>
                <button type="button" className={styles.iconButton} aria-label={`Move question ${number} up`} disabled={at <= 0} onClick={() => move(index, -1)}>
                  <ArrowIcon up />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move question ${number} down`}
                  disabled={at >= questionPositions.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowIcon up={false} />
                </button>
              </div>
            </div>
          );
        })}
        <p className={styles.lockNote}>The change questions lock once this is sent, so the before and after match.</p>
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className={styles.done} role="status">
          Saved.
        </p>
      )}
      <div className={styles.buttons}>
        <Link href={`/admin/surveys/${encodeURIComponent(surveyId)}/send`} className={styles.action}>
          Next: send
        </Link>
        <Button type="button" onClick={save} disabled={!hydrated || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </fieldset>
  );
}
