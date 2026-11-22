"use client";

import { useId, useState } from "react";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import type { RunPanelView } from "@/lib/applications/handover/views";
import { COHORT_TERMS, COHORT_TERM_LABELS } from "@/lib/courses/cohortLabel";
import * as D from "@/lib/courses/runStands/details";
import * as W from "@/lib/courses/runCareful/words";
import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";
import { currentAcademicYear } from "@/lib/firestore/users";
import { postNewRun } from "./editorClient";
import shared from "./editor.module.css";
import styles from "./RunHandOver.module.css";

/**
 * MAKE A NEW RUN OF THE PROGRAMME'S COURSE, in the Course run section
 * (admins only), where the programme names no run. The form asks what the
 * older course editor's New run asked (label, academic year, the day week 1
 * starts) and the cohort, with the run's details form's own checks, asked
 * here first and again by the route, which decides. The run starts as a
 * draft named on this programme. Nobody is emailed.
 */
export default function RunMake({
  roundId,
  programmeId,
  programmeName,
  live,
  onMade,
}: {
  roundId: string;
  programmeId: string;
  programmeName: string;
  live: boolean;
  /** The section as the route read it after the run was made, and the sentence to say. */
  onMade: (panel: RunPanelView, said: string) => void;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [academicYear, setAcademicYear] = useState(() => currentAcademicYear());
  const [cohortTerm, setCohortTerm] = useState("");
  const [cohortYear, setCohortYear] = useState("");
  const [cohortNumber, setCohortNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const title = W.makeRunWords(programmeName);

  function close() {
    if (busy) return;
    setOpen(false);
    setProblem(null);
  }

  async function make() {
    if (busy) return;
    const input: D.RunDetailsInput = { label, academicYear, cohortTerm, cohortYear, cohortNumber, startDate };
    const checked = D.checkRunDetails(input);
    if (!checked.ok) {
      setProblem(checked.error);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const answer = await postNewRun(roundId, programmeId, input);
      setOpen(false);
      onMade(answer.panel, W.madeWords(answer.label));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.actions}>
        <button
          type="button"
          className={kit.primary}
          disabled={!live}
          onClick={() => {
            setProblem(null);
            setOpen(true);
          }}
        >
          {title}
        </button>
      </div>

      <Modal open={open} onClose={close} ariaLabel={title} width="md" sheet>
        <div className={styles.dialog}>
          <h2 className={styles.dialogTitle}>{title}</h2>
          <div className={styles.formGrid}>
            <div className={`${shared.field} ${styles.wide}`}>
              <label htmlFor={`${ids}-label`} className={shared.label}>
                {D.LABEL_LABEL}
              </label>
              <input
                id={`${ids}-label`}
                className={shared.input}
                value={label}
                maxLength={COURSE_FIELD_LIMITS.runLabel}
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
            <fieldset className={shared.fieldset}>
              <legend className={shared.label}>{D.COHORT_YEAR_NUMBER_LABEL}</legend>
              <div className={styles.pair}>
                <input
                  aria-label="Cohort year"
                  className={shared.input}
                  inputMode="numeric"
                  value={cohortYear}
                  disabled={busy}
                  onChange={(event) => setCohortYear(event.target.value)}
                />
                <input
                  aria-label="Cohort number"
                  className={shared.input}
                  inputMode="numeric"
                  value={cohortNumber}
                  disabled={busy}
                  onChange={(event) => setCohortNumber(event.target.value)}
                />
              </div>
            </fieldset>
            <div className={shared.field}>
              <label htmlFor={`${ids}-start`} className={shared.label}>
                {D.START_LABEL}
              </label>
              <input
                id={`${ids}-start`}
                type="date"
                className={shared.input}
                value={startDate}
                disabled={busy}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
          </div>
          <p className={styles.small}>{W.MAKE_NOTE}</p>
          {problem && (
            <p className={styles.dialogProblem} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.quiet} disabled={busy} onClick={close}>
              {W.MAKE_CANCEL}
            </button>
            <button type="button" className={kit.primary} disabled={busy} onClick={() => void make()}>
              {busy ? W.MAKING : W.MAKE_CONFIRM}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
