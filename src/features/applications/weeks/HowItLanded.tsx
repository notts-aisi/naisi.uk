"use client";

import { useState } from "react";
import Chip from "@/components/ui/Chip";
import { Field, Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { useRetrospective } from "@/features/courses/useTemplates";
import {
  ADD_NOTE,
  CANCEL,
  LANDED_LEDE,
  LANDED_PARTIAL,
  LANDED_TITLE,
  SAVE_NOTE,
  STAFF_ONLY,
  SAVING,
  landedLine,
  noteLabelWords,
  notesCountWords,
} from "@/lib/courses/weekSettings/words";
import { MATERIAL_NOTE_LIMITS } from "@/lib/firestore/courseMaterialNotes";
import type { MaterialRetroRow } from "@/lib/firestore/courseTemplates";
import styles from "./weeks.module.css";
import own from "./weekSettings.module.css";

/**
 * "HOW IT LANDED" ON A WEEK'S PAGE on a programme's Weeks tab, staff only:
 * each reading of this week, how it was rated and how many finished it, and
 * the team's notes on it.
 *
 * Read from the run's look back as it stands (`GET /api/courses/runs/
 * [runId]/retrospective`, through `useRetrospective`, which applies the
 * floor again on the way in), and only this week's readings kept, in the
 * week's own order (`sourceIds`). The route admits admins, course drafters
 * and approvers, the run's track leads and the lead of the programme that
 * names it; this page is drawn only for an admin and that lead, so it is
 * shown to them.
 *
 * NOTHING ABOUT ONE PERSON. The route reads people's progress through a
 * projection with no uid and returns counts: an average once three people
 * have rated a reading (`RETRO_ANONYMITY_FLOOR`), below that how many have
 * rated it so far and no average, and how many finished it of the run's
 * active places. The only names are on the team's notes, each signed by the
 * member of staff who wrote it. A note is saved through the route that saves
 * them today (`POST .../material-notes`), one per reading per author, and
 * saving again replaces it.
 */
export default function HowItLanded({ runId, weekNumber, sourceIds }: { runId: string; weekNumber: number; sourceIds: string[] }) {
  const hydrated = useHydrated();
  const { data, error, addNote } = useRetrospective(runId);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const byId = new Map((data?.materials ?? []).map((row) => [row.itemId, row] as const));
  const rows = sourceIds.map((id) => byId.get(id)).filter((row): row is MaterialRetroRow => row !== undefined);

  function choose(itemId: string | null) {
    setOpen(itemId);
    setDraft("");
    setProblem(null);
  }

  async function save(row: MaterialRetroRow) {
    setBusy(true);
    setProblem(null);
    const result = await addNote({ itemId: row.itemId, weekNumber, note: draft });
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    choose(null);
  }

  const opened = rows.find((row) => row.itemId === open) ?? null;
  return (
    <section className={styles.panel} aria-labelledby="how-it-landed-title">
      <div className={own.headRow}>
        <h3 id="how-it-landed-title" className={styles.subheading}>
          {LANDED_TITLE}
        </h3>
        <Chip tone="neutral">{STAFF_ONLY}</Chip>
      </div>
      <p className={styles.muted}>{LANDED_LEDE}</p>
      {error && (
        <p className={styles.problem} role="alert">
          {error.message}
        </p>
      )}
      {data?.truncated && <p className={styles.muted}>{LANDED_PARTIAL}</p>}
      {rows.length > 0 && (
        <ul className={own.landed}>
          {rows.map((row) => (
            <li key={row.itemId} className={own.reading}>
              <div className={own.readingText}>
                <p className={own.readingName}>{row.title}</p>
                <p className={styles.muted}>{landedLine(row)}</p>
              </div>
              <button
                type="button"
                className={styles.button}
                aria-expanded={open === row.itemId}
                onClick={() => choose(open === row.itemId ? null : row.itemId)}
                disabled={!hydrated || busy}
              >
                {row.facilitatorNotes.length > 0 ? notesCountWords(row.facilitatorNotes.length) : ADD_NOTE}
              </button>
            </li>
          ))}
        </ul>
      )}
      {opened && (
        <div className={own.noteBox}>
          {opened.facilitatorNotes.length > 0 && (
            <ul className={own.notes}>
              {opened.facilitatorNotes.map((note, index) => (
                <li key={`${note.at ?? ""}-${index}`}>
                  <p>{note.note}</p>
                  <p className={styles.muted}>{note.byName}</p>
                </li>
              ))}
            </ul>
          )}
          <Field id={`landed-note-${opened.itemId}`} label={noteLabelWords(opened.title)} error={problem}>
            <Textarea
              id={`landed-note-${opened.itemId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MATERIAL_NOTE_LIMITS.note}
              rows={3}
              disabled={busy}
            />
          </Field>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={() => choose(null)} disabled={busy}>
              {CANCEL}
            </button>
            <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void save(opened)} disabled={busy}>
              {busy ? SAVING : SAVE_NOTE}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
