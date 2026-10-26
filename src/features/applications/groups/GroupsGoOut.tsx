"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { SavedStatus, type SaveState } from "@/features/applications/editor/controls";
import styles from "./GroupsGoOut.module.css";

/**
 * WHEN GROUPS GO OUT, on the programme's Groups tab beside its sessions, for
 * its lead and admins: the day the people holding a place are planned to get
 * the email with their group, day and room. It is the run's setting, set
 * where the run's groups are set up (their days, times and rooms). Empty is no day. Every sentence that names
 * the day reads it (Home's "Your group’s on its way", week 1's line, the
 * application page's "When you’re free", the programme's head); with none,
 * each says it without a day.
 *
 * SAVED AS THE REST OF SETTINGS IS: no Save button, the day is sent a moment
 * after it changes, and the line beside the title says "Saved", "Saving…" or
 * what is stopping it. The box is read only until the page is live, so
 * nothing chosen before then is written over.
 *
 * The words of this card are not drawn on the boards: listed in the build
 * notes for the boards' designers to confirm.
 */

const SAVE_DELAY_MS = 700;

/** What is in the box: empty is no day, a whole date is a day, anything else is held back. */
function typed(text: string): string | null | "bad" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "bad";
}

export default function GroupsGoOut({
  roundId,
  programmeId,
  initial,
}: {
  roundId: string;
  programmeId: string;
  /** The day as stored, "YYYY-MM-DD", or null while there is none. */
  initial: string | null;
}) {
  const ids = useId();
  const live = useHydrated();
  const [stored, setStored] = useState<string | null>(initial);
  const [text, setText] = useState(initial ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  /** The value the server last refused, so it is not sent again until it changes. */
  const [refused, setRefused] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const turn = useRef(0);

  const value = typed(text);
  const held = value === "bad" ? "Not saved yet. Pick a whole date, or clear the box." : null;
  const dirty = value !== "bad" && value !== stored;
  const key = JSON.stringify(value);

  useEffect(() => {
    if (!live || !dirty || held || key === refused) return;
    const timer = setTimeout(() => {
      turn.current += 1;
      const mine = turn.current;
      setSending(true);
      fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups-go-out`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ on: value }),
        },
      )
        .then(async (response) => {
          const answer = (await response.json().catch(() => null)) as { on?: string | null; error?: string } | null;
          if (mine !== turn.current) return;
          if (!response.ok || !answer || answer.on === undefined) {
            setProblem(answer?.error ?? "That didn’t save. Try again in a minute.");
            setRefused(key);
            return;
          }
          setStored(answer.on);
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
    <section id="groups-go-out" className={styles.card} aria-labelledby={`${ids}-title`}>
      <div className={styles.head}>
        <h2 id={`${ids}-title`} className={styles.title}>
          When groups go out
        </h2>
        <SavedStatus state={state} problem={held ?? problem} />
      </div>
      <div className={styles.body}>
        <label htmlFor={`${ids}-on`} className={styles.label}>
          Groups go out on
        </label>
        <div className={styles.row}>
          <input
            id={`${ids}-on`}
            type="date"
            className={styles.dayInput}
            value={text}
            readOnly={!live}
            aria-describedby={`${ids}-hint`}
            onChange={(event) => {
              setText(event.target.value);
              setRefused(null);
              setProblem(null);
            }}
          />
        </div>
        <p id={`${ids}-hint`} className={styles.hint}>
          The day everyone holding a place gets the email with their group, day and room. Home, week 1 and their
          application say it. Until then they can change when they’re free. Leave it empty until you know.
        </p>
      </div>
    </section>
  );
}
