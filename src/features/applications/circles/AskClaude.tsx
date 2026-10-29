"use client";

import { useState } from "react";
import CountedTextarea from "@/components/ui/CountedTextarea";
import type { SessionSlot } from "@/lib/admissions/availability";
import type { RingPerson } from "@/lib/applications/arrange/view";
import { own } from "@/lib/applications/keys";
import styles from "./Circles.module.css";
import {
  ASK_ABOUT,
  ASK_ABOUT_LIVE,
  ASK_ARIA,
  ASK_BUTTON,
  ASK_LINE_LIVE,
  ASK_LINE_PREVIEW,
  ASK_PLACEHOLDER,
  ASK_TAKES,
  ASK_THINKING,
  ASK_TITLE,
  ASK_YOU,
  A_GROUP,
  CONNECTION,
  LEFT_OUT,
  MOVE_TO,
  PREVIEWED,
  PREVIEW_MOVES,
  SOMEBODY,
} from "./circlesWords";

/**
 * ASK CLAUDE ABOUT THE GROUPS ON THE SCREEN (Circles): the run's groups as
 * they are, or the preview, changes included. The question goes to the
 * arrangement route, which swaps names for labels and keeps only moves that
 * fit; the moves it suggests are previewed on one press, never saved. The
 * conversation lives on this page; the last six turns go back with each
 * question.
 */

export type ScreenGroup = {
  key: string;
  name: string;
  session: SessionSlot;
  room: number;
  memberUids: string[];
  facilitators: { uid: string; role: "lead" | "second" }[];
};

export type Turn = {
  question: string;
  answer: string;
  moves: { uid: string; toKey: string; why: string }[];
  dropped: { suggestion: string; why: string }[];
  /** The preview option the question was about, or null for the run as it is. */
  about: string | null;
  /** What each group key was called when it was asked. */
  names: Record<string, string>;
  made: boolean;
};

export default function AskClaude({
  url,
  minutes,
  groups,
  about,
  people,
  disabled,
  onBusy,
  onPreview,
}: {
  /** The arrangement route. */
  url: string;
  minutes: number;
  groups: readonly ScreenGroup[];
  /** The preview option on the screen, or null for the run as it is. */
  about: string | null;
  people: Record<string, RingPerson>;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  /** Make a turn's moves in a preview: of the option it was about, or of the run as it is. */
  onPreview: (turn: Turn) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    onBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutes: String(minutes),
          ask: {
            question: question.trim(),
            history: turns.slice(-6).map((turn) => ({ question: turn.question, answer: turn.answer })),
            groups,
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : `It answered ${response.status}.`);
        return;
      }
      const said = data.ask as Pick<Turn, "answer" | "moves" | "dropped">;
      setTurns([
        ...turns,
        {
          question: question.trim(),
          ...said,
          about,
          names: Object.fromEntries(groups.map((group) => [group.key, group.name])),
          made: false,
        },
      ]);
      setQuestion("");
    } catch {
      setError(CONNECTION);
    } finally {
      setAsking(false);
      onBusy(false);
    }
  };

  return (
    <section className={styles.chat} aria-label={ASK_TITLE}>
      <h3 className={styles.chatTitle}>{ASK_TITLE}</h3>
      <p className={styles.line}>{about === null ? ASK_LINE_LIVE : ASK_LINE_PREVIEW(about)}</p>
      {turns.map((turn, i) => (
        <div key={i} className={styles.turn}>
          <p className={styles.question}>
            <strong>
              {ASK_YOU}
              {turn.about !== about ? (turn.about === null ? ASK_ABOUT_LIVE : ASK_ABOUT(turn.about)) : ""}:
            </strong>{" "}
            {turn.question}
          </p>
          <p className={styles.answer}>{turn.answer}</p>
          {turn.moves.length > 0 ? (
            <div className={styles.suggested}>
              <ul className={styles.list}>
                {turn.moves.map((move) => (
                  <li key={`${move.uid}:${move.toKey}`}>
                    {MOVE_TO(own(people, move.uid)?.name ?? SOMEBODY, own(turn.names, move.toKey) ?? A_GROUP, move.why)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={styles.small}
                disabled={disabled || asking || turn.made}
                onClick={() => {
                  onPreview(turn);
                  setTurns(turns.map((each, at) => (at === i ? { ...each, made: true } : each)));
                }}
              >
                {turn.made ? PREVIEWED : PREVIEW_MOVES(turn.moves.length)}
              </button>
            </div>
          ) : null}
          {turn.dropped.length > 0 ? (
            <p className={styles.line}>{LEFT_OUT(turn.dropped.map((d) => `${d.suggestion} (${d.why})`))}</p>
          ) : null}
        </div>
      ))}
      <CountedTextarea
        aria-label={ASK_ARIA}
        value={question}
        max={1000}
        rows={3}
        disabled={disabled || asking}
        placeholder={ASK_PLACEHOLDER}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={disabled || asking || !question.trim()} onClick={() => void ask()}>
          {asking ? ASK_THINKING : ASK_BUTTON}
        </button>
        {asking ? <span className={styles.line}>{ASK_TAKES}</span> : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
