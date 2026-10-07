"use client";

import { useId } from "react";
import { ArrowRightIcon } from "./icons";
import styles from "./form.module.css";

/**
 * Facilitating: one question on its own step, as two big options.
 *
 * `moreQuestions` is how many questions saying yes adds (the facilitator
 * set), so the Yes option can say what it leads to.
 */

/**
 * Where "What facilitators do" goes. There is no page for it on the site
 * yet, so the link is left out until there is one to point at: a link to
 * nowhere is worse than no link.
 */
const FACILITATORS_HREF: string | null = null;

export default function FacilitatingStep({
  value,
  onChange,
  moreQuestions,
  problem,
}: {
  value: boolean | null;
  onChange: (wants: boolean) => void;
  moreQuestions: number;
  problem: string | null;
}) {
  const name = useId();
  return (
    <div className={styles.body}>
      <fieldset className={styles.cards} aria-describedby={problem ? `${name}-e` : undefined}>
        <legend className="visually-hidden">Would you like to facilitate a group?</legend>
        <label className={styles.bigOption} data-on={value === true ? "true" : "false"}>
          <input
            type="radio"
            name={name}
            className={styles.native}
            checked={value === true}
            onChange={() => onChange(true)}
          />
          <span
            aria-hidden="true"
            className={styles.radio}
            data-size="lg"
            data-on={value === true ? "true" : "false"}
          />
          <span>
            <span className={styles.bigName}>Yes</span>
            {moreQuestions > 0 ? (
              <span className={styles.bigNote}>
                We’ll ask you {moreQuestions} more {moreQuestions === 1 ? "question" : "questions"}.
              </span>
            ) : null}
          </span>
        </label>
        <label className={styles.bigOption} data-on={value === false ? "true" : "false"}>
          <input
            type="radio"
            name={name}
            className={styles.native}
            checked={value === false}
            onChange={() => onChange(false)}
          />
          <span
            aria-hidden="true"
            className={styles.radio}
            data-size="lg"
            data-on={value === false ? "true" : "false"}
          />
          <span>
            <span className={styles.bigName}>Not this time</span>
          </span>
        </label>
      </fieldset>
      {problem ? (
        <p id={`${name}-e`} className={styles.error} role="alert">
          {problem}
        </p>
      ) : null}
      {FACILITATORS_HREF ? (
        <div className={styles.tuck}>
          <a href={FACILITATORS_HREF} className={styles.textLink}>
            <span>What facilitators do</span>
            <ArrowRightIcon size={16} />
          </a>
        </div>
      ) : null}
    </div>
  );
}
