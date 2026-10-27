"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { TeamHandInsView } from "@/lib/courses/teamPage/views";
import {
  HAND_INS,
  HAND_INS_DUE,
  HAND_IN_DATES_HINT,
  HAND_IN_DATES_SAVED,
  NOT_SAVED,
  NOT_SET,
  OFFLINE,
  READ_THE_TEAMS_PAGE,
  SAVE_HAND_IN_DATES,
  SAVING,
  SHOWCASE_IS_IN,
} from "@/lib/courses/teamPage/words";
import styles from "./team.module.css";

/**
 * THE TEAMS TAB'S "HAND-INS", for the programme's lead and admins: the day
 * hand-ins are due and the week of the showcase, which they set here, and
 * every team's hand-in as it stands, with the way to each team's page.
 *
 * The dates' boxes are uncontrolled and their button waits for the page's
 * script (`useHydrated`). A save sends both, a blank one as cleared, and the
 * tab is drawn again from the server. Nothing here writes on a team's page.
 */

export default function TeamHandIns({ view }: { view: TeamHandInsView }) {
  const id = useId();
  const hydrated = useHydrated();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const teamsTab = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/teams`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.current || busy) return;
    const data = new FormData(form.current);
    const due = String(data.get("dueOn") ?? "").trim();
    const week = String(data.get("showcaseWeek") ?? "");
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const response = await fetch(
        `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/teams/hand-in`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dueOn: due || null, showcaseWeek: week ? Number(week) : null }),
        },
      );
      const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (response.ok) {
        setSaid(HAND_IN_DATES_SAVED);
        router.refresh();
      } else {
        setProblem(typeof answer.error === "string" ? answer.error : NOT_SAVED);
      }
    } catch {
      setProblem(OFFLINE);
    }
    setBusy(false);
  }

  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={`${styles.h2} ${styles.h2Spaced}`}>
        {HAND_INS}
      </h2>
      <form ref={form} onSubmit={save} noValidate className={styles.datesForm}>
        <div className={styles.dateField}>
          <label htmlFor={`${id}-due`} className={styles.label}>
            {HAND_INS_DUE}
          </label>
          <input
            id={`${id}-due`}
            name="dueOn"
            type="date"
            className={styles.input}
            defaultValue={view.dueOn ?? ""}
          />
        </div>
        <div className={styles.dateField}>
          <label htmlFor={`${id}-week`} className={styles.label}>
            {SHOWCASE_IS_IN}
          </label>
          <Select id={`${id}-week`} name="showcaseWeek" defaultValue={view.showcaseWeek ? String(view.showcaseWeek) : ""}>
            <option value="">{NOT_SET}</option>
            {view.weeks.map((week) => (
              <option key={week.weekNumber} value={String(week.weekNumber)}>
                {week.label}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.dateSave}>
          <button type="submit" className={styles.button} disabled={!hydrated || busy}>
            {busy ? SAVING : SAVE_HAND_IN_DATES}
          </button>
        </div>
      </form>
      <p className={styles.quiet}>{HAND_IN_DATES_HINT}</p>
      <p className={styles.text}>{view.asks}</p>
      {said ? (
        <p className={styles.said} role="status">
          {said}
        </p>
      ) : null}
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {view.rows.length > 0 ? (
        <ul className={styles.checkInList}>
          {view.rows.map((row) => (
            <li key={row.teamId} className={styles.checkInItem}>
              <h3 className={styles.rowTeam}>{row.name}</h3>
              <p className={styles.quiet}>{row.state}</p>
              {row.entry ? (
                <>
                  <a className={styles.rowLink} href={row.entry.url} target="_blank" rel="noopener noreferrer">
                    {row.entry.shown}
                  </a>
                  <p className={styles.text}>{row.entry.summary}</p>
                  {row.entry.whoDidWhat ? <p className={styles.quiet}>{row.entry.whoDidWhat}</p> : null}
                </>
              ) : null}
              <Link href={`${teamsTab}/${encodeURIComponent(row.teamId)}`} className={styles.cardLink}>
                {READ_THE_TEAMS_PAGE}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
