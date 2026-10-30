"use client";

import { useId, useState } from "react";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { ReadOutPrompt } from "@/lib/courses/facilitatorWeek/readers";
import {
  COPIED,
  COPY_FAILED,
  COPY_FOR_THE_SESSION,
  NOBODY_WROTE,
  NOTHING_PICKED,
  NO_REFLECTIONS,
  PICK_LINES,
  PROMPT,
  READ_THIS_OUT,
  READ_WITHOUT_NAMES,
  copyForSessionText,
  pickedFromWords,
  readThisOutLabelWords,
  reflectionPlaceWords,
  toReadOutWords,
  wroteWords,
} from "@/lib/courses/facilitatorWeek/words";
import styles from "@/features/courses/facilitator/facilitator.module.css";

/**
 * THE PAGE TO READ LINES OUT (boards wk-reflections at 1440 and
 * wk-reflections-phone at 390): one prompt at a time, everybody's answer to
 * it with no name on it, in the order of the words (Q37: a reflection may be
 * read out without the name of whoever wrote it). "Read this out" picks a
 * line into "To read out tonight", which keeps what was picked under every
 * prompt of the week, and "Copy for the session" copies the picked lines with
 * nothing about who wrote them.
 *
 * Handed words and counts only (`loadReadOutWeek`): no name, uid, row id or
 * time of any answer ever reaches this component, so none can reach the
 * browser. Picks live in this page alone: nothing is stored, and a reload
 * starts again.
 *
 * NEVER A NAME BESIDE AN ANSWER, for anybody: the group's facilitators, the
 * programme's lead and admins read reflections with names on pages of their
 * own (`NamedReflections`), and this component is handed no name to draw.
 * `readOut: false` draws the answers with no picking.
 */

function TickIcon() {
  return (
    <svg className={styles.wkTick} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

type CopyState = "idle" | "copied" | "failed";

export default function ReadOutView({
  prompts,
  tonight,
  readOut,
}: {
  prompts: ReadOutPrompt[];
  /** The group meets tonight: "To read out tonight". */
  tonight: boolean;
  /** Lines can be picked and copied; false draws the answers to read alone. */
  readOut: boolean;
}) {
  const hydrated = useHydrated();
  const selectId = useId();
  const [promptKey, setPromptKey] = useState(prompts[0]?.key ?? "");
  const [picks, setPicks] = useState<string[]>([]);
  const [copy, setCopy] = useState<CopyState>("idle");

  const current = prompts.find((prompt) => prompt.key === promptKey) ?? prompts[0] ?? null;
  const cardsByKey = new Map(prompts.flatMap((prompt) => prompt.cards.map((card) => [card.key, { card, prompt }] as const)));
  const picked = picks.map((key) => cardsByKey.get(key)).filter((entry) => entry !== undefined);

  function toggle(key: string) {
    setCopy("idle");
    setPicks((was) => (was.includes(key) ? was.filter((other) => other !== key) : [...was, key]));
  }

  async function copyPicked() {
    const text = copyForSessionText(picked.map((entry) => ({ partNumber: entry.prompt.partNumber, text: entry.card.text })));
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className={styles.wkReadColumns}>
      <div className={styles.wkReadMain}>
        {current === null ? (
          <p className={styles.wkEmpty}>{NO_REFLECTIONS}</p>
        ) : (
          <>
            <div>
              <div className={styles.wkPromptField}>
                <label htmlFor={selectId} className={styles.wkPromptLabel}>
                  {PROMPT}
                </label>
                <Select
                  id={selectId}
                  value={current.key}
                  disabled={!hydrated || prompts.length < 2}
                  onChange={(event) => setPromptKey(event.target.value)}
                >
                  {prompts.map((prompt) => (
                    <option key={prompt.key} value={prompt.key}>
                      {prompt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <p className={styles.wkPromptText}>{current.text}</p>
              <p className={styles.wkWroteLine}>{wroteWords(current.wrote, current.of, current.notYet)}</p>
            </div>
            {current.cards.length === 0 ? (
              <p className={styles.wkEmpty}>{NOBODY_WROTE}</p>
            ) : (
              <ol className={styles.wkAnswers} aria-label={current.label}>
                {current.cards.map((card, index) => {
                  const on = picks.includes(card.key);
                  return (
                    <li key={card.key} className={on ? `${styles.wkAnswer} ${styles.wkAnswerPicked}` : styles.wkAnswer}>
                      <div className={styles.wkAnswerHead}>
                        <span className={styles.wkAnswerPlace}>{reflectionPlaceWords(index + 1)}</span>
                        {readOut && (
                          <button
                            type="button"
                            className={styles.wkReadOut}
                            aria-pressed={on}
                            aria-label={readThisOutLabelWords(index + 1, current.cards.length)}
                            disabled={!hydrated}
                            onClick={() => toggle(card.key)}
                          >
                            {on && <TickIcon />}
                            <span>{READ_THIS_OUT}</span>
                          </button>
                        )}
                      </div>
                      <p className={styles.wkAnswerText}>{card.text}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>

      {readOut && current !== null && (
        <div className={styles.wkReadSide}>
          <section className={styles.wkPanel} aria-labelledby="to-read-out">
            <div className={styles.wkPanelHead}>
              <h2 id="to-read-out" className={styles.wkPanelTitle}>
                {toReadOutWords(tonight)}
              </h2>
              <span className={styles.wkPanelCount}>{picked.length}</span>
            </div>
            <p className={styles.wkPanelLine}>{PICK_LINES}</p>
            {picked.length === 0 ? (
              <p className={styles.wkEmpty}>{NOTHING_PICKED}</p>
            ) : (
              <ul className={styles.wkPicks}>
                {picked.map((entry) => (
                  <li key={entry.card.key} className={styles.wkPick}>
                    <span className={styles.wkPickFrom}>{pickedFromWords(entry.prompt.partNumber)}</span>
                    <p className={styles.wkPickText}>{`“${entry.card.text}”`}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.wkPanelNote}>{READ_WITHOUT_NAMES}</p>
            {picked.length > 0 && (
              <button type="button" className={styles.wkCopy} disabled={!hydrated} onClick={() => void copyPicked()}>
                {COPY_FOR_THE_SESSION}
              </button>
            )}
            <p className={styles.wkCopyStatus} role="status">
              {copy === "copied" ? COPIED : copy === "failed" ? COPY_FAILED : ""}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
