"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import DateTile from "@/components/ui/DateTile";
import { Field, Input } from "@/components/ui/Input";
import type { FormQuestion, RsvpAnswer } from "@/lib/firestore/events";
import FormRenderer from "./FormRenderer";
import { tileParts } from "./manageWords";
import styles from "./EventPreview.module.css";

type Props = {
  /** The event, for the way to the full preview page. */
  eventId: string;
  title: string;
  /** The start, or null while there is no date. */
  startAt: Date | null;
  /**
   * One line under the title, already worded by the editor: the time, and the
   * place as the public page says it. This component prints the line and
   * knows nothing of what is in it.
   */
  line: string;
  /** Short facts drawn as chips: "40 places", "Members only". */
  facts: string[];
  /** What stands where the form would be, when there is no form. */
  closed?: { title: string; words: string };
  /** The event's own questions, in order. */
  questions: FormQuestion[];
  /** A line above the form, for an event only people with an account can sign up to. */
  formNote?: string;
};

/**
 * The editor's preview: the event's card and its sign-up form, drawn from
 * what is in the editor right now, saved or not.
 *
 * It reads nothing and sends nothing. The boxes can be typed in, to see how a
 * question behaves, and what is typed lives in this component and goes
 * nowhere. The questions are drawn by the same renderer the public form
 * uses, so a question looks here as it will there. The real page, with a
 * form that does send, is one link away.
 */
export default function EventPreview({
  eventId,
  title,
  startAt,
  line,
  facts,
  closed,
  questions,
  formNote,
}: Props) {
  // Typed into the preview and never read by anything else.
  const [answers, setAnswers] = useState<Record<string, RsvpAnswer>>({});
  const tile = startAt ? tileParts(startAt) : null;

  return (
    <aside className={styles.preview} aria-label="Preview of the public event page">
      <div className={styles.head}>
        <span className={`meta ${styles.eyebrow}`}>Live preview</span>
        <Link
          href={`/events/manage/${eventId}/preview`}
          target="_blank"
          rel="noopener"
          className={styles.full}
        >
          <span>Open full preview</span>
          <ExternalIcon />
        </Link>
      </div>

      <div className={styles.frame}>
        <div className={styles.card}>
          {tile ? (
            <DateTile weekday={tile.weekday} day={tile.day} month={tile.month} size="md" />
          ) : (
            <span className={styles.noDate}>
              <span>No</span>
              <span>date</span>
            </span>
          )}
          <div className={styles.cardWords}>
            <h3 className={styles.cardTitle}>{title}</h3>
            <p className={styles.cardLine}>{line}</p>
            {facts.length > 0 && (
              <div className={styles.facts}>
                {facts.map((fact) => (
                  <Chip key={fact} tone="neutral">
                    {fact}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          {closed ? (
            <>
              <h3 className={styles.panelTitle}>{closed.title}</h3>
              <p className={styles.panelNote}>{closed.words}</p>
            </>
          ) : (
            <>
              <h3 className={styles.panelTitle}>Request a place</h3>
              {formNote && <p className={styles.panelNote}>{formNote}</p>}
              <div className={styles.form}>
                <Field id="preview-name" label="Name">
                  <Input id="preview-name" placeholder="Your name" autoComplete="off" />
                </Field>
                <Field id="preview-email" label="Email">
                  <Input
                    id="preview-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="off"
                  />
                </Field>
                {questions.length > 0 && (
                  <FormRenderer questions={questions} answers={answers} onChange={setAnswers} />
                )}
              </div>
              <div className={styles.send}>
                <Button size="sm" disabled>
                  Request a place
                </Button>
                <p className={styles.panelNote}>We’ll email to confirm your place.</p>
              </div>
            </>
          )}
        </div>
      </div>

      <p className={styles.foot}>Nothing you type in the preview is saved.</p>
    </aside>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 16L17 7M9 7h8v8" />
    </svg>
  );
}
