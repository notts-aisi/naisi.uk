"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { COURSE_FIELD_LIMITS, oneLineQuestion } from "@/lib/firestore/courses";
import styles from "./WeekQuestionsEditor.module.css";

/**
 * A WEEK'S "QUESTIONS TO THINK ABOUT" (C29), as its editors write them: the
 * run's week editor (`WeekEditor`, client-direct under the weeks rules) and
 * a group's own copy of a week (`GroupWeekEditor`, through the group week
 * route). Both hand this section the questions as stored and a way to save a
 * new list; nothing here writes.
 *
 * The rows are drawn as board pr-weeks draws "Questions for groups": a
 * labelled line each ("Question 1"), a button to remove it, and "Add a
 * question". Each question is one line, at most
 * `COURSE_FIELD_LIMITS.weekQuestion` characters, and a week holds at most
 * `COURSE_FIELD_LIMITS.maxWeekQuestions`. An empty row is refused before
 * anything is sent, in the route's own words.
 */

/** The section's words. The drawn ones are board pr-weeks's; the rest are listed for the boards' designers. */
export const QUESTIONS_EDITOR_WORDS = {
  runHeading: "Questions for groups",
  groupHeading: "Questions for your group",
  add: "Add a question",
  save: "Save questions",
  empty: "No questions yet. A week without any shows none.",
} as const;

/** "Question 2", the label over the second row. */
export function questionLabel(n: number): string {
  return `Question ${n}`;
}

/** "Remove question 2", the name of the second row's remove button. */
export function removeQuestionLabel(n: number): string {
  return `Remove question ${n}`;
}

/** The refusal for an empty row: the group week route says the same. */
export function questionEmptyWords(n: number): string {
  return `Question ${n} is empty. Write it, or remove it.`;
}

/** Under the heading: how many, how long, and where they show. */
export function questionsHint(forGroup: boolean): string {
  const who = forGroup ? "your group" : "each group";
  return `Up to ${COURSE_FIELD_LIMITS.maxWeekQuestions} questions for ${who} to think about before the session, one line each. The week’s page numbers them in this order.`;
}

/** "2/5 questions", beside the buttons. */
export function questionsCount(n: number): string {
  return `${n}/${COURSE_FIELD_LIMITS.maxWeekQuestions} questions`;
}

type Row = { key: string; text: string };

/** The saved list as rows, keyed by place: a reload reseeds them all. */
function rowsOf(questions: readonly string[]): Row[] {
  return questions.map((text, index) => ({ key: `saved-${index}`, text }));
}

export default function WeekQuestionsEditor({
  questions,
  onSave,
  forGroup = false,
  headingLevel = 3,
  busy = false,
}: {
  /** The week's questions as stored. */
  questions: readonly string[];
  /** Saves the whole list; resolves true when it was saved. */
  onSave: (questions: string[]) => Promise<boolean>;
  /** A group's own copy of the week, which says "your group". */
  forGroup?: boolean;
  headingLevel?: 2 | 3;
  busy?: boolean;
}) {
  const fieldId = useId();
  const [rows, setRows] = useState<Row[]>(() => rowsOf(questions));
  const [synced, setSynced] = useState<readonly string[]>(questions);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reseed whenever the stored list is read again, as the checklist does.
  if (questions !== synced) {
    setSynced(questions);
    setRows(rowsOf(questions));
    setError(null);
  }

  const heading = forGroup ? QUESTIONS_EDITOR_WORDS.groupHeading : QUESTIONS_EDITOR_WORDS.runHeading;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const dirty = JSON.stringify(rows.map((row) => row.text)) !== JSON.stringify(questions);
  const full = rows.length >= COURSE_FIELD_LIMITS.maxWeekQuestions;
  const off = busy || saving;

  function add() {
    if (full) return;
    setRows((current) => [...current, { key: `added-${added}`, text: "" }]);
    setAdded((n) => n + 1);
  }

  async function save() {
    const blank = rows.findIndex((row) => !oneLineQuestion(row.text));
    if (blank !== -1) {
      setError(questionEmptyWords(blank + 1));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(rows.map((row) => oneLineQuestion(row.text)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg">
      <Heading className={styles.title}>{heading}</Heading>
      <p className={styles.hint}>{questionsHint(forGroup)}</p>

      {rows.length === 0 ? (
        <p className={styles.empty}>{QUESTIONS_EDITOR_WORDS.empty}</p>
      ) : (
        <ol className={styles.rows} aria-label={heading}>
          {rows.map((row, index) => {
            const id = `${fieldId}-${row.key}`;
            return (
              <li key={row.key} className={styles.row}>
                <div className={styles.field}>
                  <Field id={id} label={questionLabel(index + 1)}>
                    <Input
                      id={id}
                      type="text"
                      value={row.text}
                      onChange={(event) => {
                        const text = event.target.value;
                        setRows((current) => current.map((item) => (item.key === row.key ? { ...item, text } : item)));
                      }}
                      maxLength={COURSE_FIELD_LIMITS.weekQuestion}
                      disabled={off}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={removeQuestionLabel(index + 1)}
                  title={removeQuestionLabel(index + 1)}
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                  disabled={off}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={off || full}>
          {QUESTIONS_EDITOR_WORDS.add}
        </Button>
        <span className={styles.spacer} />
        <span className={styles.count}>{questionsCount(rows.length)}</span>
        <Button type="button" onClick={() => void save()} disabled={off || !dirty}>
          {QUESTIONS_EDITOR_WORDS.save}
        </Button>
      </div>
    </Card>
  );
}
