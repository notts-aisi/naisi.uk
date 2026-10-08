"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import LinkedText from "@/features/applications/kit/LinkedText";
import { countWords } from "@/lib/applications/validate";
import { TickIcon } from "./icons";
import styles from "./form.module.css";

/**
 * The fields every step is built from.
 *
 * Each one is a real control with a real label: a text box has a `<label
 * for>`, a group of options is a `<fieldset>` with a `<legend>`, and the
 * options themselves are native radios and tick boxes that the label around
 * them draws. So the keyboard, a screen reader and a phone's autofill all
 * meet ordinary form controls.
 *
 * TEXT BOXES ARE UNCONTROLLED. They are given a `defaultValue` and report
 * each change, and React never writes into them again. That is what keeps
 * somebody's typing whole on a slow connection: a box React controlled would
 * be reset to its first value at the moment the page came alive. `useTyped`
 * is the other half: when a box mounts already holding something its first
 * value did not, it reports it.
 *
 * A HELP LINE IS ITS AUTHOR'S TEXT, WITH ITS LINKS. Every field draws the
 * line under its label through `HelpLine`, which hands it to `LinkedText`:
 * an address that begins `https://` and `[words](https://address)` are drawn
 * as links, and everything else as the text it is.
 */

function useTyped<T extends HTMLInputElement | HTMLTextAreaElement>(
  first: string,
  onChange: (value: string) => void,
) {
  const ref = useRef<T>(null);
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  });
  useEffect(() => {
    const box = ref.current;
    if (box && box.value !== first) report.current(box.value);
    // Once, when the box mounts: what it holds then is either its first value
    // or something typed before the page was listening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function Label({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={styles.label}>
      {children}
      {optional ? <span className={styles.optional}> (optional)</span> : null}
    </label>
  );
}

function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const kept = ids.filter(Boolean);
  return kept.length > 0 ? kept.join(" ") : undefined;
}

/** The line between a label and its control: what the author wrote, with any link in it. */
function HelpLine({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className={styles.help}>
      <LinkedText text={text} linkClassName={styles.inlineLink} />
    </p>
  );
}

export function TextField({
  label,
  first,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  autoComplete,
  optional,
  help,
  helpBelow,
  wordLimit = null,
  error,
  readOnly,
  adornment,
  inputMode,
}: {
  label: string;
  first: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email";
  maxLength?: number;
  autoComplete?: string;
  optional?: boolean;
  /** A line between the label and the box. */
  help?: string;
  /** A line under the box. */
  helpBelow?: ReactNode;
  /** When set, the box counts words against it, as a long answer does. */
  wordLimit?: number | null;
  error?: string | null;
  readOnly?: boolean;
  adornment?: ReactNode;
  inputMode?: "text" | "email" | "numeric";
}) {
  const id = useId();
  const ref = useTyped<HTMLInputElement>(first, onChange);
  const [words, setWords] = useState(() => countWords(first));
  const over = wordLimit !== null && words > wordLimit;
  const input = (
    <input
      ref={ref}
      id={id}
      type={type}
      className={styles.input}
      defaultValue={first}
      onChange={(event) => {
        const value = event.currentTarget.value;
        if (wordLimit !== null) setWords(countWords(value));
        onChange(value);
      }}
      placeholder={placeholder}
      maxLength={maxLength}
      autoComplete={autoComplete}
      inputMode={inputMode}
      readOnly={readOnly}
      aria-invalid={error || over ? true : undefined}
      aria-describedby={describedBy(
        help && `${id}-t`,
        Boolean(adornment) && `${id}-a`,
        wordLimit !== null && `${id}-c`,
        Boolean(helpBelow) && `${id}-h`,
        error && `${id}-e`,
      )}
    />
  );
  return (
    <div className={styles.field}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {help ? <HelpLine id={`${id}-t`} text={help} /> : null}
      {adornment ? (
        <div className={styles.adorned}>
          {input}
          <span id={`${id}-a`} className={styles.adornment}>
            {adornment}
          </span>
        </div>
      ) : (
        input
      )}
      {wordLimit !== null ? (
        <div id={`${id}-c`} className={styles.count} data-over={over ? "true" : "false"}>
          {words} / {wordLimit} words
        </div>
      ) : null}
      {helpBelow ? (
        <p id={`${id}-h`} className={styles.helpBelow}>
          {helpBelow}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-e`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** How tall a box starts, from how much it is asking for. */
function rowsFor(wordLimit: number | null): number {
  if (wordLimit === null) return 5;
  return Math.max(2, Math.min(8, Math.round(wordLimit / 40)));
}

/** A long answer, with its help line, its word count and its limit. */
export function LongText({
  label,
  first,
  onChange,
  help,
  optional,
  wordLimit,
  maxLength,
  rows,
  error,
}: {
  label: string;
  first: string;
  onChange: (value: string) => void;
  help?: string;
  optional?: boolean;
  wordLimit: number | null;
  maxLength: number;
  rows?: number;
  error?: string | null;
}) {
  const id = useId();
  const ref = useTyped<HTMLTextAreaElement>(first, onChange);
  const [words, setWords] = useState(() => countWords(first));
  const over = wordLimit !== null && words > wordLimit;
  return (
    <div className={styles.field}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {help ? <HelpLine id={`${id}-h`} text={help} /> : null}
      <textarea
        ref={ref}
        id={id}
        className={styles.textarea}
        rows={rows ?? rowsFor(wordLimit)}
        defaultValue={first}
        maxLength={maxLength}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setWords(countWords(value));
          onChange(value);
        }}
        aria-invalid={error || over ? true : undefined}
        aria-describedby={describedBy(help && `${id}-h`, `${id}-c`, error && `${id}-e`)}
      />
      <div id={`${id}-c`} className={styles.count} data-over={over ? "true" : "false"}>
        {wordLimit === null ? `${words} ${words === 1 ? "word" : "words"}` : `${words} / ${wordLimit} words`}
      </div>
      {error ? (
        <p id={`${id}-e`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A question that is a group of controls: its legend, its help line, what is wrong with the answer. */
export function Group({
  legend,
  help,
  optional,
  error,
  children,
}: {
  legend: string;
  help?: string;
  optional?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <fieldset className={styles.fieldSet} aria-describedby={describedBy(help && `${id}-h`, error && `${id}-e`)}>
      <legend className={styles.label}>
        {legend}
        {optional ? <span className={styles.optional}> (optional)</span> : null}
      </legend>
      {help ? <HelpLine id={`${id}-h`} text={help} /> : null}
      {children}
      {error ? (
        <p id={`${id}-e`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type ChoiceProps = {
  legend: string;
  help?: string;
  optional?: boolean;
  error?: string | null;
  options: readonly string[];
  value: string | null;
  onChange: (value: string) => void;
};

/** One of several, each on its own row. */
export function ChoiceRows({ legend, help, optional, error, options, value, onChange }: ChoiceProps) {
  const name = useId();
  return (
    <Group legend={legend} help={help} optional={optional} error={error}>
      <div className={styles.rows}>
        {options.map((option) => {
          const on = option === value;
          return (
            <label key={option} className={styles.row} data-on={on ? "true" : "false"}>
              <input
                type="radio"
                name={name}
                className={styles.native}
                checked={on}
                onChange={() => onChange(option)}
              />
              <span aria-hidden="true" className={styles.radio} data-on={on ? "true" : "false"} />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </Group>
  );
}

/** One of two short answers, side by side: Yes and No, Yes and Not yet. */
export function ChoicePair({ legend, help, optional, error, options, value, onChange }: ChoiceProps) {
  const name = useId();
  return (
    <Group legend={legend} help={help} optional={optional} error={error}>
      <div className={styles.two}>
        {options.map((option) => {
          const on = option === value;
          return (
            <label key={option} className={styles.twoOption} data-on={on ? "true" : "false"}>
              <input
                type="radio"
                name={name}
                className={styles.native}
                checked={on}
                onChange={() => onChange(option)}
              />
              {on ? <TickIcon className={styles.tick} /> : null}
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </Group>
  );
}

/** A labelled point on a scale, lowest first. The answer is the point's index. */
export function ScalePoints({
  legend,
  help,
  optional,
  error,
  options,
  value,
  onChange,
}: Omit<ChoiceProps, "value" | "onChange"> & { value: number | null; onChange: (index: number) => void }) {
  const name = useId();
  return (
    <Group legend={legend} help={help} optional={optional} error={error}>
      <div className={styles.scale}>
        {options.map((option, index) => {
          const on = index === value;
          return (
            <label key={option} className={styles.scalePoint} data-on={on ? "true" : "false"}>
              <input
                type="radio"
                name={name}
                className={styles.native}
                checked={on}
                onChange={() => onChange(index)}
              />
              <span aria-hidden="true" className={styles.radio} data-size="md" data-on={on ? "true" : "false"} />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </Group>
  );
}

/**
 * Tick boxes drawn as chips. The caller says which are on and what a press
 * does, so "several choices" and a ranking tick their options the same way.
 */
export function Chips({
  options,
  isOn,
  onToggle,
}: {
  options: readonly string[];
  isOn: (option: string) => boolean;
  onToggle: (option: string) => void;
}) {
  return (
    <div className={styles.chips}>
      {options.map((option) => {
        const on = isOn(option);
        return (
          <label key={option} className={styles.chipOption} data-on={on ? "true" : "false"}>
            <input type="checkbox" className={styles.native} checked={on} onChange={() => onToggle(option)} />
            {on ? <TickIcon className={styles.tick} /> : null}
            <span>{option}</span>
          </label>
        );
      })}
    </div>
  );
}

/** As many as apply, as chips. */
export function ChipChoices({
  legend,
  help,
  optional,
  error,
  options,
  value,
  onChange,
}: Omit<ChoiceProps, "value" | "onChange"> & { value: readonly string[]; onChange: (next: string[]) => void }) {
  return (
    <Group legend={legend} help={help} optional={optional} error={error}>
      <Chips
        options={options}
        isOn={(option) => value.includes(option)}
        onToggle={(option) =>
          // Kept in the question's own order, whichever was ticked first.
          onChange(options.filter((each) => (each === option ? !value.includes(option) : value.includes(each))))
        }
      />
    </Group>
  );
}
