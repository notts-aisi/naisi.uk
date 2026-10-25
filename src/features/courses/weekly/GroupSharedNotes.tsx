"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import InitialsChip from "@/components/ui/InitialsChip";
import { useHydrated } from "@/hooks/useHydrated";
import { dayWords } from "@/lib/courses/sessionChange/words";
import type { SharedNotesSection } from "@/lib/courses/sharedNotes/views";
import {
  ADD_A_NOTE,
  CANCEL,
  DELETE_NOTE,
  DELETE_NOTE_QUESTION,
  DELETE_NOTE_YES,
  DELETING_NOTE,
  KEEP_NOTE,
  NOTE_DELETED,
  NOTE_PLACEHOLDER,
  NOTE_SAVED,
  NO_NOTES_YET,
  SAVE_NOTE,
  SAVING_NOTE,
  SHARED_NOTE_REFUSAL,
  YOUR_NOTE,
  deleteNoteLabel,
  sharedNoteWeekLabel,
} from "@/lib/courses/sharedNotes/words";
import { COURSE_GROUP_SHARED_NOTE_LIMITS } from "@/lib/firestore/courseGroupSharedNotes";
import weekly from "@/features/courses/weekly/weekly.module.css";

/**
 * ONE GROUP'S SHARED NOTES (C29), as board wk-week-phone draws "Notes shared
 * with your group": each note with its writer's initials, name and day, and
 * its words after the week it was written on; "Add a note"; and the sentence
 * naming everyone who reads them.
 *
 * The notes come from the server, read for this reader after their gate
 * (`src/lib/courses/sharedNotes/readers.ts`); this draws what it is handed and
 * nothing else. "Add a note" opens a box for somebody who may write here and
 * nobody else. A note's own writer, and nobody else, is offered "Delete", with
 * a question first. Both go to the shared notes routes, which decide again,
 * and then the page is asked again from the server. Nobody is emailed.
 *
 * The box is uncontrolled and its buttons stay off until the page has
 * hydrated, so nothing typed is lost and no press goes nowhere.
 */
export default function GroupSharedNotes({
  section,
  weekNumber,
}: {
  section: SharedNotesSection;
  /** The week whose page this is, which a new note records; null on a page that is no week's. */
  weekNumber: number | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const box = useRef<HTMLTextAreaElement>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const base = `/api/courses/groups/${encodeURIComponent(section.groupId)}/shared-notes`;
  const headingId = `shared-notes-${section.groupId}`;
  const boxId = `shared-note-${section.groupId}`;
  const canAdd = section.canWrite && weekNumber !== null;

  // The box takes the focus when it opens, so typing can start at once.
  useEffect(() => {
    if (adding) box.current?.focus();
  }, [adding]);

  async function send(input: RequestInfo, init: RequestInit): Promise<string | null> {
    try {
      const response = await fetch(input, init);
      if (response.ok) return null;
      const answer = (await response.json().catch(() => null)) as { error?: unknown } | null;
      return typeof answer?.error === "string" && answer.error ? answer.error : SHARED_NOTE_REFUSAL.network;
    } catch {
      return SHARED_NOTE_REFUSAL.network;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || weekNumber === null) return;
    setBusy(true);
    setSaid(null);
    const refused = await send(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: box.current?.value ?? "", weekNumber }),
    });
    setBusy(false);
    if (refused) {
      setSaid({ ok: false, text: refused });
      return;
    }
    if (box.current) box.current.value = "";
    setAdding(false);
    setSaid({ ok: true, text: NOTE_SAVED });
    router.refresh();
  }

  async function remove(noteId: string) {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    const refused = await send(`${base}/${encodeURIComponent(noteId)}`, { method: "DELETE" });
    setBusy(false);
    setAsking(null);
    setSaid(refused ? { ok: false, text: refused } : { ok: true, text: NOTE_DELETED });
    if (!refused) router.refresh();
  }

  return (
    <section className={weekly.card} aria-labelledby={headingId}>
      <div className={`${weekly.cardHead} ${weekly.sharedNotesHead}`}>
        <h2 id={headingId} className={weekly.cardTitle}>
          {section.heading}
        </h2>
      </div>

      {section.notes.length === 0 ? (
        <p className={weekly.cardLine}>{NO_NOTES_YET}</p>
      ) : (
        <ul className={weekly.sharedNotes}>
          {section.notes.map((note) => {
            const day = dayWords(note.dateKey);
            return (
              <li key={note.id} className={weekly.sharedNote}>
                <div className={weekly.sharedNoteHead}>
                  <InitialsChip name={note.writerName} uid={note.writerUid} size="sm" />
                  <p className={weekly.sharedNoteBy}>
                    <strong>{note.writerFirstName}</strong>
                    {day ? ` · ${day}` : ""}
                  </p>
                  {note.mine && asking !== note.id && (
                    <button
                      type="button"
                      className={weekly.sharedNoteDelete}
                      aria-label={deleteNoteLabel(note.dateKey)}
                      onClick={() => {
                        setAsking(note.id);
                        setSaid(null);
                      }}
                      disabled={!hydrated || busy}
                    >
                      {DELETE_NOTE}
                    </button>
                  )}
                </div>
                <p className={weekly.sharedNoteBody}>
                  {sharedNoteWeekLabel(note.weekNumber)} {note.body}
                </p>
                {asking === note.id && (
                  <div className={weekly.sharedNoteConfirm}>
                    <p className={weekly.cardLine}>{DELETE_NOTE_QUESTION}</p>
                    <div className={weekly.sharedNotesActions}>
                      <button
                        type="button"
                        className={weekly.noteButtonDanger}
                        onClick={() => void remove(note.id)}
                        disabled={!hydrated || busy}
                      >
                        {busy ? DELETING_NOTE : DELETE_NOTE_YES}
                      </button>
                      <button type="button" className={weekly.noteButton} onClick={() => setAsking(null)} disabled={busy}>
                        {KEEP_NOTE}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canAdd && !adding && (
        <div className={weekly.sharedNotesActions}>
          <button
            type="button"
            className={weekly.noteButton}
            onClick={() => {
              setAdding(true);
              setSaid(null);
            }}
            disabled={!hydrated}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>{ADD_A_NOTE}</span>
          </button>
        </div>
      )}

      {canAdd && adding && (
        <form className={weekly.sharedNoteForm} onSubmit={save} noValidate>
          <label className={weekly.sharedNoteLabel} htmlFor={boxId}>
            {YOUR_NOTE}
          </label>
          <textarea
            ref={box}
            id={boxId}
            name="body"
            className={weekly.sharedNoteBox}
            rows={3}
            maxLength={COURSE_GROUP_SHARED_NOTE_LIMITS.body}
            placeholder={NOTE_PLACEHOLDER}
          />
          <div className={weekly.sharedNotesActions}>
            <button type="submit" className={weekly.noteButtonPrimary} disabled={!hydrated || busy}>
              {busy ? SAVING_NOTE : SAVE_NOTE}
            </button>
            <button type="button" className={weekly.noteButton} onClick={() => setAdding(false)} disabled={busy}>
              {CANCEL}
            </button>
          </div>
        </form>
      )}

      <p className={said && !said.ok ? weekly.sharedNotesError : weekly.sharedNotesStatus} role="status" aria-live="polite">
        {said?.text ?? ""}
      </p>
      <p className={weekly.sharedNotesWho}>{section.whoLine}</p>
    </section>
  );
}
