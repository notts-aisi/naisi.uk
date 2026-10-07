import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./OptionRow.module.css";

type OptionRowProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** A box ticked alongside others, or a round one where one of a set is chosen. */
  type?: "checkbox" | "radio";
  /** The words beside the box. */
  children: ReactNode;
  /** A second, muted line under the words. */
  description?: ReactNode;
  /** Without the row's own edge and ground: the box and its words only. */
  plain?: boolean;
};

/**
 * A ticked box in a row: a real checkbox or radio, with the whole row as its
 * label and its target. When ticked, the row takes the accent edge and a
 * soft accent ground.
 *
 * Every other prop goes to the <input>, so it works controlled (`checked`
 * and `onChange`) or left to the browser (`defaultChecked`, `name`,
 * `value`), which is what a form rendered on the server needs before it
 * hydrates.
 */
export default function OptionRow({
  type = "checkbox",
  children,
  description,
  plain = false,
  className,
  ...rest
}: OptionRowProps) {
  const cls = [styles.row, plain ? styles.plain : styles.boxed, className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <label className={cls}>
      <input {...rest} type={type} className={styles.input} />
      <span
        className={type === "radio" ? `${styles.box} ${styles.round}` : styles.box}
        aria-hidden="true"
      >
        {type === "radio" ? (
          <span className={styles.pip} />
        ) : (
          <svg
            className={styles.tick}
            width="14"
            height="14"
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
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{children}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
    </label>
  );
}
