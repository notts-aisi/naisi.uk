"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Select from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./surveyAdmin.module.css";

/** A programme the form can make a before survey for, as the page lists them. */
export type ProgrammeOption = {
  roundId: string;
  programmeId: string;
  name: string;
  formName: string;
  /** Why it cannot have one yet, or "" when it can. */
  blocked: string;
};

/**
 * New survey (sv-new), from the one template built: the before survey of a
 * programme. An admin picks the programme, types the lines of question 4
 * (what people could explain, one line a week) and the day it closes; the
 * rest is the template's, and every word can be changed on the next page
 * until it is sent.
 *
 * Uncontrolled boxes read when the form is sent, and the button is disabled
 * until the page's script has arrived, so nothing typed early is lost.
 */
export default function NewSurveyForm({
  programmes,
  lineCount,
  size,
  today,
}: {
  programmes: ProgrammeOption[];
  lineCount: number;
  /** "6 questions · about 3 minutes", the template's. */
  size: string;
  /** "YYYY-MM-DD" in London: the earliest closing day. */
  today: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = programmes.filter((programme) => !programme.blocked);
  const blocked = programmes.filter((programme) => programme.blocked);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const [roundId = "", programmeId = ""] = String(data.get("programme") ?? "").split("|");
    const lines = Array.from({ length: lineCount }, (_, i) => String(data.get(`line${i}`) ?? ""));
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, programmeId, lines, closesOn: String(data.get("closesOn") ?? "") }),
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
    <section className={`${styles.card} ${styles.template}`} aria-labelledby={`${id}-title`}>
      <div className={styles.templateHead}>
        <h2 id={`${id}-title`} className={styles.templateTitle}>
          The before survey
        </h2>
        <Chip tone="accent" size="sm">
          Confidential
        </Chip>
      </div>
      <p className={styles.muted}>
        {size}. Beliefs about AI, confidence and knowledge, career plans, asked in week 1 and again at the end.
      </p>
      {open.length === 0 ? (
        <p className={styles.lead}>No programme can have a before survey yet.</p>
      ) : (
        <form className={styles.section} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-programme`}>
              Programme
            </label>
            <Select id={`${id}-programme`} name="programme" defaultValue={`${open[0].roundId}|${open[0].programmeId}`}>
              {open.map((programme) => (
                <option key={`${programme.roundId}|${programme.programmeId}`} value={`${programme.roundId}|${programme.programmeId}`}>
                  {programme.name} ({programme.formName})
                </option>
              ))}
            </Select>
          </div>
          <fieldset className={`${styles.field} ${styles.plainFieldset}`}>
            <legend className={styles.label}>Question 4: How confident would you be explaining these to a friend?</legend>
            <p className={styles.muted}>One line for each week from 2 to 6, in the programme’s own words.</p>
            <div className={styles.editRows}>
              {Array.from({ length: lineCount }, (_, i) => (
                <Input key={i} name={`line${i}`} aria-label={`Line ${i + 1}`} maxLength={120} required />
              ))}
            </div>
          </fieldset>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-closes`}>
              It closes on
            </label>
            <Input id={`${id}-closes`} name="closesOn" type="date" min={today} required />
            <p className={styles.muted}>At 23:59 that day. You can change it until you send it.</p>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <Button type="submit" disabled={!hydrated || busy}>
              {busy ? "Making it…" : "Make the survey"}
            </Button>
          </div>
        </form>
      )}
      {blocked.length > 0 && (
        <div className={styles.section}>
          {blocked.map((programme) => (
            <p key={`${programme.roundId}|${programme.programmeId}`} className={styles.muted}>
              {programme.name} ({programme.formName}): {programme.blocked}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
