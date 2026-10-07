import styles from "./EditorSteps.module.css";

export type EditorStep<K extends string = string> = {
  key: K;
  label: string;
  /** Nothing the event needs is missing from this step. */
  done: boolean;
};

type Props<K extends string> = {
  steps: readonly EditorStep<K>[];
  current: K;
  onSelect: (key: K) => void;
};

/**
 * The steps of the event editor, as a strip: a tick where nothing is missing,
 * a ring round the step that is showing, a number on the rest. Each one is a
 * button, so any step can be opened in any order.
 *
 * A tick says "nothing the event needs is missing here". It does not say the
 * step has been visited, and it is not what saves anything.
 */
export default function StepRail<K extends string>({ steps, current, onSelect }: Props<K>) {
  return (
    <ol className={styles.rail} aria-label="Steps">
      {steps.map((step, i) => {
        const isCurrent = step.key === current;
        const state = isCurrent ? "current" : step.done ? "done" : "todo";
        const spoken = isCurrent
          ? `Step ${i + 1}, current step: `
          : step.done
            ? `Step ${i + 1}, done: `
            : `Step ${i + 1}: `;
        return (
          <li
            key={step.key}
            className={i === steps.length - 1 ? `${styles.item} ${styles.last}` : styles.item}
            aria-current={isCurrent ? "step" : undefined}
          >
            <button
              type="button"
              className={`${styles.step} ${styles[state]}`}
              onClick={() => onSelect(step.key)}
            >
              <span className={styles.mark} aria-hidden="true">
                {state === "done" ? <TickIcon /> : i + 1}
              </span>
              <span className={styles.label}>
                <span className="visually-hidden">{spoken}</span>
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                className={step.done ? `${styles.line} ${styles.lineDone}` : styles.line}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TickIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
