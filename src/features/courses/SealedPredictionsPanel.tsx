"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { PredictionsPeopleAnswer } from "@/app/api/courses/runs/[runId]/predictions/people/route";
import { own } from "@/lib/applications/keys";
import type { AdminPredictionsCard, AdminPredictionsRow } from "@/lib/courses/predictions/wire";
import {
  CLOSE_CARD,
  NO_ANSWER,
  OPEN_CARD,
  PANEL_AGAIN,
  PANEL_EMPTY,
  PANEL_FIRST,
  PANEL_HINT,
  PANEL_RECORDED,
  PANEL_TITLE,
  answerWords,
  openCardLabel,
  panelStateWords,
  weekColumnWords,
} from "@/lib/courses/predictions/words";
import styles from "./adminCourses.module.css";
import panel from "./sealedPredictionsPanel.module.css";

/**
 * SEALED PREDICTIONS ON THE RUN, FOR AN ADMIN (the run editor; Zach's extra
 * (d): the person and admins at any time, nobody else). Who has started a
 * card, sealed it or opened it, by name, and never an answer until an admin
 * presses "Open card" for one person: that press is recorded before the card
 * is read (`/api/courses/runs/[runId]/predictions/people/[uid]`), and the
 * card is shown here with both weeks' answers.
 *
 * Rendered for admins only; both routes refuse everybody else. No board
 * draws it: its words are listed for the boards' designers.
 */
export default function SealedPredictionsPanel({ runId }: { runId: string }) {
  const [people, setPeople] = useState<AdminPredictionsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<AdminPredictionsCard | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  // Who has a card: read once the panel is drawn, every state set after the answer.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/predictions/people`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as (PredictionsPeopleAnswer & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error ?? "Couldn’t load the cards. Try again.");
        if (!cancelled) setPeople(body.people);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn’t load the cards. Try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const open = async (uid: string) => {
    setOpening(uid);
    setError(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/predictions/people/${encodeURIComponent(uid)}`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as { card?: AdminPredictionsCard; error?: string } | null;
      if (!res.ok || !body?.card) throw new Error(body?.error ?? "Couldn’t open that card. Try again.");
      setOpened(body.card);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t open that card. Try again.");
    } finally {
      setOpening(null);
    }
  };

  return (
    <Card padding="lg">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{PANEL_TITLE}</h2>
          <p className={styles.sectionHint}>{PANEL_HINT}</p>
        </div>
        {people === null && !error && <p className={panel.line}>Loading…</p>}
        {people !== null && people.length === 0 && <p className={panel.line}>{PANEL_EMPTY}</p>}
        {people !== null && people.length > 0 && (
          <ul className={panel.people} role="list">
            {people.map((person) => (
              <li key={person.uid} className={panel.person}>
                <span className={panel.name}>{person.name}</span>
                <span className={panel.state}>{panelStateWords(person.sealedAt, person.openedAt)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={openCardLabel(person.name)}
                  onClick={() => void open(person.uid)}
                  disabled={opening !== null}
                >
                  {OPEN_CARD}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {opened && <OpenedCard card={opened} onClose={() => setOpened(null)} />}
      </section>
    </Card>
  );
}

function OpenedCard({ card, onClose }: { card: AdminPredictionsCard; onClose: () => void }) {
  const questions = card.card?.questions ?? [];
  const first = card.sealWeek ? weekColumnWords(card.sealWeek) : PANEL_FIRST;
  const second = card.openWeek ? weekColumnWords(card.openWeek) : PANEL_AGAIN;
  return (
    <div className={panel.opened} role="region" aria-label={`${card.name}: ${PANEL_TITLE}`}>
      <div className={panel.openedHead}>
        <p className={panel.openedName}>{card.name}</p>
        <p className={panel.state}>{panelStateWords(card.start.sealedAt, card.now.openedAt)}</p>
      </div>
      {card.card?.title && <p className={panel.title}>{card.card.title}</p>}
      <ol className={panel.questions} role="list">
        {questions.map((question) => (
          <li key={question.id} className={panel.question}>
            <p className={panel.statement}>
              {question.number && <span className={panel.number}>{question.number}</span>}
              <span>{question.statement}</span>
            </p>
            <dl className={panel.pair}>
              <div className={panel.pairCell}>
                <dt className={panel.pairLabel}>{first}</dt>
                <dd className={panel.pairValue}>{answerWords(question, own(card.start.answers, question.id))}</dd>
              </div>
              <div className={panel.pairCell}>
                <dt className={panel.pairLabel}>{second}</dt>
                <dd className={panel.pairValue}>{answerWords(question, own(card.now.answers, question.id))}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
      {questions.length === 0 && <p className={panel.line}>{NO_ANSWER}</p>}
      <p className={panel.line}>{PANEL_RECORDED}</p>
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {CLOSE_CARD}
        </Button>
      </div>
    </div>
  );
}
