"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import OptionRow from "@/components/ui/OptionRow";
import type { DraftCard } from "@/lib/courses/weekNotes/view";
import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import { MEMBER_NOTE_LIMITS, NOTE_SUGGESTIONS, type NoteAudience, type NoteSuggestion } from "@/lib/memberNotes/model";
import { NOTES_WORDS } from "@/lib/memberNotes/words";
import BuiltFrom from "./BuiltFrom";
import styles from "./weekNotes.module.css";

/**
 * ONE PERSON'S DRAFT ON A WEEK'S NOTES PAGE, for an admin (privacy v15: "a
 * person reads and edits it before it is kept"): what it was built from,
 * Claude's words in a box to edit, "Suggest for next term" with its three
 * boxes UNTICKED (Claude may say it in words; only a person ticks), who reads
 * it (admins and the programme's leads unless the admin keeps it to admins),
 * and three presses: Save to their notes, Discard, and Draft again (which
 * replaces this unsaved draft, and asks first when the box has been changed).
 *
 * Data only from the page: ids and words. Nobody is emailed.
 */

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  card: DraftCard;
};

/** A list with one suggestion added or taken away, kept in the order a note shows them. */
function toggled(list: readonly NoteSuggestion[], key: NoteSuggestion, on: boolean): NoteSuggestion[] {
  const next = new Set(list);
  if (on) next.add(key);
  else next.delete(key);
  return NOTE_SUGGESTIONS.filter((each) => next.has(each));
}

/** Who may read a weekly note, the programme's leads first: what the choice starts on. */
const READERS: readonly NoteAudience[] = ["leads", "admins"];

export default function NoteDraftCard({ roundId, programmeId, weekId, card }: Props) {
  const router = useRouter();
  const [text, setText] = useState(card.text);
  const [suggest, setSuggest] = useState<NoteSuggestion[]>([]);
  const [audience, setAudience] = useState<NoteAudience>("leads");
  const [busy, setBusy] = useState<"save" | "discard" | "again" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const base = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/weeks/${encodeURIComponent(weekId)}/notes`;

  async function send(which: "save" | "discard" | "again", url: string, init: RequestInit, failed: string) {
    setBusy(which);
    setProblem(null);
    try {
      const res = await fetch(url, init);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProblem(body?.error ?? failed);
        return;
      }
      router.refresh();
    } catch {
      setProblem(WEEK_NOTES_WORDS.loadFailed);
    } finally {
      setBusy(null);
    }
  }

  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const onSave = () => send("save", `${base}/${encodeURIComponent(card.uid)}/save`, json({ text, audience, suggest }), WEEK_NOTES_WORDS.saveFailed);
  const onDiscard = () => send("discard", `${base}/${encodeURIComponent(card.uid)}`, { method: "DELETE" }, WEEK_NOTES_WORDS.discardFailed);
  const onAgain = () => {
    // A changed box is the admin's work: drafting again replaces it, so ask once first.
    if (text !== card.text && !replacing) {
      setReplacing(true);
      return;
    }
    setReplacing(false);
    void send("again", `${base}/draft`, json({ uid: card.uid, again: true }), WEEK_NOTES_WORDS.failed);
  };

  const boxId = `draft-${card.uid}`;
  return (
    <article className={styles.card} aria-labelledby={`${boxId}-name`}>
      <div className={styles.cardHead}>
        <div className={styles.who}>
          <h3 id={`${boxId}-name`} className={styles.name}>
            {card.name}
          </h3>
          {card.group && <p className={styles.group}>{card.group}</p>}
        </div>
        <span className={`${styles.state} ${styles.stateDraft}`}>{WEEK_NOTES_WORDS.draft}</span>
      </div>
      <BuiltFrom lines={card.builtFrom} />
      {card.offered && <p className={styles.fact}>{WEEK_NOTES_WORDS.offered}</p>}
      {card.stale && <p className={styles.warning}>{card.stale}</p>}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={boxId}>
          {WEEK_NOTES_WORDS.draftNote}
        </label>
        <CountedTextarea id={boxId} value={text} max={MEMBER_NOTE_LIMITS.text} rows={6} disabled={busy !== null} onChange={(event) => setText(event.target.value)} />
        {card.drafted && <p className={styles.line}>{card.drafted}</p>}
      </div>
      <fieldset className={styles.choice}>
        <legend className={styles.legend}>{NOTES_WORDS.suggestTitle}</legend>
        <div className={styles.suggestions}>
          {NOTE_SUGGESTIONS.map((key) => (
            <OptionRow
              key={key}
              plain
              checked={suggest.includes(key)}
              disabled={busy !== null}
              onChange={(event) => setSuggest(toggled(suggest, key, event.target.checked))}
            >
              {NOTES_WORDS.suggestion[key]}
            </OptionRow>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.choice}>
        <legend className={styles.legend}>{WEEK_NOTES_WORDS.whoReads}</legend>
        <div className={styles.readers}>
          {READERS.map((option) => (
            <OptionRow
              key={option}
              type="radio"
              plain
              name={`${boxId}-audience`}
              value={option}
              checked={audience === option}
              disabled={busy !== null}
              onChange={() => setAudience(option)}
            >
              {NOTES_WORDS.audience[option]}
            </OptionRow>
          ))}
        </div>
      </fieldset>
      <div className={styles.actions}>
        {card.savable && (
          <Button type="button" variant="primary" disabled={busy !== null || !text.trim()} onClick={() => void onSave()}>
            {busy === "save" ? WEEK_NOTES_WORDS.saving : WEEK_NOTES_WORDS.save}
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void onDiscard()}>
          {busy === "discard" ? WEEK_NOTES_WORDS.discarding : WEEK_NOTES_WORDS.discard}
        </Button>
        {card.savable && (
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={onAgain}>
            {busy === "again" ? WEEK_NOTES_WORDS.draftingOne : replacing ? WEEK_NOTES_WORDS.replaceChanges : WEEK_NOTES_WORDS.draftAgain}
          </Button>
        )}
      </div>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </article>
  );
}
