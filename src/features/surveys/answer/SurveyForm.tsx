"use client";

import { useRef, useState, type FormEvent } from "react";
import OptionRow from "@/components/ui/OptionRow";
import Select from "@/components/ui/Select";
import { Input, Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { KAIROS_FORM_WORDS } from "@/lib/kairos/words";
import type { AnswerConsent, AnswerKairos, AnswerPage, AnswerQuestion, AnswerSubmit } from "@/lib/surveys/answerView";
import { ANSWER_WORDS, pageWords, pickUpToWords } from "@/lib/surveys/words";
import styles from "./SurveyForm.module.css";
// The card at the end of the survey at a programme's end, to its anonymous form.
import { AnonymousFormCard } from "@/features/anonymousFeedback/AfterTheSurvey";

/**
 * The survey's questions, a page at a time, and "Send my answers"
 * (sv-before-phone).
 *
 * Phone first. Every box is a real form control, left to the browser
 * (uncontrolled), so nothing typed before the page's script arrives is lost,
 * and the answers are read from the form when it is sent. Until the script
 * has arrived every page is shown at once and the Send button is disabled
 * (`useHydrated`); from then on one page shows at a time, with Back and Next.
 * What the script adds is help, never the only way: a slider beside a typed
 * percentage, boxes past a limit greyed out, and "which mattered most" showing
 * only the ones ticked. Without it the typed box, the server's check and every
 * option still work.
 *
 * Nothing is sent or kept before "Send my answers": no draft, no record of a
 * page being opened. Every question can be skipped; a consent box starts
 * unticked, and so does "You can quote this, without my name" under a long
 * answer, whose tick is sent with the words it is under.
 *
 * THE KAIROS CHOICE ends the last page of every programme survey: what goes
 * to Kairos, why sharing helps, and "Don't share my details with Kairos",
 * ticked before the person touches it only when their own record already says
 * no. It is sent only when the person changes it here, so a form left open
 * cannot put back a choice they changed elsewhere since it was drawn.
 */

type Props = {
  pages: AnswerPage[];
  closing: string;
  submit: AnswerSubmit;
  /** Sentence shown in place of Send on a test link. */
  testWords: string;
  /** The Kairos choice the last page ends with, or null for a survey that does not ask it. */
  kairos: AnswerKairos | null;
};

/** The field name a line of a scale question is answered under. */
const lineField = (questionId: string, lineId: string) => `${questionId}.${lineId}`;
/** The field name of a pick-any question's "which mattered most". */
const mostField = (questionId: string) => `${questionId}.most`;
/** The field name of a consent box. */
const consentField = (purpose: string) => `consent.${purpose}`;
/** The field name of the box under a long answer: "You can quote this, without my name". */
const quoteField = (questionId: string) => `${questionId}.quote`;
/** The Kairos box, ticked to say no, and where it started. */
const KAIROS_NO = "kairos.no";
const KAIROS_WAS = "kairos.was";

/**
 * The Kairos choice in the form, as the route reads it: `true` (shared) or
 * `false` (not shared) when the person changed the box from where it
 * started, and undefined when they left it as it was.
 */
export function kairosIn(data: FormData): boolean | undefined {
  const was = data.get(KAIROS_WAS);
  if (was !== "shared" && was !== "no") return undefined;
  const now = data.get(KAIROS_NO) === "yes" ? "no" : "shared";
  return now === was ? undefined : now === "shared";
}

/** A whole number typed in a box, or null when the box is empty or not a number. */
function typedNumber(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

/** The answers in the form, in the shapes the route reads. A question left blank sends nothing. */
export function answersIn(
  form: HTMLFormElement,
  pages: readonly AnswerPage[],
): { answers: Record<string, unknown>; consents: Record<string, boolean> | null; kairos: boolean | undefined } {
  const data = new FormData(form);
  const out: Record<string, unknown> = {};
  const one = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  let consents: Record<string, boolean> | null = null;
  for (const page of pages) {
    for (const question of page.questions) {
      switch (question.kind) {
        case "choice": {
          if (question.multiple) {
            const picked = data.getAll(question.id).filter((value): value is string => typeof value === "string");
            if (picked.length > 0) {
              const most = question.most ? one(mostField(question.id)) : null;
              out[question.id] = most && picked.includes(most) ? { type: "choices", optionIds: picked, most } : { type: "choices", optionIds: picked };
            }
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
        case "scale": {
          const picked = one(question.id);
          if (picked) out[question.id] = { type: "scale", value: Number(picked) };
          break;
        }
        case "percent":
        case "number": {
          const value = typedNumber(one(question.id));
          if (value !== null) out[question.id] = { type: question.kind, value };
          break;
        }
        case "text": {
          const text = one(question.id)?.trim() ?? "";
          // The tick goes with the words it is under, and only where the box was drawn.
          const quote = question.quote && data.get(quoteField(question.id)) === "yes";
          if (text) out[question.id] = quote ? { type: "text", text, quote: true } : { type: "text", text };
          break;
        }
      }
    }
    for (const consent of page.consents) {
      consents = consents ?? {};
      for (const box of consent.boxes) consents[box.purpose] = data.get(consentField(box.purpose)) === "yes";
    }
  }
  return { answers: out, consents, kairos: kairosIn(data) };
}

/** One point's words, as a screen reader says it: "4 out of 7: The gist, to a friend". */
function pointWords(point: number, max: number, words: string): string {
  return words ? `${point} out of ${max}: ${words}` : `${point} out of ${max}`;
}

function Points({
  name,
  legend,
  min,
  max,
  words,
}: {
  name: string;
  legend: string;
  min: number;
  max: number;
  /** Each point's words, by its number; a point with none says only its number. */
  words: Map<number, string>;
}) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <fieldset className={styles.scale}>
      {legend ? <legend className={styles.lineLabel}>{legend}</legend> : <legend className={styles.srOnly}>{`${min} to ${max}`}</legend>}
      <div className={styles.points} style={{ ["--points" as string]: points.length }} data-many={points.length > 7 ? "" : undefined}>
        {points.map((point) => (
          <label key={point} className={styles.point}>
            <input type="radio" name={name} value={point} className={styles.pointInput} aria-label={pointWords(point, max, words.get(point) ?? "")} />
            <span className={styles.pointFace} aria-hidden="true">
              {point}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The words at a scale's ends, under it. */
function Ends({ min, max }: { min: string; max: string }) {
  if (!min && !max) return null;
  return (
    <div className={styles.ends} aria-hidden="true">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  );
}

/** A scale's words at chosen points, listed under it so they read at any width. */
function Anchors({ anchors }: { anchors: { at: number; label: string }[] }) {
  if (anchors.length === 0) return null;
  return (
    <ul className={styles.anchors} aria-hidden="true">
      {anchors.map((anchor) => (
        <li key={anchor.at}>
          <span className={styles.anchorAt}>{anchor.at}</span>
          <span>{anchor.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Choice({ question, hydrated }: { question: Extract<AnswerQuestion, { kind: "choice" }>; hydrated: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const titleId = `q-${question.id}`;
  if (question.look === "menu") {
    return (
      <>
        <Select name={question.id} defaultValue={question.offered} aria-labelledby={titleId} className={styles.menu}>
          <option value="">{ANSWER_WORDS.chooseOne}</option>
          {question.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        {question.offered && <p className={styles.hint}>{ANSWER_WORDS.fromProfile}</p>}
      </>
    );
  }
  const atLimit = question.maxPicks > 0 && picked.length >= question.maxPicks;
  const onChange = (event: FormEvent<HTMLDivElement>) => {
    const box = event.target as HTMLInputElement;
    if (!question.multiple || box.name !== question.id) return;
    setPicked((current) => (box.checked ? [...current.filter((id) => id !== box.value), box.value] : current.filter((id) => id !== box.value)));
  };
  // Before the script, every option is offered for "which mattered most";
  // after it, only the ones ticked.
  const mostOptions = hydrated ? question.options.filter((option) => picked.includes(option.id)) : question.options;
  return (
    <>
      {question.multiple && <p className={styles.hint}>{question.maxPicks > 0 ? pickUpToWords(question.maxPicks) : ANSWER_WORDS.tickMany}</p>}
      <div className={styles.options} onChange={onChange}>
        {question.options.map((option) => (
          <OptionRow
            key={option.id}
            type={question.multiple ? "checkbox" : "radio"}
            name={question.id}
            value={option.id}
            disabled={hydrated && question.multiple && atLimit && !picked.includes(option.id)}
          >
            {option.point ? (
              <span className={styles.pointRow}>
                <span className={styles.pointNumber}>{option.point}</span>
                <span>{option.label}</span>
              </span>
            ) : (
              option.label
            )}
          </OptionRow>
        ))}
      </div>
      {question.multiple && question.most && (
        <fieldset className={styles.most}>
          <legend className={styles.mostLegend}>{question.most}</legend>
          {hydrated && mostOptions.length === 0 ? (
            <p className={styles.hint}>{ANSWER_WORDS.mostFirst}</p>
          ) : (
            <div className={styles.options}>
              {mostOptions.map((option) => (
                <OptionRow key={option.id} type="radio" name={mostField(question.id)} value={option.id}>
                  {option.label}
                </OptionRow>
              ))}
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}

function Percent({ question, hydrated }: { question: Extract<AnswerQuestion, { kind: "percent" }>; hydrated: boolean }) {
  const typed = useRef<HTMLInputElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const [set, setSet] = useState(false);
  const titleId = `q-${question.id}`;
  return (
    <div className={styles.percent}>
      <div className={styles.percentRow}>
        <input
          ref={slider}
          type="range"
          min={0}
          max={100}
          step={1}
          defaultValue={50}
          className={styles.slider}
          data-unset={set ? undefined : ""}
          disabled={!hydrated}
          // The typed box beside it is the answer and takes the keyboard; the
          // slider is a second way in for a finger or a mouse.
          aria-hidden="true"
          tabIndex={-1}
          onInput={(event) => {
            if (typed.current) typed.current.value = (event.target as HTMLInputElement).value;
            setSet(true);
          }}
        />
        <span className={styles.percentBox}>
          <input
            ref={typed}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            name={question.id}
            aria-labelledby={titleId}
            aria-describedby={question.minLabel || question.maxLabel ? `${titleId}-ends` : undefined}
            className={styles.percentInput}
            onInput={(event) => {
              const value = typedNumber((event.target as HTMLInputElement).value);
              if (slider.current && value !== null) slider.current.value = String(Math.min(100, Math.max(0, value)));
              setSet(value !== null);
            }}
          />
          <span className={styles.percentSign} aria-hidden="true">
            %
          </span>
        </span>
      </div>
      {(question.minLabel || question.maxLabel) && (
        <p id={`${titleId}-ends`} className={styles.endsLine}>
          {[question.minLabel ? `0%: ${question.minLabel}` : "", question.maxLabel ? `100%: ${question.maxLabel}` : ""].filter(Boolean).join(". ")}
          {"."}
        </p>
      )}
    </div>
  );
}

function Question({ question, hydrated }: { question: AnswerQuestion; hydrated: boolean }) {
  const titleId = `q-${question.id}`;
  return (
    <div className={styles.question} role="group" aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        <span className={styles.number}>{question.number}</span>
        <span>{question.title}</span>
      </h3>
      {question.hint && <p className={styles.hint}>{question.hint}</p>}
      {question.piped && <p className={styles.piped}>{question.piped}</p>}
      {question.kind === "choice" && <Choice question={question} hydrated={hydrated} />}
      {question.kind === "lines" && (
        <div className={styles.lines}>
          {question.lines.map((line) => (
            <div key={line.id}>
              <Points
                name={lineField(question.id, line.id)}
                legend={line.label}
                min={1}
                max={question.max}
                words={new Map(
                  question.points.length > 0
                    ? question.points.map((words, index) => [index + 1, words] as const)
                    : [
                        [1, question.minLabel] as const,
                        [question.max, question.maxLabel] as const,
                      ],
                )}
              />
              <Ends min={question.minLabel} max={question.maxLabel} />
            </div>
          ))}
        </div>
      )}
      {question.kind === "rating" && (
        <>
          <Points
            name={question.id}
            legend=""
            min={1}
            max={question.max}
            words={new Map([
              [1, question.minLabel] as const,
              [question.max, question.maxLabel] as const,
            ])}
          />
          <Ends min={question.minLabel} max={question.maxLabel} />
        </>
      )}
      {question.kind === "scale" && (
        <>
          <Points
            name={question.id}
            legend=""
            min={question.min}
            max={question.max}
            words={new Map(question.anchors.map((anchor) => [anchor.at, anchor.label] as const))}
          />
          <Anchors anchors={question.anchors} />
        </>
      )}
      {question.kind === "percent" && <Percent question={question} hydrated={hydrated} />}
      {question.kind === "number" && (
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={question.max}
          step={1}
          name={question.id}
          aria-labelledby={titleId}
          className={styles.numberInput}
        />
      )}
      {question.kind === "text" &&
        (question.long ? (
          <>
            <Textarea name={question.id} rows={5} maxLength={question.maxLength} aria-labelledby={titleId} />
            {question.quote && (
              <div className={styles.quote}>
                <OptionRow plain type="checkbox" name={quoteField(question.id)} value="yes" description={ANSWER_WORDS.quoteLine}>
                  {ANSWER_WORDS.quote}
                </OptionRow>
              </div>
            )}
          </>
        ) : (
          <Input name={question.id} maxLength={question.maxLength} aria-labelledby={titleId} />
        ))}
    </div>
  );
}

/** A consent block: its statement as text, then each box, unticked until ticked. */
function Consent({ consent }: { consent: AnswerConsent }) {
  return (
    <fieldset className={styles.consent}>
      <legend className={styles.consentLegend}>{ANSWER_WORDS.consent}</legend>
      <p className={styles.consentStatement}>{consent.statement}</p>
      <div className={styles.options}>
        {consent.boxes.map((box) => (
          <OptionRow key={box.purpose} type="checkbox" name={consentField(box.purpose)} value="yes">
            {box.label}
          </OptionRow>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The Kairos choice: what is shared and why, then the one box that says no.
 * The hidden field carries where the box started, so only a change the
 * person made here is sent.
 */
function KairosChoice({ kairos }: { kairos: AnswerKairos }) {
  return (
    <fieldset className={styles.consent}>
      <legend className={styles.consentLegend}>{KAIROS_FORM_WORDS.heading}</legend>
      <p className={styles.consentStatement}>{KAIROS_FORM_WORDS.what}</p>
      <p className={styles.consentStatement}>{KAIROS_FORM_WORDS.why}</p>
      <input type="hidden" name={KAIROS_WAS} value={kairos.said} />
      <div className={styles.options}>
        <OptionRow type="checkbox" name={KAIROS_NO} value="yes" defaultChecked={kairos.said === "no"}>
          {KAIROS_FORM_WORDS.box}
        </OptionRow>
      </div>
      <p className={styles.kairosAfter}>{KAIROS_FORM_WORDS.after}</p>
    </fieldset>
  );
}

export default function SurveyForm({ pages, closing, submit, testWords, kairos }: Props) {
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
    const { answers, consents, kairos: shared } = answersIn(formRef.current, pages);
    const extra = { ...(consents ? { consents } : {}), ...(shared === undefined ? {} : { kairos: shared }) };
    const request =
      submit.kind === "link"
        ? { url: "/api/surveys/answer", body: { token: submit.token, answers, ...extra } }
        : { url: `/api/surveys/${encodeURIComponent(submit.surveyId)}/answer`, body: { answers, ...extra } };
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
        <AnonymousFormCard />
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
            <Question key={question.id} question={question} hydrated={hydrated} />
          ))}
          {each.consents.map((consent) => (
            <Consent key={consent.id} consent={consent} />
          ))}
          {index === last && kairos && <KairosChoice kairos={kairos} />}
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
