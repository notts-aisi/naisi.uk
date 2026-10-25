"use client";

import { useRef, useState, type FormEvent } from "react";
import OptionRow from "@/components/ui/OptionRow";
import { Input, Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import type { AnswerPage, AnswerQuestion, AnswerSubmit } from "@/lib/surveys/answerView";
import { ANSWER_WORDS, pageWords } from "@/lib/surveys/words";
import styles from "./SurveyForm.module.css";

/**
 * The survey's questions, a page at a time, and "Send my answers"
 * (sv-before-phone).
 *
 * Phone first. Every box is a real form control, left to the browser
 * (uncontrolled), so nothing typed before the page's script arrives is lost,
 * and the answers are read from the form when it is sent. Until the script
 * has arrived every page is shown at once and the Send button is disabled
 * (`useHydrated`); from then on one page shows at a time, with Back and Next.
 *
 * Nothing is sent or kept before "Send my answers": no draft, no record of a
 * page being opened. Every question can be skipped.
 */

type Props = {
  pages: AnswerPage[];
  closing: string;
  submit: AnswerSubmit;
  /** Sentence shown in place of Send on a test link. */
  testWords: string;
};

/** The field name a line of a scale question is answered under. */
const lineField = (questionId: string, lineId: string) => `${questionId}.${lineId}`;

/** The answers in the form, in the shapes the route reads. A question left blank sends nothing. */
function answersIn(form: HTMLFormElement, pages: readonly AnswerPage[]): Record<string, unknown> {
  const data = new FormData(form);
  const out: Record<string, unknown> = {};
  const one = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  for (const page of pages) {
    for (const question of page.questions) {
      switch (question.kind) {
        case "choice": {
          if (question.multiple) {
            const picked = data.getAll(question.id).filter((value): value is string => typeof value === "string");
            if (picked.length > 0) out[question.id] = { type: "choices", optionIds: picked };
          } else {
            const picked = one(question.id);
            if (picked) out[question.id] = { type: "choice", optionId: picked };
          }
          break;
        }
        case "lines": {
          const values: Record<string, number> = {};
          for (const line of question.lines) {
            const picked = one(lineField(question.id, line.id));
            if (picked) values[line.id] = Number(picked);
          }
          if (Object.keys(values).length > 0) out[question.id] = { type: "lines", values };
          break;
        }
        case "rating": {
          const picked = one(question.id);
          if (picked) out[question.id] = { type: "rating", value: Number(picked) };
          break;
        }
        case "text": {
          const text = one(question.id)?.trim() ?? "";
          if (text) out[question.id] = { type: "text", text };
          break;
        }
      }
    }
  }
  return out;
}

function Scale({
  name,
  legend,
  max,
  minLabel,
  maxLabel,
}: {
  name: string;
  legend: string;
  max: number;
  minLabel: string;
  maxLabel: string;
}) {
  const points = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <fieldset className={styles.scale}>
      {legend ? <legend className={styles.lineLabel}>{legend}</legend> : <legend className={styles.srOnly}>{`1 to ${max}`}</legend>}
      <div className={styles.points}>
        {points.map((point) => {
          const words =
            point === 1 && minLabel
              ? `${point} out of ${max}: ${minLabel}`
              : point === max && maxLabel
                ? `${point} out of ${max}: ${maxLabel}`
                : `${point} out of ${max}`;
          return (
            <label key={point} className={styles.point}>
              <input type="radio" name={name} value={point} className={styles.pointInput} aria-label={words} />
              <span className={styles.pointFace} aria-hidden="true">
                {point}
              </span>
            </label>
          );
        })}
      </div>
      {(minLabel || maxLabel) && (
        <div className={styles.ends} aria-hidden="true">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </fieldset>
  );
}

function Question({ question }: { question: AnswerQuestion }) {
  const titleId = `q-${question.id}`;
  return (
    <div className={styles.question} role="group" aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        <span className={styles.number}>{question.number}</span>
        <span>{question.title}</span>
      </h3>
      {question.kind === "choice" && (
        <>
          {question.multiple && <p className={styles.hint}>{ANSWER_WORDS.tickMany}</p>}
          <div className={styles.options}>
            {question.options.map((option) => (
              <OptionRow key={option.id} type={question.multiple ? "checkbox" : "radio"} name={question.id} value={option.id}>
                {option.label}
              </OptionRow>
            ))}
          </div>
        </>
      )}
      {question.kind === "lines" && (
        <div className={styles.lines}>
          {question.lines.map((line) => (
            <Scale
              key={line.id}
              name={lineField(question.id, line.id)}
              legend={line.label}
              max={question.max}
              minLabel={question.minLabel}
              maxLabel={question.maxLabel}
            />
          ))}
        </div>
      )}
      {question.kind === "rating" && (
        <Scale name={question.id} legend="" max={question.max} minLabel={question.minLabel} maxLabel={question.maxLabel} />
      )}
      {question.kind === "text" &&
        (question.long ? (
          <Textarea name={question.id} rows={5} maxLength={question.maxLength} aria-labelledby={titleId} />
        ) : (
          <Input name={question.id} maxLength={question.maxLength} aria-labelledby={titleId} />
        ))}
    </div>
  );
}

export default function SurveyForm({ pages, closing, submit, testWords }: Props) {
  const hydrated = useHydrated();
  const [page, setPage] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);

  function go(to: number) {
    setPage(to);
    setError("");
    // The new page's heading takes focus, so a screen reader starts there and
    // the page scrolls back to its top.
    requestAnimationFrame(() => headings.current[to]?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "idle" || submit.kind === "test" || !formRef.current) return;
    setState("sending");
    setError("");
    const answers = answersIn(formRef.current, pages);
    const request =
      submit.kind === "link"
        ? { url: "/api/surveys/answer", body: { token: submit.token, answers } }
        : { url: `/api/surveys/${encodeURIComponent(submit.surveyId)}/answer`, body: { answers } };
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("idle");
        setError(result.error ?? ANSWER_WORDS.tryAgain);
        return;
      }
      setState("sent");
    } catch {
      setState("idle");
      setError(ANSWER_WORDS.tryAgain);
    }
  }

  if (state === "sent") {
    return (
      <div className={styles.sent} role="status">
        <p className={styles.sentLine}>{ANSWER_WORDS.thanks}</p>
      </div>
    );
  }

  const last = pages.length - 1;
  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
      {pages.map((each, index) => (
        <section
          key={index}
          className={styles.page}
          hidden={hydrated && index !== page}
          aria-labelledby={`page-${index}`}
        >
          <div className={styles.pageHead}>
            <span className={styles.pageOf}>{pageWords(index + 1, pages.length)}</span>
            <h2
              id={`page-${index}`}
              className={styles.section}
              tabIndex={-1}
              ref={(node) => {
                headings.current[index] = node;
              }}
            >
              {each.heading}
            </h2>
          </div>
          {each.questions.map((question) => (
            <Question key={question.id} question={question} />
          ))}
          {hydrated && index < last && (
            <div className={styles.nav}>
              {index > 0 && (
                <button type="button" className={styles.back} onClick={() => go(index - 1)}>
                  {ANSWER_WORDS.back}
                </button>
              )}
              <button type="button" className={styles.next} onClick={() => go(index + 1)}>
                {ANSWER_WORDS.next}
              </button>
            </div>
          )}
          {index === last && (
            <div className={styles.finish}>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.nav}>
                {hydrated && last > 0 && (
                  <button type="button" className={styles.back} onClick={() => go(index - 1)}>
                    {ANSWER_WORDS.back}
                  </button>
                )}
                {submit.kind === "test" ? (
                  <p className={styles.testLine}>{testWords}</p>
                ) : (
                  <button type="submit" className={styles.send} disabled={!hydrated || state === "sending"}>
                    {state === "sending" ? ANSWER_WORDS.sending : ANSWER_WORDS.send}
                  </button>
                )}
              </div>
              <p className={styles.closing}>{closing}</p>
            </div>
          )}
        </section>
      ))}
    </form>
  );
}
