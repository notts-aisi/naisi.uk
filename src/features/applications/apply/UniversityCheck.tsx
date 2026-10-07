"use client";

import type { Ref } from "react";
import type { UniversityCheck as Check } from "./useUniversityCheck";
import form from "./form.module.css";
import styles from "./join.module.css";

/**
 * What the form says while a university address is still to be checked, in
 * the two places it says it: under the address on About you, and at the top
 * of Check and send, where the send is held.
 *
 * It is drawn only while the send is held (`check.held`), so somebody whose
 * address is checked, and an approved member who is not asked, never see it.
 */

function Again({ check }: { check: Check }) {
  const label = check.sending
    ? "Sending…"
    : check.wait > 0
      ? `Send the link again in ${check.wait}s`
      : "Send the link again";
  return (
    <div className={styles.checkActions}>
      <button
        type="button"
        className={styles.resendLink}
        onClick={check.resend}
        disabled={check.sending || check.wait > 0}
      >
        {label}
      </button>
      {check.note ? (
        <span role="status" className={styles.checkNote}>
          {check.note}
        </span>
      ) : null}
    </div>
  );
}

/** Under the address, on About you. */
export function UniversityCheckNote({ check }: { check: Check }) {
  return (
    <div className={styles.check}>
      <p>
        Not checked yet. We emailed a link to this address: open it to check it’s yours. If the address is wrong,
        email ai-safety@uonsu.com and we’ll change it.
      </p>
      <Again check={check} />
    </div>
  );
}

/** At the top of Check and send. Takes the focus when a press of Send is held. */
export function UniversityCheckHold({ check, noticeRef }: { check: Check; noticeRef: Ref<HTMLDivElement> }) {
  return (
    <div ref={noticeRef} tabIndex={-1} className={form.notice} data-tone="warn">
      <p>
        <strong>Check your university email before you send.</strong>
      </p>
      <p>
        We emailed a link to <span className={styles.address}>{check.address}</span>. Open it, then come back to
        this page and send. Your answers are saved, and you can keep changing them in the meantime.
      </p>
      <p>If it hasn’t arrived, look in your spam folder, or email ai-safety@uonsu.com.</p>
      <Again check={check} />
    </div>
  );
}
