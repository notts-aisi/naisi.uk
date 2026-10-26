"use client";

import { useId, useState, type ReactNode } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { SHOW_THE_WHOLE_ANSWER } from "@/lib/courses/writtenAnswerWords";
import styles from "./written.module.css";

/**
 * An answer folded to its first lines, with "Show the whole answer" under it
 * (board wk-feedback-phone). Drawn whole until the page hydrates, so a page
 * whose scripts never run still shows every word.
 */
export default function ClampedAnswer({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const id = useId();
  const folded = hydrated && !open;
  return (
    <div>
      <div id={id} className={folded ? styles.clamped : undefined}>
        {children}
      </div>
      {folded && (
        <button type="button" className={styles.textButton} aria-expanded={false} aria-controls={id} onClick={() => setOpen(true)}>
          {SHOW_THE_WHOLE_ANSWER}
        </button>
      )}
    </div>
  );
}
