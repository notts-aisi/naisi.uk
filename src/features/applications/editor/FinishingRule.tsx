"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { FINISH_LIMITS } from "@/lib/courses/finishing/model";
import { RULE_CARD_TITLE, RULE_LABEL, RULE_UNIT, ruleHint } from "@/lib/courses/finishing/words";
import { SavedStatus, type SaveState } from "./controls";
import shared from "./editor.module.css";
import styles from "./FinishingRule.module.css";

/**
 * THE RULE FOR WHO FINISHED, on the programme's Settings tab, for its lead
 * and admins: the least number of sessions somebody must have come to, of
 * the sessions their group held. There is no default; an empty box is no
 * rule. Once the run's last session is over, the Overview ticks everybody
 * who came to that many, and the lead changes any.
 *
 * SAVED AS THE REST OF SETTINGS IS: no Save button, the number is sent a
 * moment after the last keystroke, and the line beside the title says
 * "Saved", "Saving…" or what is stopping it. The box is read only until the
 * page is live, so nothing typed before then is written over.
 */

const SAVE_DELAY_MS = 700;

/** What is typed: empty is no rule, a whole number is a rule, anything else is held back. */
function typed(text: string): number | null | "bad" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d{1,2}$/.test(trimmed)) return "bad";
  const value = Number(trimmed);
  return value >= 1 && value <= FINISH_LIMITS.maxAtLeast ? value : "bad";
}

export default function FinishingRule({
  roundId,
  programmeId,
  initial,
}: {
  roundId: string;
  programmeId: string;
  initial: { atLeast: number | null; sessions: number | null };
}) {
  const ids = useId();
  const live = useHydrated();
  const [stored, setStored] = useState(initial);
  const [text, setText] = useState(initial.atLeast === null ? "" : String(initial.atLeast));
  const [problem, setProblem] = useState<string | null>(null);
  /** The value the server last refused, so it is not sent again until it changes. */
  const [refused, setRefused] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const turn = useRef(0);

  const value = typed(text);
  const held =
    value === "bad"
      ? `Not saved yet. The number of sessions has to be a whole number from 1 to ${FINISH_LIMITS.maxAtLeast}.`
      : null;
  const dirty = value !== "bad" && value !== stored.atLeast;
  const key = JSON.stringify(value);

  useEffect(() => {
    if (!live || !dirty || held || key === refused) return;
    const timer = setTimeout(() => {
      turn.current += 1;
      const mine = turn.current;
      setSending(true);
      fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/finishing/rule`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ atLeast: value }),
        },
      )
        .then(async (response) => {
          const answer = (await response.json().catch(() => null)) as
            | { rule?: { atLeast: number | null; sessions: number | null }; error?: string }
            | null;
          if (mine !== turn.current) return;
          if (!response.ok || !answer?.rule) {
            setProblem(answer?.error ?? "That didn’t save. Try again in a minute.");
            setRefused(key);
            return;
          }
          setStored(answer.rule);
          setProblem(null);
        })
        .catch(() => {
          if (mine !== turn.current) return;
          setProblem("Couldn’t reach the site to save that. Check your connection and try again.");
          setRefused(key);
        })
        .finally(() => {
          if (mine === turn.current) setSending(false);
        });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [live, dirty, held, key, refused, value, roundId, programmeId]);

  const state: SaveState = held ? "waiting" : problem ? "problem" : dirty || sending ? "saving" : "saved";

  return (
    <section id="who-finished" className={shared.card} aria-labelledby={`${ids}-title`}>
      <div className={styles.head}>
        <h2 id={`${ids}-title`} className={shared.cardTitle}>
          {RULE_CARD_TITLE}
        </h2>
        <SavedStatus state={state} problem={held ?? problem} />
      </div>
      <div className={styles.body}>
        <label htmlFor={`${ids}-at-least`} className={shared.label}>
          {RULE_LABEL}
        </label>
        <div className={styles.row}>
          <input
            id={`${ids}-at-least`}
            type="text"
            inputMode="numeric"
            className={`${shared.input} ${styles.number}`}
            value={text}
            readOnly={!live}
            maxLength={2}
            aria-describedby={`${ids}-hint`}
            onChange={(event) => {
              setText(event.target.value);
              setRefused(null);
            }}
          />
          <span className={styles.unit}>{RULE_UNIT}</span>
        </div>
        <p id={`${ids}-hint`} className={shared.hint}>
          {ruleHint(stored.sessions)}
        </p>
      </div>
    </section>
  );
}
