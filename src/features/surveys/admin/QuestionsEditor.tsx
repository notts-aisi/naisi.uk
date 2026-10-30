"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import Switch from "@/components/ui/Switch";
import { useHydrated } from "@/hooks/useHydrated";
import {
  isQuestionRequired,
  newSurveyId,
  type SurveyChoiceQuestion,
  type SurveyConsentItem,
  type SurveyItem,
  type SurveyQuestion,
} from "@/lib/surveys/items";
import { REQUIRED_WORDS, questionTypeWords } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * A survey's words and questions, until it is sent (sv-edit), as small as is
 * honest: the title and intro people see, about how many minutes it takes,
 * the day it closes, and each question's words, the line under it, its
 * options, lines and the words on its scale, and their order. Questions are
 * not added, taken out or changed in kind here: they are the programme's
 * questionnaire, asked again at the end and afterwards, so answers compare.
 * An answer that counts as a number (a stage, a share of working time) is
 * reworded, never added or taken out.
 *
 * Each question has a Required switch (Zach, 30 Oct 2026), on unless the
 * question is marked optional (`isQuestionRequired`: its own `optional`, or
 * for a survey made before the switch, the template's list of questions that
 * do not apply to everybody). Turning it writes `optional` on the question,
 * true or false, so what the admin chose is kept whatever the list says. A
 * consent block has no switch: a consent box is never required.
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

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

/** The words of one question, by kind. */
function QuestionWords({ question, number, onChange }: { question: SurveyQuestion; number: number; onChange: (next: SurveyQuestion) => void }) {
  const change = (patch: Partial<SurveyQuestion>) => onChange({ ...question, ...patch } as SurveyQuestion);
  if (question.type === "lines") {
    const points = question.scale.points;
    return (
      <div className={styles.editRows}>
        {question.lines.map((line, lineAt) => (
          <div key={line.id} className={styles.editRow}>
            <Input
              aria-label={`Question ${number}, line ${lineAt + 1}`}
              value={line.label}
              maxLength={120}
              onChange={(event) => change({ lines: question.lines.map((each) => (each.id === line.id ? { ...each, label: event.target.value } : each)) })}
            />
            <button
              type="button"
              className={styles.textButton}
              disabled={question.lines.length <= 1}
              onClick={() => change({ lines: question.lines.filter((each) => each.id !== line.id) })}
            >
              Take out
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.textButton}
          disabled={question.lines.length >= 10}
          onClick={() => change({ lines: [...question.lines, { id: newSurveyId("l"), label: "" }] })}
        >
          Add a line
        </button>
        {points ? (
          points.map((words, at) => (
            <Input
              key={at}
              aria-label={`Question ${number}, the words at ${at + 1}`}
              value={words}
              maxLength={40}
              onChange={(event) => change({ scale: { ...question.scale, points: points.map((each, i) => (i === at ? event.target.value : each)) } })}
            />
          ))
        ) : (
          <div className={styles.fieldRow}>
            <Input
              aria-label={`Question ${number}, the words at 1`}
              value={question.scale.minLabel}
              maxLength={40}
              onChange={(event) => change({ scale: { ...question.scale, minLabel: event.target.value } })}
            />
            <Input
              aria-label={`Question ${number}, the words at ${question.scale.max}`}
              value={question.scale.maxLabel}
              maxLength={40}
              onChange={(event) => change({ scale: { ...question.scale, maxLabel: event.target.value } })}
            />
          </div>
        )}
      </div>
    );
  }
  if (question.type === "scale") {
    return (
      <div className={styles.editRows}>
        {question.anchors.map((anchor, at) => (
          <div key={anchor.at} className={styles.editRow}>
            <span className={styles.qPage}>{anchor.at}</span>
            <Input
              aria-label={`Question ${number}, the words at ${anchor.at}`}
              value={anchor.label}
              maxLength={80}
              onChange={(event) => change({ anchors: question.anchors.map((each, i) => (i === at ? { ...each, label: event.target.value } : each)) })}
            />
          </div>
        ))}
      </div>
    );
  }
  if (question.type === "percent") {
    return (
      <div className={styles.fieldRow}>
        <Input
          aria-label={`Question ${number}, the words at 0%`}
          value={question.ends.min}
          maxLength={80}
          onChange={(event) => change({ ends: { ...question.ends, min: event.target.value } })}
        />
        <Input
          aria-label={`Question ${number}, the words at 100%`}
          value={question.ends.max}
          maxLength={80}
          onChange={(event) => change({ ends: { ...question.ends, max: event.target.value } })}
        />
      </div>
    );
  }
  if (question.type === "singleChoice" || question.type === "multipleChoice") {
    const choice = question as SurveyChoiceQuestion;
    const options = choice.options ?? [];
    // An answer that stands for a number keeps its place in the scoring.
    const fixed = choice.scores !== undefined;
    return (
      <div className={styles.editRows}>
        {options.map((option, optionAt) => (
          <div key={option.id} className={styles.editRow}>
            <Input
              aria-label={`Question ${number}, answer ${optionAt + 1}`}
              value={option.label}
              maxLength={120}
              onChange={(event) => change({ options: options.map((each) => (each.id === option.id ? { ...each, label: event.target.value } : each)) })}
            />
            {!fixed && (
              <button
                type="button"
                className={styles.textButton}
                disabled={options.length <= 2}
                onClick={() => change({ options: options.filter((each) => each.id !== option.id) })}
              >
                Take out
              </button>
            )}
          </div>
        ))}
        {!fixed && (
          <button
            type="button"
            className={styles.textButton}
            disabled={options.length >= 20}
            onClick={() => change({ options: [...options, { id: newSurveyId("o"), label: "" }] })}
          >
            Add an answer
          </button>
        )}
        {choice.most !== undefined && (
          <Input
            aria-label={`Question ${number}, its second part`}
            value={choice.most}
            maxLength={200}
            onChange={(event) => change({ most: event.target.value } as Partial<SurveyQuestion>)}
          />
        )}
      </div>
    );
  }
  return null;
}

function ConsentWords({ item, onChange }: { item: SurveyConsentItem; onChange: (next: SurveyConsentItem) => void }) {
  return (
    <div className={styles.qSection}>
      <div className={styles.qSectionHead}>
        <span className={styles.qMeasure}>Consent</span>
      </div>
      <Textarea aria-label="Consent statement" value={item.statement} rows={2} maxLength={400} onChange={(event) => onChange({ ...item, statement: event.target.value })} />
      {item.boxes.map((box, at) => (
        <Input
          key={box.purpose}
          aria-label={`Consent box ${at + 1}`}
          value={box.label}
          maxLength={200}
          onChange={(event) => onChange({ ...item, boxes: item.boxes.map((each, i) => (i === at ? { ...each, label: event.target.value } : each)) })}
        />
      ))}
      <p className={styles.muted}>Each box starts unticked. Only what people tick is kept.</p>
      <p className={styles.muted}>{REQUIRED_WORDS.consent}</p>
    </div>
  );
}

export default function QuestionsEditor({
  surveyId,
  initial,
  measures,
  today,
  closes = true,
  lockNote = "The questions lock once this is sent, so every stage of the programme asks the same.",
}: {
  surveyId: string;
  initial: EditorValues;
  /** A section's id to the measure it asks about, for the templates' sections. */
  measures: Record<string, string>;
  today: string;
  /**
   * Whether the survey has a closing day and an email of its own. A leaving
   * survey has neither: it takes answers until an admin closes it, and it
   * reaches people through the leaving email, whose words are not these.
   */
  closes?: boolean;
  /** When the questions lock, in words: a survey after an event locks when it opens. */
  lockNote?: string;
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
            {closes
              ? "A blank line starts a new paragraph. It opens the email too. The privacy box under it can’t be edited."
              : "A blank line starts a new paragraph. The privacy box under it can’t be edited."}
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
          {closes ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${id}-closes`}>
                It closes on
              </label>
              <Input id={`${id}-closes`} type="date" min={today} value={values.closesOn} onChange={(event) => set({ closesOn: event.target.value })} />
            </div>
          ) : (
            <p className={styles.muted}>No closing day: once it’s open, it takes answers until you close it.</p>
          )}
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
          if (item.kind === "consent") {
            return <ConsentWords key={item.id} item={item} onChange={(next) => setItem(index, next)} />;
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
                <Input
                  aria-label={`Question ${number}, the line under it`}
                  placeholder="A line under it (optional)"
                  value={question.hint ?? ""}
                  maxLength={300}
                  onChange={(event) => {
                    const hint = event.target.value;
                    const { hint: _old, ...rest } = question;
                    void _old;
                    setItem(index, (hint ? { ...rest, hint } : rest) as SurveyQuestion);
                  }}
                />
                <span className={styles.qType}>{questionTypeWords(question)}</span>
                {question.pipe && <span className={styles.muted}>Shows each person what they said to it at an earlier stage.</span>}
                <QuestionWords question={question} number={number} onChange={(next) => setItem(index, next)} />
                <Switch
                  id={`${id}-required-${question.id}`}
                  checked={isQuestionRequired(question)}
                  onChange={(on) => setItem(index, { ...question, optional: !on } as SurveyQuestion)}
                  label={REQUIRED_WORDS.label}
                  description={isQuestionRequired(question) ? REQUIRED_WORDS.on : REQUIRED_WORDS.off}
                />
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
        <p className={styles.lockNote}>{lockNote}</p>
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
