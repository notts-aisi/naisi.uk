"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "@/features/courses/facilitator/facilitator.module.css";

/**
 * A real button that shows and hides what is under it (Q31: names by a tap or
 * a click, never by hovering): keyboard reachable, 44px, its state said to a
 * screen reader (`aria-expanded`), and what it opens named by `aria-controls`.
 * Its name for a screen reader starts with the words it shows, so a person
 * speaking to their device can say what they see. What it opens is in the
 * page's markup from the start, hidden, so nothing is fetched when it opens.
 *
 * Returns the button and what it opens side by side: the row that holds them
 * gives what opens the whole width under the row.
 */
export default function Disclosure({
  label,
  hideLabel,
  name,
  hideName,
  children,
}: {
  /** The button's words while closed: "See who", "2 private notes". */
  label: string;
  /** Its words while open: "Hide". */
  hideLabel: string;
  /** Its name while closed, starting with `label`: "See who ticked A keeper’s diary". */
  name: string;
  /** Its name while open, starting with `hideLabel`: "Hide who ticked A keeper’s diary". */
  hideName: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={styles.wkToggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? hideName : name}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? hideLabel : label}
      </button>
      <div id={id} className={styles.wkOpened} hidden={!open}>
        {children}
      </div>
    </>
  );
}
