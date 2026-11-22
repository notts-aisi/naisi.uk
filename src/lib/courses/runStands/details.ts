/**
 * THE RUN'S DETAILS ON A PROGRAMME'S SETTINGS: its label, academic year,
 * cohort and start date. The words of the form, and the checks the route
 * makes on what it is sent, which are the older run editor's (`saveMeta` in
 * `src/features/courses/RunEditor.tsx`, with `updateRun`'s caps), in the
 * same order:
 *
 *  1. a label, trimmed, capped at the run label's length;
 *  2. an academic year like 2026/27;
 *  3. a start date that is a real date, when one is sent (none is once the
 *     groups have gone out: the route refuses a new one then itself);
 *  4. the cohort, all three of term, year and number or none, the year and
 *     the number within their bounds.
 *
 * Pure: the form and the route share it.
 */

import { COHORT_LIMITS, COHORT_TERMS, type CohortTerm, type RunCohort } from "@/lib/courses/cohortLabel";
import { isValidDateKey } from "@/lib/courses/weekPlan";
import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";

export const DETAILS_TITLE = "The run’s details";
export const LABEL_LABEL = "Run label";
export const YEAR_LABEL = "Academic year";
export const COHORT_TERM_LABEL = "Cohort term";
export const COHORT_YEAR_NUMBER_LABEL = "Cohort year and number";
export const COHORT_HINT = "The course’s public page shows it.";
export const START_LABEL = "Week 1 starts";
export const SAVE_DETAILS = "Save the run’s details";
export const SAVING_DETAILS = "Saving…";
export const DETAILS_SAVED = "Run details saved";

export const NEED_LABEL = "Give the run a label, e.g. Autumn 2026.";
export const NEED_YEAR = "Academic year must look like 2026/27.";
export const NEED_START = "Start date must be a real date: every run needs one.";
export const COHORT_ALL_OR_NONE = "Give the cohort a term, a year and a number, or leave all three blank.";
export const COHORT_YEAR_BOUNDS = `Cohort year must be between ${COHORT_LIMITS.minYear} and ${COHORT_LIMITS.maxYear}.`;
export const COHORT_NUMBER_BOUNDS = `Cohort number must be between ${COHORT_LIMITS.minNumber} and ${COHORT_LIMITS.maxNumber}.`;

/** The academic year's shape, the paid-membership tag's ("2026/27"). */
const ACADEMIC_YEAR = /^\d{4}\/\d{2}$/;

/** What the form sends: its fields as typed. `startDate` is left out once the groups have gone out. */
export type RunDetailsInput = {
  label: string;
  academicYear: string;
  cohortTerm: string;
  cohortYear: string;
  cohortNumber: string;
  startDate?: string;
};

export type RunDetailsPatch = {
  label: string;
  academicYear: string;
  /** Null clears the cohort (the route deletes the field: never a stored null). */
  cohort: RunCohort | null;
  /** Absent when none was sent. */
  startDate?: string;
};

const text = (raw: unknown): string => (typeof raw === "string" ? raw : "");

/** Read a request body into the form's fields, or null when it is not one. */
export function readDetailsInput(raw: unknown): RunDetailsInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  for (const key of ["label", "academicYear", "cohortTerm", "cohortYear", "cohortNumber"]) {
    if (typeof body[key] !== "string") return null;
  }
  if (body.startDate !== undefined && typeof body.startDate !== "string") return null;
  return {
    label: text(body.label),
    academicYear: text(body.academicYear),
    cohortTerm: text(body.cohortTerm),
    cohortYear: text(body.cohortYear),
    cohortNumber: text(body.cohortNumber),
    ...(body.startDate !== undefined ? { startDate: text(body.startDate) } : {}),
  };
}

/** The checks above, in order: the patch to write, or the first sentence that refuses it. */
export function checkRunDetails(input: RunDetailsInput): { ok: true; patch: RunDetailsPatch } | { ok: false; error: string } {
  const label = input.label.trim().slice(0, COURSE_FIELD_LIMITS.runLabel).trim();
  if (!label) return { ok: false, error: NEED_LABEL };
  const academicYear = input.academicYear.trim();
  if (!ACADEMIC_YEAR.test(academicYear)) return { ok: false, error: NEED_YEAR };
  const startDate = input.startDate === undefined ? undefined : input.startDate.trim();
  if (startDate !== undefined && !isValidDateKey(startDate)) return { ok: false, error: NEED_START };

  const term = input.cohortTerm.trim();
  const yearText = input.cohortYear.trim();
  const numberText = input.cohortNumber.trim();
  const filled = [term, yearText, numberText].filter(Boolean).length;
  if (filled > 0 && filled < 3) return { ok: false, error: COHORT_ALL_OR_NONE };
  let cohort: RunCohort | null = null;
  if (filled === 3) {
    if (!COHORT_TERMS.includes(term as CohortTerm)) return { ok: false, error: COHORT_ALL_OR_NONE };
    const year = Number(yearText);
    if (!Number.isInteger(year) || year < COHORT_LIMITS.minYear || year > COHORT_LIMITS.maxYear) {
      return { ok: false, error: COHORT_YEAR_BOUNDS };
    }
    const number = Number(numberText);
    if (!Number.isInteger(number) || number < COHORT_LIMITS.minNumber || number > COHORT_LIMITS.maxNumber) {
      return { ok: false, error: COHORT_NUMBER_BOUNDS };
    }
    cohort = { term: term as CohortTerm, year, number };
  }
  return { ok: true, patch: { label, academicYear, cohort, ...(startDate !== undefined ? { startDate } : {}) } };
}
