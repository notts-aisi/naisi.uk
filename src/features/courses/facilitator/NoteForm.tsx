"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import {
  ADD_A_NOTE,
  NOTE_PLACEHOLDER,
  NOTE_REFUSAL,
  NOTE_SAVED,
  SAVE_NOTE,
  SAVING_NOTE,
} from "@/lib/courses/facilitatorPageWords";
import { COURSE_GROUP_NOTE_LIMITS } from "@/lib/firestore/courseGroupNotes";
import styles from "./facilitator.module.css";

/**
 * "Add a note" and "Save note" under a group's notes (wk-fac-group), for the
 * group's own facilitators: the page draws it for nobody else, and the notes
 * route takes a note from nobody else.
 *
 * The box is uncontrolled and the button stays off until the page has
 * hydrated, so nothing typed before then is lost and no press goes nowhere.
 * A saved note clears the box and asks the server page again, which reads
 * the notes, the new one first. A refusal is the route's own sentence.
 */
export default function NoteForm({ groupId }: { groupId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const body = box.current?.value ?? "";
    setSaving(true);
    setSaid(null);
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const answer = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (!response.ok) {
        setSaid({ ok: false, text: typeof answer?.error === "string" && answer.error ? answer.error : NOTE_REFUSAL.network });
        return;
      }
      if (box.current) box.current.value = "";
      setSaid({ ok: true, text: NOTE_SAVED });
      router.refresh();
    } catch {
      setSaid({ ok: false, text: NOTE_REFUSAL.network });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.noteForm} onSubmit={save} noValidate>
      <label className={styles.noteLabel} htmlFor={`note-${groupId}`}>
        {ADD_A_NOTE}
      </label>
      <textarea
        ref={box}
        id={`note-${groupId}`}
        name="body"
        className={styles.noteBox}
        rows={3}
        maxLength={COURSE_GROUP_NOTE_LIMITS.body}
        placeholder={NOTE_PLACEHOLDER}
      />
      <div className={styles.noteFoot}>
        <button type="submit" className={styles.button} disabled={!hydrated || saving}>
          {saving ? SAVING_NOTE : SAVE_NOTE}
        </button>
        <p className={said && !said.ok ? styles.noteError : styles.noteStatus} role="status" aria-live="polite">
          {said?.text ?? ""}
        </p>
      </div>
    </form>
  );
}
