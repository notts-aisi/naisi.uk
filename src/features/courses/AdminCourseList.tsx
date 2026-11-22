"use client";

import type { ResponsiveSelectOption } from "@/components/ui/ResponsiveSelect";
import {
  COURSE_TRACKS,
  COURSE_TRACK_LABELS,
  type CourseRunDoc,
  type CourseRunStatus,
  type CourseStatus,
  type CourseTrack,
} from "@/lib/firestore/courses";

/*
 * The helpers the course pages share: a course's levels and tracks as the
 * selects offer them, the tones of a course's and a run's status, a run's
 * taught weeks and a civil date. The Courses list itself is
 * `CoursesList.tsx`; this file kept its name because the older run page and
 * the public page editor import these from it. Nothing here draws.
 */

/**
 * `courses.level` is a free-text difficulty line in the data model (see
 * `CourseDoc`), but leaving it as a bare text input across a catalogue is how
 * you end up with five spellings of "beginner". These are the house options;
 * an existing value that isn't one of them is preserved and appended to the
 * list rather than silently rewritten (see `levelOptions`).
 *
 * Shared by the Courses list and a course's page.
 */
export const COURSE_LEVEL_PRESETS = [
  "Open to all — no prior experience",
  "Some background helpful",
  "Technical background expected",
  "Advanced",
];

/** Preset levels plus `current`, so an off-list legacy value still round-trips. */
export function levelOptions(current: string): ResponsiveSelectOption[] {
  const values = COURSE_LEVEL_PRESETS.includes(current) || !current
    ? COURSE_LEVEL_PRESETS
    : [...COURSE_LEVEL_PRESETS, current];
  return [
    { value: "", label: "— pick a level —" },
    ...values.map((v) => ({ value: v, label: v })),
  ];
}

export const TRACK_OPTIONS: ResponsiveSelectOption<CourseTrack>[] = COURSE_TRACKS.map(
  (t) => ({ value: t, label: COURSE_TRACK_LABELS[t] }),
);

/** Draft and archived both read as "not live"; only published is a green light. */
export function courseStatusTone(status: CourseStatus): "neutral" | "success" {
  return status === "published" ? "success" : "neutral";
}

/**
 * Run status tone. Cancelled is the only danger case — a completed run is a
 * normal end state, not a failure.
 */
export function runStatusTone(
  status: CourseRunStatus,
): "neutral" | "accent" | "success" | "danger" {
  switch (status) {
    case "applications-open":
      return "accent";
    case "running":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

/** Taught weeks in a run's plan — breaks are calendar padding, not curriculum. */
export function taughtWeekCount(run: CourseRunDoc): number {
  return run.weekPlan.filter((e) => e.kind === "week").length;
}

/** "12 Oct 2026" from a civil "YYYY-MM-DD" key, read as UTC so it can't slip a day. */
export function formatCivilDate(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "no start date";
  const ms = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(ms)) return "no start date";
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

