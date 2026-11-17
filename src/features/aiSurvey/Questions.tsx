"use client";

import { Fragment } from "react";
import type { AiSurveyDefinition, AiSurveyOption, AiSurveyScaleAnswer } from "@/lib/aiSurvey/types";
import { own } from "@/lib/applications/keys";
import type { PublicPage, PublicQuestion } from "./publicSurvey";
import styles from "./survey.module.css";

/**
 * The questions of one page of the AI at Nottingham survey.
 *
 * Every control is the real one: a radio button, a tick box, the phone's own
 * drop-down, a text box. Each sits inside a fieldset whose legend is its
 * question, or its line, so a screen reader says the answer with what it
 * answers, and everything works from a keyboard.
 *
 * Nothing here is required. A question left alone is simply not in the page's
 * answers.
 *
 * NO FIELDSET IS A FLEX ITEM. The page's column is a flex column, and Safari
 * on iOS 26 gives a fieldset that sits directly in one the height of its
 * legend twice, which showed as a tall empty band under the last line of a
 * page. So each fieldset sits in a plain block of its own (`styles.block`),
 * and the lines of a lines question are blocks spaced by margins.
 */

export type PageAnswers = Record<string, string | string[] | boolean>;

type Change = (code: string, value: string | string[] | boolean | undefined) => void;

/** Question text, with a word marked `**like this**` drawn as emphasis. */
function Marked({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}</>;
}

function Title({ code, text }: { code?: string; text: string }) {
  return (
    <h3 className={styles.title}>
      {code && <span className={styles.codeMark}>{code}</span>}
      <span>
        <Marked text={text} />
      </span>
    </h3>
  );
}

function Tick() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
      <path d="M2 6.2 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RadioRows({
  name,
  options,
  value,
  onPick,
}: {
  name: string;
  options: { id: string; label: string }[];
  value: string | undefined;
  onPick: (id: string) => void;
}) {
  return (
    <div className={styles.options}>
      {options.map((option) => {
        const on = value === option.id;
        return (
          <label key={option.id} className={styles.option} data-on={on || undefined}>
            <input type="radio" name={name} value={option.id} checked={on} onChange={() => onPick(option.id)} />
            <span aria-hidden="true" className={styles.radio} />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function Multi({
  question,
  value,
  onChange,
}: {
  question: { id: string; text: string; options: AiSurveyOption[] };
  value: string[];
  onChange: Change;
}) {
  const toggle = (option: AiSurveyOption) => {
    let next: string[];
    if (value.includes(option.id)) {
      next = value.filter((id) => id !== option.id);
    } else if (option.exclusive) {
      // "None of these" clears the rest.
      next = [option.id];
    } else {
      const exclusive = question.options.filter((o) => o.exclusive).map((o) => o.id);
      next = [...value.filter((id) => !exclusive.includes(id)), option.id];
    }
    onChange(question.id, next.length > 0 ? next : undefined);
  };
  return (
    <div className={styles.block}>
      <fieldset className={styles.question}>
        <legend className={styles.legend}>
          <Title code={question.id} text={question.text} />
        </legend>
        <div className={styles.options}>
          {question.options.map((option) => {
            const on = value.includes(option.id);
            return (
              <Fragment key={option.id}>
                {option.exclusive && <div aria-hidden="true" className={styles.rule} />}
                <label className={styles.option} data-on={on || undefined}>
                  <input type="checkbox" name={question.id} value={option.id} checked={on} onChange={() => toggle(option)} />
                  <span aria-hidden="true" className={styles.check}>
                    <Tick />
                  </span>
                  <span>{option.label}</span>
                </label>
              </Fragment>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * "Rank your top three". Each line is a tick box: ticking one gives it the
 * next place, and unticking one closes the gap behind it, so the places are
 * always 1, 2, 3 with none missing. The value is the lines IN ORDER.
 */
function Rank({
  question,
  lines,
  value,
  onChange,
  words,
}: {
  question: { id: string; text: string; places: number; extra: AiSurveyOption[] };
  lines: { id: string; text: string }[];
  value: string[];
  onChange: Change;
  words: AiSurveyDefinition["ui"]["rank"];
}) {
  const alone = question.extra.map((option) => option.id);
  const ranked = value.filter((id) => !alone.includes(id));
  const full = ranked.length >= question.places;
  const toggle = (id: string) => {
    if (ranked.includes(id)) {
      const next = ranked.filter((other) => other !== id);
      onChange(question.id, next.length > 0 ? next : undefined);
    } else if (!full) {
      onChange(question.id, [...ranked, id]);
    }
  };
  return (
    <div className={styles.block}>
      <fieldset className={styles.question}>
        <legend className={styles.legend}>
          <Title text={question.text} />
        </legend>
        {/* One line that says how, and changes to say why nothing more can be chosen. */}
        <p id={`${question.id}-hint`} aria-live="polite" className={styles.small}>
          {full ? words.full : words.hint}
        </p>
        <div className={styles.options}>
          {lines.map((line) => {
            const place = ranked.indexOf(line.id);
            const on = place !== -1;
            return (
              <label key={line.id} className={styles.option} data-on={on || undefined} data-full={(full && !on) || undefined}>
                <input
                  type="checkbox"
                  name={question.id}
                  value={line.id}
                  checked={on}
                  aria-describedby={`${question.id}-hint`}
                  // Not `disabled`: a disabled box cannot be reached to hear why.
                  aria-disabled={(full && !on) || undefined}
                  onChange={() => toggle(line.id)}
                />
                <span aria-hidden="true" className={styles.place}>
                  {on ? place + 1 : ""}
                </span>
                <span>
                  {line.text}
                  {on && <span className="visually-hidden">. {words.chosen.replace("{place}", words.places[place] ?? String(place + 1))}</span>}
                </span>
              </label>
            );
          })}
          {question.extra.map((option) => {
            const on = value.length === 1 && value[0] === option.id;
            return (
              <Fragment key={option.id}>
                <div aria-hidden="true" className={styles.rule} />
                <label className={styles.option} data-on={on || undefined}>
                  <input
                    type="checkbox"
                    name={question.id}
                    value={option.id}
                    checked={on}
                    // An answer for the whole question: it replaces any ranking.
                    onChange={() => onChange(question.id, on ? undefined : [option.id])}
                  />
                  <span aria-hidden="true" className={styles.check}>
                    <Tick />
                  </span>
                  <span>{option.label}</span>
                </label>
              </Fragment>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function Lines({
  question,
  scale,
  order,
  answers,
  onChange,
}: {
  question: Extract<PublicQuestion, { type: "lines" }>;
  scale: AiSurveyScaleAnswer[];
  order: string[];
  answers: PageAnswers;
  onChange: Change;
}) {
  const byId = new Map(question.lines.map((line) => [line.id, line]));
  const lines = order.map((id) => byId.get(id)).filter((line): line is { id: string; text: string } => Boolean(line));
  return (
    <div className={styles.section}>
      {question.text && <Title code={question.id} text={question.text} />}
      <div className={styles.lines}>
        {lines.map((line) => (
          <fieldset key={line.id} className={styles.line}>
            <legend className={styles.lineText}>{line.text}</legend>
            <div className={styles.scale}>
              {scale.map((answer) => {
                const on = own(answers, line.id) === answer.id;
                return (
                  <label
                    key={answer.id}
                    className={styles.point}
                    data-on={on || undefined}
                    data-outside={answer.outsideScale || undefined}
                  >
                    <input
                      type="radio"
                      name={line.id}
                      value={answer.id}
                      checked={on}
                      onChange={() => onChange(line.id, answer.id)}
                    />
                    {answer.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

export function PageOfQuestions({
  page,
  scales,
  lineOrders,
  answers,
  onChange,
  charactersLeft,
  selectPlaceholder,
  rankWords,
}: {
  page: PublicPage;
  scales: Record<string, AiSurveyScaleAnswer[]>;
  /** The order each lines question's lines are shown in, for this person, this sitting. */
  lineOrders: Record<string, string[]>;
  answers: PageAnswers;
  onChange: Change;
  /** "{n} characters left". */
  charactersLeft: string;
  selectPlaceholder: string;
  rankWords: AiSurveyDefinition["ui"]["rank"];
}) {
  const textOf = (code: string): string | undefined => {
    const value = own(answers, code);
    return typeof value === "string" ? value : undefined;
  };
  const listOf = (code: string): string[] => {
    const value = own(answers, code);
    return Array.isArray(value) ? value : [];
  };
  // A box shown only for one answer of another question is emptied when that
  // answer changes, so nothing typed into it is sent once it is out of sight.
  const pick = (code: string, id: string) => {
    onChange(code, id);
    for (const other of page.questions) {
      if (other.type === "text" && other.showIf?.code === code && other.showIf.is !== id) onChange(other.id, undefined);
    }
  };
  return (
    <>
      {page.questions.map((question) => {
        switch (question.type) {
          case "single":
            return (
              <div key={question.id} className={styles.block}>
                <fieldset className={styles.question}>
                  <legend className={styles.legend}>
                    <Title code={question.id} text={question.text} />
                  </legend>
                  <RadioRows
                    name={question.id}
                    options={question.options}
                    value={textOf(question.id)}
                    onPick={(id) => pick(question.id, id)}
                  />
                </fieldset>
              </div>
            );
          case "multi":
            return (
              <Multi
                key={question.id}
                question={question}
                value={listOf(question.id)}
                onChange={onChange}
              />
            );
          case "select": {
            const value = textOf(question.id) ?? "";
            return (
              <div key={question.id} className={styles.stackWide}>
                <label htmlFor={question.id}>
                  <Title code={question.id} text={question.text} />
                </label>
                {question.help && (
                  <p id={`${question.id}-help`} className={styles.small}>
                    {question.help}
                  </p>
                )}
                <div className={styles.selectWrap}>
                  <select
                    id={question.id}
                    className={styles.select}
                    data-empty={value === "" || undefined}
                    aria-describedby={question.help ? `${question.id}-help` : undefined}
                    value={value}
                    onChange={(event) => onChange(question.id, event.target.value || undefined)}
                  >
                    <option value="">{selectPlaceholder}</option>
                    {question.groups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {question.extra.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className={styles.chevron}>
                    <path
                      d="M4 6l4 4 4-4"
                      fill="none"
                      stroke="var(--color-text-muted)"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            );
          }
          case "lines":
            return (
              <Lines
                key={question.id}
                question={question}
                scale={scales[question.scale] ?? []}
                order={lineOrders[question.id] ?? question.lines.map((line) => line.id)}
                answers={answers}
                onChange={onChange}
              />
            );
          case "rank": {
            // This page's lines, IN THE ORDER JUST SHOWN, then "None of these".
            const source = page.questions.find((q) => q.id === question.linesFrom);
            const lines = source && source.type === "lines" ? source.lines : [];
            const byId = new Map(lines.map((line) => [line.id, line]));
            const shown = (lineOrders[question.linesFrom] ?? lines.map((line) => line.id))
              .map((id) => byId.get(id))
              .filter((line): line is { id: string; text: string } => Boolean(line));
            return (
              <Rank
                key={question.id}
                question={question}
                lines={shown}
                value={listOf(question.id)}
                onChange={onChange}
                words={rankWords}
              />
            );
          }
          case "text": {
            if (question.showIf && textOf(question.showIf.code) !== question.showIf.is) return null;
            const value = textOf(question.id) ?? "";
            return (
              <div key={question.id} className={styles.field}>
                <label htmlFor={question.id}>
                  <Title code={question.id} text={question.text} />
                </label>
                {question.help && (
                  <p id={`${question.id}-help`} className={styles.small}>
                    {question.help}
                  </p>
                )}
                <textarea
                  id={question.id}
                  className={styles.textarea}
                  rows={5}
                  maxLength={question.maxLength}
                  aria-describedby={question.help ? `${question.id}-help` : undefined}
                  value={value}
                  onChange={(event) => onChange(question.id, event.target.value || undefined)}
                />
                <p aria-live="polite" className={styles.counter}>
                  {charactersLeft.replace("{n}", String(Math.max(0, question.maxLength - value.length)))}
                </p>
              </div>
            );
          }
          case "tick":
            return (
              <label key={question.id} htmlFor={question.id} className={styles.tick}>
                <span className={styles.tickBox}>
                  <input
                    id={question.id}
                    type="checkbox"
                    checked={own(answers, question.id) === true}
                    onChange={(event) => onChange(question.id, event.target.checked ? true : undefined)}
                  />
                  <span aria-hidden="true" className={styles.tickFace}>
                    <Tick />
                  </span>
                </span>
                <span>{question.text}</span>
              </label>
            );
        }
      })}
    </>
  );
}
