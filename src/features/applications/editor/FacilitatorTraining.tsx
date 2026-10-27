"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { FACILITATING_LIMITS, isDateKey, isTime } from "@/lib/courses/facilitatorAsks/model";
import {
  TRAINING_CARD_TITLE,
  TRAINING_DAY_LABEL,
  TRAINING_HINT,
  TRAINING_ROOM_LABEL,
  TRAINING_TIME_LABEL,
  TRAINING_INCOMPLETE,
} from "@/lib/courses/facilitatorAsks/words";
import { SavedStatus, type SaveState } from "./controls";
import shared from "./editor.module.css";
// The Settings tab's own stylesheet: this card is a part of that tab.
import styles from "./ProgrammeSetup.module.css";

/**
 * THE FACILITATORS' TRAINING, on the programme's Settings tab, for its lead
 * and admins: a setting of the run the programme names. A day, a time and a
 * room, all three; there is no default. The email that asks somebody to
 * facilitate, and the page they answer on, name it; with none set they
 * leave it out.
 *
 * SAVED AS THE REST OF SETTINGS IS: no Save button. Once all three are
 * filled, they are sent a moment after the last change; emptying all three
 * clears it; anything between is held back with a sentence. The fields are
 * read only until the page is live, so nothing typed before then is lost.
 */

const SAVE_DELAY_MS = 700;

export type TrainingSetting = { dateKey: string; time: string; room: string } | null;

function typed(day: string, time: string, room: string): TrainingSetting | "incomplete" {
  const trimmed = room.trim();
  if (!day && !time && !trimmed) return null;
  if (!isDateKey(day) || !isTime(time) || !trimmed) return "incomplete";
  return { dateKey: day, time, room: trimmed };
}

export default function FacilitatorTraining({
  roundId,
  programmeId,
  initial,
}: {
  roundId: string;
  programmeId: string;
  /** The training as stored, or null while none is set. */
  initial: TrainingSetting;
}) {
  const ids = useId();
  const live = useHydrated();
  const [stored, setStored] = useState<TrainingSetting>(initial);
  const [day, setDay] = useState(initial?.dateKey ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const turn = useRef(0);

  const value = typed(day, time, room);
  const held = value === "incomplete" ? TRAINING_INCOMPLETE : null;
  const key = JSON.stringify(value);
  const dirty = value !== "incomplete" && key !== JSON.stringify(stored);

  useEffect(() => {
    if (!live || !dirty || held || key === refused) return;
    const sent: TrainingSetting = value;
    const timer = setTimeout(() => {
      turn.current += 1;
      const mine = turn.current;
      setSending(true);
      fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/facilitators/training`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ training: sent }),
          // Sent without waiting, so it has to outlive the page: tests/fetch-keepalive.test.mjs.
          keepalive: true,
        },
      )
        .then(async (response) => {
          const answer = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (mine !== turn.current) return;
          if (!response.ok || !answer?.ok) {
            setProblem(answer?.error ?? "That didn’t save. Try again in a minute.");
            setRefused(key);
            return;
          }
          setStored(sent);
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
  const change = (set: (next: string) => void) => (next: string) => {
    set(next);
    setRefused(null);
    setProblem(null);
  };

  return (
    <section id="facilitators-training" className={shared.card} aria-labelledby={`${ids}-title`}>
      <div className={styles.ruleHead}>
        <h2 id={`${ids}-title`} className={shared.cardTitle}>
          {TRAINING_CARD_TITLE}
        </h2>
        <SavedStatus state={state} problem={held ?? problem} />
      </div>
      <p id={`${ids}-hint`} className={shared.hint}>
        {TRAINING_HINT}
      </p>
      <div className={styles.trainingFields}>
        <div className={styles.trainingField}>
          <label htmlFor={`${ids}-day`} className={shared.label}>
            {TRAINING_DAY_LABEL}
          </label>
          <input
            id={`${ids}-day`}
            type="date"
            className={shared.input}
            value={day}
            readOnly={!live}
            aria-describedby={`${ids}-hint`}
            onChange={(event) => change(setDay)(event.target.value)}
          />
        </div>
        <div className={styles.trainingField}>
          <label htmlFor={`${ids}-time`} className={shared.label}>
            {TRAINING_TIME_LABEL}
          </label>
          <input
            id={`${ids}-time`}
            type="time"
            className={shared.input}
            value={time}
            readOnly={!live}
            onChange={(event) => change(setTime)(event.target.value)}
          />
        </div>
        <div className={styles.trainingField}>
          <label htmlFor={`${ids}-room`} className={shared.label}>
            {TRAINING_ROOM_LABEL}
          </label>
          <input
            id={`${ids}-room`}
            type="text"
            className={shared.input}
            value={room}
            readOnly={!live}
            maxLength={FACILITATING_LIMITS.room}
            onChange={(event) => change(setRoom)(event.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
