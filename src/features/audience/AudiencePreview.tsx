"use client";

import { useId, useState } from "react";
import { PREVIEW_WORDS } from "@/lib/audience/words";
import WhoIsThisFor from "./WhoIsThisFor";
import styles from "./WhoIsThisFor.module.css";

/**
 * The picker on the mailing list page, closed until it is opened: who a
 * message to some tags would reach, who would be left out and why, and how
 * it would be sent, with nothing to send. Nothing is read until it is first
 * opened, and what was chosen stays while it is closed again.
 */
export default function AudiencePreview() {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const bodyId = useId();
  return (
    <section className={styles.preview} aria-label={PREVIEW_WORDS.title}>
      <button
        type="button"
        className={styles.previewToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen((was) => !was);
          setOpened(true);
        }}
      >
        <span className={styles.previewTitle}>{PREVIEW_WORDS.title}</span>
        <span className={styles.previewState}>{open ? PREVIEW_WORDS.hide : PREVIEW_WORDS.show}</span>
      </button>
      <div id={bodyId} className={styles.previewBody} hidden={!open}>
        <p className={styles.previewNote}>{PREVIEW_WORDS.note}</p>
        {opened && <WhoIsThisFor />}
      </div>
    </section>
  );
}
