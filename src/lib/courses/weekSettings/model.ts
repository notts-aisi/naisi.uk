/**
 * A WEEK'S SETTINGS, CHECKED: the title, the summary, the pitching week tick
 * and the questions to think about, as one save on a week's page on a
 * programme's Weeks tab (`PUT /api/courses/runs/[runId]/weeks/[weekId]/settings`).
 *
 * Every check the older week page made on each field stays, with the limits
 * the rules hold the older page's browser write to (`COURSE_FIELD_LIMITS`):
 *
 *  - TITLE: trimmed, and never empty (the older page refused an empty one);
 *    at most `weekTitle` characters.
 *  - SUMMARY: trimmed; at most `weekSummary` characters (the older page cut a
 *    longer one, which the rules would have refused; a route says so instead).
 *  - PITCHING: true or false.
 *  - QUESTIONS: the group week route's check, word for word: a list of at
 *    most `maxWeekQuestions` lines, none empty, none over `weekQuestion`
 *    characters, each kept as one line (`oneLineQuestion`).
 *
 * "How long it takes" (the older page's estimated minutes) is not here: it is
 * shown only on a course's public week page, and only for a week not written
 * as blocks, so for a week of a programme's Weeks tab it changes nothing.
 *
 * Pure: the route and the suites share it.
 */

import { COURSE_FIELD_LIMITS, oneLineQuestion } from "@/lib/firestore/courses";
import { fingerprintOf } from "../weekEdit/model";
import {
  QUESTION_LONG,
  QUESTION_NOT_TEXT,
  QUESTIONS_NOT_A_LIST,
  QUESTIONS_TOO_MANY,
  SETTINGS_BASE,
  SETTINGS_BODY,
  SUMMARY_LONG,
  TITLE_EMPTY,
  TITLE_LONG,
  questionEmptyWords,
  type SettingsChange,
} from "./words";

export type WeekSettings = {
  title: string;
  summary: string;
  pitching: boolean;
  questions: string[];
};

/**
 * WHICH VERSION A SAVE CHANGES. The page hands the route the fingerprint of
 * the settings as it read them (`base`), as a block's editor hands its block's
 * (`blockFingerprint`): a save from a page older than what is stored is
 * refused, so it never writes back what somebody else changed meanwhile. The
 * four fields are read as stored, through the week's reader.
 */
export function settingsFingerprint(stored: WeekSettings): string {
  return fingerprintOf([stored.title, stored.summary, stored.pitching, stored.questions]);
}

/** A fingerprint as a save may carry it: sixteen hex characters. */
const BASE = /^[0-9a-f]{16}$/;

/** The body's shape, before the gate: the base and four fields of the right kinds, or the one sentence. */
export function settingsBodyOf(
  raw: unknown,
): { ok: true; body: { base: string; title: string; summary: string; pitching: boolean; questions: unknown[] } } | { ok: false; error: string } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body || typeof body.title !== "string" || typeof body.summary !== "string" || typeof body.pitching !== "boolean" || !("questions" in body)) {
    return { ok: false, error: SETTINGS_BODY };
  }
  if (!Array.isArray(body.questions)) return { ok: false, error: QUESTIONS_NOT_A_LIST };
  if (typeof body.base !== "string" || !BASE.test(body.base)) return { ok: false, error: SETTINGS_BASE };
  return { ok: true, body: { base: body.base, title: body.title, summary: body.summary, pitching: body.pitching, questions: body.questions } };
}

/** The questions, checked whole, as the group week route checks a group's. */
export function questionsFrom(raw: readonly unknown[]): { ok: true; questions: string[] } | { ok: false; error: string } {
  if (raw.length > COURSE_FIELD_LIMITS.maxWeekQuestions) return { ok: false, error: QUESTIONS_TOO_MANY };
  const questions: string[] = [];
  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== "string") return { ok: false, error: QUESTION_NOT_TEXT };
    const line = oneLineQuestion(entry);
    if (!line) return { ok: false, error: questionEmptyWords(index + 1) };
    if (line.length > COURSE_FIELD_LIMITS.weekQuestion) return { ok: false, error: QUESTION_LONG };
    questions.push(line);
  }
  return { ok: true, questions };
}

/** Every field's check, in the order the page lays them out. */
export function checkSettings(body: { title: string; summary: string; pitching: boolean; questions: readonly unknown[] }): { ok: true; settings: WeekSettings } | { ok: false; error: string } {
  const title = body.title.trim();
  if (!title) return { ok: false, error: TITLE_EMPTY };
  if (title.length > COURSE_FIELD_LIMITS.weekTitle) return { ok: false, error: TITLE_LONG };
  const summary = body.summary.trim();
  if (summary.length > COURSE_FIELD_LIMITS.weekSummary) return { ok: false, error: SUMMARY_LONG };
  const questions = questionsFrom(body.questions);
  if (!questions.ok) return questions;
  return { ok: true, settings: { title, summary, pitching: body.pitching, questions: questions.questions } };
}

/** What a save changes against the week as stored; empty when it changes nothing. Only these fields are written. */
export function settingsChanges(stored: WeekSettings, next: WeekSettings): SettingsChange[] {
  const changes: SettingsChange[] = [];
  // Compared as a save stores them, trimmed, so a stored title or summary
  // with a space at an end is not rewritten by a save that did not touch it.
  if (stored.title.trim() !== next.title) changes.push("title");
  if (stored.summary.trim() !== next.summary) changes.push("summary");
  if (stored.pitching !== next.pitching) changes.push(next.pitching ? "pitching-on" : "pitching-off");
  if (JSON.stringify(stored.questions) !== JSON.stringify(next.questions)) changes.push("questions");
  return changes;
}
