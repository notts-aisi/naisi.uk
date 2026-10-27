"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type FormEvent, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import {
  CONFIRM_AFTER,
  CONFIRM_BEFORE,
  LEAVE_FAILED,
  LEAVE_UNREACHABLE,
  LEAVING,
  REASON_LABEL,
  STAY,
  leaveButton,
} from "@/lib/courses/leavingWords";
import styles from "./Leaving.module.css";

/**
 * THE CONFIRMATION BEHIND "LEAVE THE PROGRAMME", in the house's typed style:
 * the leave button stays dead until the course's title is typed exactly, as
 * the route checks it (byte for byte, nothing trimmed), because this is the
 * one thing on the programme a person cannot undo themselves.
 *
 * BEFORE THE SCRIPT ARRIVES nothing pretends to work: both boxes are
 * uncontrolled, so nothing typed is lost when React takes over, and the
 * button is disabled until it has (`useHydrated`). What was typed before then
 * is read from the box itself once the page is live (`useTypedValue`).
 *
 * The reason is optional and goes with the press; who reads it is said beside
 * the box by the page. After the route answers, the page is refreshed and the
 * programme page says they left.
 */

type Props = {
  runId: string;
  /** The course's title, which is what is typed: "AGI Strategy Fellowship". */
  courseTitle: string;
  /** The programme's short name, for the button: "AGI Strategy". */
  name: string;
  /** Who reads the reason, in words: "Only Claudia, who leads AGI Strategy, and admins read this." */
  readers: string;
  /** The most the reason may hold, in characters. */
  reasonMax: number;
};

/** What a box says right now, kept in step with the box itself rather than with React's state. */
function useTypedValue(ref: RefObject<HTMLInputElement | null>): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const box = ref.current;
      if (!box) return () => {};
      box.addEventListener("input", onChange);
      return () => box.removeEventListener("input", onChange);
    },
    [ref],
  );
  return useSyncExternalStore(
    subscribe,
    () => ref.current?.value ?? "",
    () => "",
  );
}

export default function LeaveForm({ runId, courseTitle, name, readers, reasonMax }: Props) {
  const hydrated = useHydrated();
  const router = useRouter();
  const confirmRef = useRef<HTMLInputElement>(null);
  const typed = useTypedValue(confirmRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Byte equality, matching the route.
  const confirmed = typed === courseTitle;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || busy) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/enrol`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: String(form.get("confirmName") ?? ""), ...(reason ? { reason } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? LEAVE_FAILED);
        setBusy(false);
        return;
      }
      // The programme page, which now says they left.
      router.replace(`/learn/${encodeURIComponent(runId)}`);
      router.refresh();
    } catch {
      setError(LEAVE_UNREACHABLE);
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <label className={styles.label} htmlFor="leave-reason">
        {REASON_LABEL}
      </label>
      <textarea
        id="leave-reason"
        name="reason"
        className={`${styles.field} ${styles.textarea}`}
        maxLength={reasonMax}
        rows={3}
        aria-describedby="leave-reason-readers"
      />
      <p id="leave-reason-readers" className={styles.hint}>
        {readers}
      </p>

      <label className={styles.label} htmlFor="leave-confirm">
        {CONFIRM_BEFORE} <span className={styles.courseTitle}>{courseTitle}</span> {CONFIRM_AFTER}
      </label>
      <input
        id="leave-confirm"
        name="confirmName"
        ref={confirmRef}
        className={styles.field}
        autoComplete="off"
        spellCheck={false}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="submit" className={styles.leave} disabled={!hydrated || !confirmed || busy}>
          {busy ? LEAVING : leaveButton(name)}
        </button>
        <Link href={`/learn/${encodeURIComponent(runId)}`} className={styles.stay}>
          {STAY}
        </Link>
      </div>
    </form>
  );
}
