import type { ReactNode } from "react";
import styles from "./programme.module.css";

type Props = {
  /** The small label over the title, typed in sentence case. */
  eyebrow: string;
  /**
   * The section's title. Left out, the small label is the section's heading
   * and keeps its look.
   */
  title?: ReactNode;
  /** One line under the title. */
  lede?: ReactNode;
  /** Goes on the heading, for the section's `aria-labelledby`. */
  id: string;
  /** How much room is left under the head. `prose` leaves none and narrows it. */
  space?: "tight" | "normal" | "loose" | "prose";
  children?: ReactNode;
};

const SPACE = {
  tight: styles.headTight,
  normal: "",
  loose: styles.headLoose,
  prose: styles.headProse,
} as const;

/**
 * The head of a section: a small label, a title and a line. The page's one
 * `h1` is the hero's, so the title here is an `h2`.
 */
export default function SectionHead({ eyebrow, title, lede, id, space = "normal", children }: Props) {
  const cls = [styles.head, SPACE[space]].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {title ? (
        <>
          <p className={`meta ${styles.eyebrow}`}>{eyebrow}</p>
          <h2 id={id} className={styles.title}>
            {title}
          </h2>
        </>
      ) : (
        <h2 id={id} className={styles.eyebrowHeading}>
          {eyebrow}
        </h2>
      )}
      {lede ? <p className={styles.lede}>{lede}</p> : null}
      {children}
    </div>
  );
}
