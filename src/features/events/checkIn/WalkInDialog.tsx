"use client";

import { useId, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { DoorRow } from "@/lib/events/checkInView";
import styles from "./WalkInDialog.module.css";

type FormProps = {
  eventId: string;
  /** "VR games night · Sun 1 Nov", set in mono under the heading. */
  eventLine: string;
  /** The day a walk-in's email is deleted: "Sun 8 Nov". */
  emailGoesOn: string;
  /** Where it is pressed: the door list, or the event's page afterwards. */
  from: "door" | "page";
  onAdded: (row: DoorRow) => void;
  onCancel: () => void;
};

/**
 * Adding a walk-in (ev-walkin-phone): a name, and an email only if they want
 * this event's survey, with the day it is deleted said beside the box. Saved
 * by the same route as a tick on the door list, as a walk-in.
 */
export function WalkInForm({ eventId, eventLine, emailGoesOn, from, onAdded, onCancel }: FormProps) {
  const nameId = useId();
  const emailId = useId();
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          walkIn: { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { row?: DoorRow; error?: string };
      if (!res.ok || !data.row) throw new Error(data.error ?? "That didn’t save. Try again.");
      onAdded(data.row);
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? "Not checked in: there’s no connection. Try again."
          : err instanceof Error
            ? err.message
            : "That didn’t save. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <div className={styles.head}>
        <h2 className={styles.title}>Add a walk-in</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={onCancel}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className={`meta ${styles.event}`}>{eventLine}</p>

      <label className={styles.label} htmlFor={nameId}>
        Name
      </label>
      <input
        id={nameId}
        name="name"
        className={styles.input}
        type="text"
        autoComplete="off"
        maxLength={80}
        required
      />

      <label className={styles.label} htmlFor={emailId}>
        Email <span className={styles.optional}>(optional)</span>
      </label>
      <input
        id={emailId}
        name="email"
        className={styles.input}
        type="email"
        autoComplete="off"
        maxLength={120}
        aria-describedby={hintId}
      />
      <p id={hintId} className={styles.hint}>
        Only for the survey after this event. We delete it on {emailGoesOn}, a week after the event.
      </p>

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? "Checking in…" : "Check in"}
        </Button>
        <Button type="button" variant="ghost" fullWidth onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The form in a dialog: a sheet from the bottom on a phone, centred on a laptop. */
export default function WalkInDialog({ open, ...props }: FormProps & { open: boolean }) {
  return (
    <Modal open={open} onClose={props.onCancel} ariaLabel="Add a walk-in" width="sm" sheet>
      {open && <WalkInForm {...props} />}
    </Modal>
  );
}
