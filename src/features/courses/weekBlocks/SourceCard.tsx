"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import SavedFlash, { type SaveState } from "@/components/ui/SavedFlash";
import StarRating from "@/components/ui/StarRating";
import {
  HOW_USEFUL,
  PRIVATE_NOTE,
  RATE_OR_NOTE,
  doneItemWords,
} from "@/lib/courses/memberPageWords";
import { SOURCE_KIND_LABEL, type SourceBlock } from "@/lib/courses/weekBlocks/model";
import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import { PROGRESS_LIMITS, type CourseProgressDoc, type ProgressItemKind } from "@/lib/firestore/courseProgress";
import { saveProgressReflection } from "../progressMutations";
import weekly from "../weekly/weekly.module.css";
import { Runs } from "./Prose";
import styles from "./blockWeek.module.css";

/**
 * SOURCES ON A PART'S PATH (boards st-week1-phone, wk-week-phone): each one a
 * link (Q36: videos too, never a player), its kind, its time, who made it and
 * when, its note, and for somebody taking part a tick in a 44px target.
 *
 * A TICK is the person's own `courseProgress` row for the source's id,
 * written by the caller through `useMaterialTicks`, the one way every page
 * ticks (so a source ticked on Home is ticked here).
 *
 * THE READING'S BOX (Q38): once a source is ticked, "Rate it or leave a note"
 * opens the star rating and the private note, the two things each reading
 * has always kept, renamed so that "reflection" means the week's set
 * questions only. They are stored on the same row as the tick
 * (`saveProgressReflection`). No comment for the rest of the run is drawn on
 * a week written as blocks.
 *
 * Under the page's first sources, who sees the ticks (Q31): the group's
 * facilitators, the programme's lead and admins.
 */

type Props = {
  sources: SourceBlock[];
  runId: string;
  uid: string;
  weekNumber: number;
  /** Somebody taking part: their ticks are drawn. */
  showTicks: boolean;
  /** Their enrolment is active: ticks and the reading's box take writing. */
  canWrite: boolean;
  isDone: (itemId: string) => boolean;
  /** The person's own rows, for each reading's rating and note. */
  rows: ReadonlyMap<string, CourseProgressDoc>;
  onTick: (kind: ProgressItemKind, itemId: string, next: boolean) => void;
  /** Who sees the ticks, under the page's first sources only. */
  ticksLine: string | null;
  /** Who reads the private note: the reader's facilitators and admins, or for a facilitator's own, admins. */
  privateNoteHint: string;
};

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ArrowUpRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.arrow}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export default function SourceCard({
  sources,
  runId,
  uid,
  weekNumber,
  showTicks,
  canWrite,
  isDone,
  rows,
  onTick,
  ticksLine,
  privateNoteHint,
}: Props) {
  return (
    <div className={styles.sources}>
      <ul className={styles.sourceList} role="list">
        {sources.map((source) => {
          const done = isDone(source.id);
          const href = safeSourceUrl(source.url);
          const byLine = [source.by, source.date].map((part) => part.trim()).filter(Boolean).join(" · ");
          return (
            <li key={source.id} className={styles.source} id={`block-${source.id}`}>
              {showTicks && (
                <label className={weekly.tickBox}>
                  <input
                    type="checkbox"
                    className={weekly.tickInput}
                    checked={done}
                    disabled={!canWrite}
                    aria-label={doneItemWords(source.title)}
                    onChange={(event) => onTick("material", source.id, event.currentTarget.checked)}
                  />
                  <span className={weekly.tickMark} aria-hidden="true">
                    {done && <Check />}
                  </span>
                </label>
              )}
              <div className={styles.sourceBody}>
                {href ? (
                  <a className={styles.sourceTitle} href={href} target="_blank" rel="noopener noreferrer">
                    {source.title}
                    <ArrowUpRight />
                  </a>
                ) : (
                  <p className={styles.sourceTitlePlain}>{source.title}</p>
                )}
                <p className={styles.sourceMeta}>
                  <span className={styles.kindPill}>{SOURCE_KIND_LABEL[source.kind]}</span>
                  {source.time && <span className={styles.mono}>{source.time}</span>}
                </p>
                {byLine && <p className={styles.sourceBy}>{byLine}</p>}
                {source.note.length > 0 && (
                  <p className={styles.sourceNote}>
                    <Runs runs={source.note} linkClassName={styles.inlineLink} />
                  </p>
                )}
                {showTicks && canWrite && done && (
                  <ReadingBox
                    runId={runId}
                    uid={uid}
                    weekNumber={weekNumber}
                    itemId={source.id}
                    row={rows.get(source.id) ?? null}
                    hint={privateNoteHint}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {ticksLine && <p className={styles.cardFootLine}>{ticksLine}</p>}
    </div>
  );
}

/**
 * The reading's box: the stars and the private note on the person's own row
 * for the source. Seeded when it opens and dropped when it closes, so a save
 * landing while they type never replaces what they are writing.
 */
function ReadingBox({
  runId,
  uid,
  weekNumber,
  itemId,
  row,
  hint,
}: {
  runId: string;
  uid: string;
  weekNumber: number;
  itemId: string;
  row: CourseProgressDoc | null;
  hint: string;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ rating: number | null; note: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  if (open && draft === null) setDraft({ rating: row?.rating ?? null, note: row?.privateNote ?? "" });
  if (!open && draft !== null) setDraft(null);

  const save = async () => {
    if (!draft || !row?.completed) return;
    setSaveState("saving");
    try {
      await saveProgressReflection({
        runId,
        uid,
        weekNumber,
        itemKind: "material",
        itemId,
        current: row,
        rating: draft.rating ?? undefined,
        // Kept as stored: nothing on this page writes a comment for the run.
        publicComment: row.publicComment,
        privateNote: draft.note.trim() ? draft.note : undefined,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className={styles.readingBox}>
      <button
        type="button"
        className={styles.rateButton}
        aria-expanded={open}
        aria-controls={`${fieldId}-panel`}
        onClick={() => setOpen((was) => !was)}
      >
        {RATE_OR_NOTE}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? styles.chevronOpen : styles.chevron}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && draft && (
        <div id={`${fieldId}-panel`} className={styles.readingPanel}>
          <div className={styles.stars}>
            <span className={styles.fieldLabel} id={`${fieldId}-rating`}>
              {HOW_USEFUL}
            </span>
            <StarRating
              value={draft.rating}
              onChange={(n) => setDraft((d) => (d ? { ...d, rating: n } : d))}
              onClear={() => setDraft((d) => (d ? { ...d, rating: null } : d))}
              ariaLabel={HOW_USEFUL}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${fieldId}-note`}>
              {PRIVATE_NOTE}
              <span className={styles.fieldHint}> · {hint}</span>
            </label>
            <CountedTextarea
              id={`${fieldId}-note`}
              rows={2}
              value={draft.note}
              max={PROGRESS_LIMITS.privateNote}
              onChange={(event) => {
                const note = event.target.value;
                setDraft((d) => (d ? { ...d, note } : d));
              }}
            />
          </div>
          <div className={styles.panelActions}>
            <Button size="sm" onClick={() => void save()} disabled={!row?.completed}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <SavedFlash state={saveState} />
          </div>
        </div>
      )}
    </div>
  );
}
