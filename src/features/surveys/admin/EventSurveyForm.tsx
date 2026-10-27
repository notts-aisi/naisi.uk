"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import OptionRow from "@/components/ui/OptionRow";
import Select from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { TEMPLATE_WORDS } from "@/lib/surveys/events/words";
import styles from "./surveyAdmin.module.css";

/** An event New survey offers, as the card lists it. */
export type EventOption = {
  eventId: string;
  /** "VR games night · Sun 1 Nov". */
  label: string;
  /** Nobody signs up for it, so its survey goes only to the people who came. */
  noSignup: boolean;
  /** Why it cannot have one, or "" when it can. */
  blocked: string;
};

/**
 * New survey's "After a social" card (sv-new): the survey after an event. An
 * admin picks the event, who its email goes to and the day it closes; the
 * rest is the template's, every word of it changeable on the next page until
 * the survey opens.
 *
 * Uncontrolled boxes read when the form is sent, and the button is disabled
 * until the page's script has arrived, so nothing picked early is lost.
 */
export default function EventSurveyForm({
  size,
  events,
  picked,
  today,
}: {
  /** "5 questions · about a minute", the template's. */
  size: string;
  events: EventOption[];
  /** The event to start on, when the page was opened from one. */
  picked: string | null;
  /** "YYYY-MM-DD" in London: the earliest closing day. */
  today: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = events.filter((event) => !event.blocked);
  const blocked = events.filter((event) => event.blocked);
  const start = open.find((event) => event.eventId === picked) ?? open[0];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "event",
          eventId: String(data.get("eventId") ?? ""),
          audience: String(data.get("audience") ?? ""),
          closesOn: String(data.get("closesOn") ?? ""),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; survey?: { id?: string } };
      if (!response.ok || !result.survey?.id) {
        setError(result.error ?? "That survey couldn’t be made. Try again in a minute.");
        setBusy(false);
        return;
      }
      router.push(`/admin/surveys/${encodeURIComponent(result.survey.id)}/questions`);
    } catch {
      setError("That survey couldn’t be made. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.card} ${styles.template}`} aria-labelledby={`${id}-title`} id="after-a-social">
      <div className={styles.templateHead}>
        <h2 id={`${id}-title`} className={styles.templateTitle}>
          {TEMPLATE_WORDS.card}
        </h2>
        <Chip tone="accent" size="sm">
          Confidential
        </Chip>
      </div>
      <p className={styles.muted}>
        {size}. {TEMPLATE_WORDS.line}
      </p>
      {!start ? (
        <p className={styles.lead}>{TEMPLATE_WORDS.none}</p>
      ) : (
        <form className={styles.section} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-event`}>
              {TEMPLATE_WORDS.event}
            </label>
            <Select id={`${id}-event`} name="eventId" defaultValue={start.eventId}>
              {open.map((event) => (
                <option key={event.eventId} value={event.eventId}>
                  {event.label}
                </option>
              ))}
            </Select>
          </div>
          <fieldset className={`${styles.field} ${styles.plainFieldset}`}>
            <legend className={styles.label}>{TEMPLATE_WORDS.who}</legend>
            <div className={styles.editRows}>
              <OptionRow type="radio" name="audience" value="came" defaultChecked>
                {TEMPLATE_WORDS.came}
              </OptionRow>
              <OptionRow type="radio" name="audience" value="signups">
                {TEMPLATE_WORDS.signups}
              </OptionRow>
            </div>
            <p className={styles.muted}>You can change who it emails on its Send tab until the email goes.</p>
          </fieldset>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-closes`}>
              {TEMPLATE_WORDS.closes}
            </label>
            <Input id={`${id}-closes`} name="closesOn" type="date" min={today} required />
            <p className={styles.muted}>{TEMPLATE_WORDS.closesNote}</p>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <Button type="submit" disabled={!hydrated || busy}>
              {busy ? TEMPLATE_WORDS.making : TEMPLATE_WORDS.make}
            </Button>
          </div>
        </form>
      )}
      {blocked.length > 0 && (
        <div className={styles.section}>
          {blocked.map((event) => (
            <p key={event.eventId} className={styles.muted}>
              {event.label}: {event.blocked}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
