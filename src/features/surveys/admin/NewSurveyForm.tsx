"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import OptionRow from "@/components/ui/OptionRow";
import Select from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./surveyAdmin.module.css";

/** A programme a survey of one stage can be made for, as the page lists them. */
export type ProgrammeOption = {
  roundId: string;
  programmeId: string;
  name: string;
  formName: string;
  kind: "fellowship" | "incubator";
  /** Why it cannot have one yet, or "" when it can. */
  blocked: string;
};

/** One way an incubator's skills question can start. */
export type StrandOption = { value: string; words: string };

/**
 * New survey (sv-new), one card per template: a programme's survey before
 * it, at its end, and the follow-ups 6 and 12 months on. An admin picks the
 * programme and the day it closes, and for an incubator which research it
 * does; the rest is the template's, and every word can be changed on the next
 * page until it is sent.
 *
 * Uncontrolled boxes read when the form is sent, and the button is disabled
 * until the page's script has arrived, so nothing typed early is lost.
 */
export default function NewSurveyForm({
  stage,
  heading,
  line,
  size,
  programmes,
  strands,
  today,
}: {
  stage: string;
  heading: string;
  line: string;
  /** "14 questions · about 5 minutes", the template's. */
  size: string;
  programmes: ProgrammeOption[];
  /** The incubator wordings, offered when an incubator is on the list; empty otherwise. */
  strands: StrandOption[];
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
  const offersStrand = strands.length > 0 && open.some((programme) => programme.kind === "incubator");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const [roundId = "", programmeId = ""] = String(data.get("programme") ?? "").split("|");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          programmeId,
          stage,
          closesOn: String(data.get("closesOn") ?? ""),
          strand: String(data.get("strand") ?? "") || null,
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
    <section className={`${styles.card} ${styles.template}`} aria-labelledby={`${id}-title`}>
      <div className={styles.templateHead}>
        <h2 id={`${id}-title`} className={styles.templateTitle}>
          {heading}
        </h2>
        <Chip tone="accent" size="sm">
          Confidential
        </Chip>
      </div>
      <p className={styles.muted}>
        {size}. {line}
      </p>
      {open.length === 0 ? (
        <p className={styles.lead}>No programme can have this survey yet.</p>
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
          {offersStrand && (
            <fieldset className={`${styles.field} ${styles.plainFieldset}`}>
              <legend className={styles.label}>For an incubator: the first line of its skills question</legend>
              <p className={styles.muted}>A fellowship doesn’t ask it. Left blank, an incubator’s survey at the end takes its before survey’s.</p>
              <div className={styles.editRows}>
                {strands.map((strand) => (
                  <OptionRow key={strand.value} type="radio" name="strand" value={strand.value}>
                    {strand.words}
                  </OptionRow>
                ))}
              </div>
            </fieldset>
          )}
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
