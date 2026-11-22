"use client";

import { useId, useState } from "react";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import type { RunDetailsView, RunPanelView } from "@/lib/applications/handover/views";
import { COHORT_TERMS, COHORT_TERM_LABELS } from "@/lib/courses/cohortLabel";
import { START_DATE_READ_ONLY } from "@/lib/courses/groupPage/words";
import * as D from "@/lib/courses/runStands/details";
import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";
import { putRunDetails } from "./editorClient";
import shared from "./editor.module.css";
import styles from "./RunHandOver.module.css";

/**
 * THE RUN'S DETAILS, in the Course run section (admins only): its label,
 * academic year, cohort and the day week 1 starts, saved through the one
 * route that writes them with the older run editor's checks
 * (`checkRunDetails`, asked here first so a slip is said before the press,
 * and asked again by the server, which decides). Once the groups have gone
 * out the start date is words with the reason, and is not sent at all: the
 * route refuses a new one then whatever this page thought.
 *
 * Nobody is emailed. A new label is read wherever the run's label is read
 * from then on; nothing already sent changes.
 */
export default function RunDetails({
  roundId,
  programmeId,
  details,
  live,
  onSaved,
}: {
  roundId: string;
  programmeId: string;
  details: RunDetailsView;
  live: boolean;
  onSaved: (panel: RunPanelView) => void;
}) {
  const ids = useId();
  const [label, setLabel] = useState(details.label);
  const [academicYear, setAcademicYear] = useState(details.academicYear);
  const [cohortTerm, setCohortTerm] = useState(details.cohortTerm);
  const [cohortYear, setCohortYear] = useState(details.cohortYear);
  const [cohortNumber, setCohortNumber] = useState(details.cohortNumber);
  const [startDate, setStartDate] = useState(details.startDate);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy) return;
    const input: D.RunDetailsInput = {
      label,
      academicYear,
      cohortTerm,
      cohortYear,
      cohortNumber,
      ...(details.groupsGoneOut ? {} : { startDate }),
    };
    const checked = D.checkRunDetails(input);
    setSaved(false);
    if (!checked.ok) {
      setProblem(checked.error);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const answer = await putRunDetails(roundId, programmeId, input);
      setSaved(true);
      onSaved(answer.panel);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const idle = live && !busy;

  return (
    <div className={styles.part}>
      <h3 className={styles.partTitle}>{D.DETAILS_TITLE}</h3>
      <div className={styles.details}>
        <div className={shared.field}>
          <label htmlFor={`${ids}-label`} className={shared.label}>
            {D.LABEL_LABEL}
          </label>
          <input
            id={`${ids}-label`}
            className={shared.input}
            value={label}
            maxLength={COURSE_FIELD_LIMITS.runLabel}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor={`${ids}-year`} className={shared.label}>
            {D.YEAR_LABEL}
          </label>
          <input
            id={`${ids}-year`}
            className={shared.input}
            value={academicYear}
            maxLength={COURSE_FIELD_LIMITS.academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor={`${ids}-term`} className={shared.label}>
            {D.COHORT_TERM_LABEL}
          </label>
          <Select
            id={`${ids}-term`}
            className={shared.select}
            value={cohortTerm}
            onChange={(event) => setCohortTerm(event.target.value)}
          >
            <option value="">Not set</option>
            {COHORT_TERMS.map((term) => (
              <option key={term} value={term}>
                {COHORT_TERM_LABELS[term]}
              </option>
            ))}
          </Select>
        </div>
        <fieldset className={shared.fieldset} aria-describedby={`${ids}-cohort-hint`}>
          <legend className={shared.label}>{D.COHORT_YEAR_NUMBER_LABEL}</legend>
          <div className={styles.pair}>
            <input
              aria-label="Cohort year"
              className={shared.input}
              inputMode="numeric"
              value={cohortYear}
              onChange={(event) => setCohortYear(event.target.value)}
            />
            <input
              aria-label="Cohort number"
              className={shared.input}
              inputMode="numeric"
              value={cohortNumber}
              onChange={(event) => setCohortNumber(event.target.value)}
            />
          </div>
          <p id={`${ids}-cohort-hint`} className={shared.hint}>
            {D.COHORT_HINT}
          </p>
        </fieldset>
        <div className={`${shared.field} ${styles.wide}`}>
          {details.groupsGoneOut ? (
            <>
              <p className={shared.label}>{D.START_LABEL}</p>
              <p className={styles.line}>{details.startDateWords}</p>
              <p className={shared.hint}>{START_DATE_READ_ONLY}</p>
            </>
          ) : (
            <>
              <label htmlFor={`${ids}-start`} className={shared.label}>
                {D.START_LABEL}
              </label>
              <input
                id={`${ids}-start`}
                type="date"
                className={shared.input}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </>
          )}
        </div>
      </div>
      {problem && (
        <p className={`${shared.notice} ${shared.noticeProblem}`} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={kit.primary} disabled={!idle} onClick={() => void save()}>
          {busy ? D.SAVING_DETAILS : D.SAVE_DETAILS}
        </button>
        {saved && !busy && (
          <p className={styles.small} role="status">
            {D.DETAILS_SAVED}
          </p>
        )}
      </div>
    </div>
  );
}
