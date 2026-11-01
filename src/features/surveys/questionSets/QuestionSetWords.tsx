"use client";

import { useRouter } from "next/navigation";
import { Fragment, useId, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { QUESTION_SET_WORDS, type FixedWords, type SetEntry, type WordSlot, type WordsOnlyKind } from "@/lib/surveys/questionSets";
import styles from "./questionSets.module.css";

/**
 * A WORDS-ONLY QUESTION SET'S PAGE: every word of the set in the form's
 * order, each question its own group of labelled boxes, with the original
 * under any word that differs from it; the words that stay as they are, with
 * why; then "Back to the original words", which puts the original back in
 * the form, and Save, which keeps the form.
 *
 * Nothing here can add, take out, move or retype a question: the page sends
 * the words by their places and the route refuses anything else. Every box
 * is disabled until the page's script arrives, so nothing typed is lost.
 * Every control is at least 44px.
 */

type Props = {
  kind: WordsOnlyKind;
  entries: SetEntry[];
  /** "Last changed Mon 2 Nov by Zach.", or that nobody has. */
  changed: string;
};

/** Every slot of every entry, in order. */
function slotsOf(entries: readonly SetEntry[]): WordSlot[] {
  return entries.flatMap((entry) => entry.slots);
}

/** Words as the route keeps them, to tell a change from the original. */
const kept = (words: string) => words.replace(/\s+/g, " ").trim();

/** Words that stay as they are, shown in their place with why. */
function Stays({ fixed }: { fixed: FixedWords }) {
  return (
    <div className={styles.fixed}>
      <span className={styles.label}>{fixed.label}</span>
      <span className={styles.fixedWords}>{fixed.words}</span>
      <span className={styles.note}>
        {QUESTION_SET_WORDS.stays}. {fixed.why}
      </span>
    </div>
  );
}

/** What a group of boxes is: "Question 3", "Page 2", "Consent". */
function legendOf(entry: SetEntry, page: number): string {
  if (entry.kind === "question") return `Question ${entry.number}`;
  return entry.kind === "section" ? `Page ${page}` : "Consent";
}

export default function QuestionSetWords({ kind, entries, changed }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [words, setWords] = useState<Record<string, string>>(() => Object.fromEntries(slotsOf(entries).map((slot) => [slot.key, slot.words])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");

  const set = (key: string, text: string) => {
    setWords((current) => ({ ...current, [key]: text }));
    setSaid("");
  };
  const differs = slotsOf(entries).some((slot) => kept(words[slot.key] ?? "") !== slot.original);

  function back() {
    setWords(Object.fromEntries(slotsOf(entries).map((slot) => [slot.key, slot.original])));
    setError("");
    setSaid(QUESTION_SET_WORDS.backNote);
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaid("");
    try {
      const response = await fetch(`/api/surveys/question-sets/${encodeURIComponent(kind)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? QUESTION_SET_WORDS.failed);
      } else {
        setSaid(kind === "session-report" ? QUESTION_SET_WORDS.savedReport : QUESTION_SET_WORDS.saved);
        router.refresh();
      }
    } catch {
      setError(QUESTION_SET_WORDS.offline);
    } finally {
      setBusy(false);
    }
  }

  // Each section starts a page, as the survey draws it.
  const pages = entries.map((_, at) => entries.slice(0, at + 1).filter((each) => each.kind === "section").length);
  return (
    <fieldset className={styles.plain} disabled={!hydrated || busy}>
      <ol className={styles.entries}>
        {entries.map((entry, at) => {
          const page = pages[at];
          return (
            <li key={entry.id} className={entry.kind === "question" ? styles.entry : `${styles.entry} ${styles.block}`}>
              <fieldset className={styles.group}>
                <legend className={styles.legend}>
                  <span className={styles.legendName}>{legendOf(entry, page)}</span>
                  {entry.kind === "question" && <span className={styles.type}>{entry.type}</span>}
                  {entry.only && (
                    <Chip tone="neutral" size="sm">
                      {entry.only}
                    </Chip>
                  )}
                </legend>
                <div className={styles.fields}>
                  {entry.slots.map((slot) => {
                    const field = `${id}-${slot.key}`;
                    const value = words[slot.key] ?? "";
                    return (
                      <Fragment key={slot.key}>
                        {entry.kind === "question" &&
                          entry.fixed.filter((fixed) => fixed.before === slot.key).map((fixed) => <Stays key={fixed.label} fixed={fixed} />)}
                        <div className={styles.field}>
                          <label className={styles.label} htmlFor={field}>
                            {slot.label}
                          </label>
                          {slot.long ? (
                            <Textarea id={field} rows={2} maxLength={slot.max} value={value} onChange={(event) => set(slot.key, event.target.value)} />
                          ) : (
                            <Input id={field} maxLength={slot.max} value={value} onChange={(event) => set(slot.key, event.target.value)} />
                          )}
                          {kept(value) !== slot.original && (
                            <p className={styles.original}>
                              {QUESTION_SET_WORDS.original} {slot.original ? `“${slot.original}”` : "none"}
                            </p>
                          )}
                        </div>
                      </Fragment>
                    );
                  })}
                  {entry.kind === "question" &&
                    entry.fixed.filter((fixed) => fixed.before === null).map((fixed) => <Stays key={fixed.label} fixed={fixed} />)}
                  {entry.kind === "question" &&
                    entry.notes.map((note) => (
                      <p key={note} className={styles.note}>
                        {note}
                      </p>
                    ))}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.status} role="status">
        {said || changed}
      </p>
      <div className={styles.buttons}>
        <Button variant="ghost" onClick={back} disabled={!differs}>
          {QUESTION_SET_WORDS.backWords}
        </Button>
        <Button onClick={save}>{busy ? QUESTION_SET_WORDS.saving : QUESTION_SET_WORDS.save}</Button>
      </div>
    </fieldset>
  );
}
