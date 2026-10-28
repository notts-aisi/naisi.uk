import { own } from "../keys";
import type { StoredApplicationRead, StoredClaudeRead } from "./types";

/**
 * ONE STORED READ OF AN APPLICATION, as one programme's screens read it.
 *
 * A read is of the whole application, with a lean and fit for each programme
 * the person ranked (`StoredApplicationRead`). Every screen that shows a read
 * for one programme (the review screen, a programme's list, Compare, Arrange,
 * the Intake plan) asks here for that programme's view of it, so they cannot
 * disagree about what Claude said.
 *
 * Pure.
 */

type Raw = Record<string, unknown>;

/** The stored read on an assessment document, or null when there is none of the current shape. */
export function applicationReadOf(data: Raw): StoredApplicationRead | null {
  const read = data.read;
  if (!read || typeof read !== "object" || Array.isArray(read)) return null;
  const raw = read as Raw;
  return typeof raw.summary === "string" && raw.programmes && typeof raw.programmes === "object"
    ? (raw as unknown as StoredApplicationRead)
    : null;
}

/** That read, for one programme: its lean and fit beside what is said of the person. */
export function readForProgramme(read: StoredApplicationRead, programmeId: string): StoredClaudeRead | null {
  const here = own(read.programmes, programmeId);
  if (!here) return null;
  const blind = read.independent ? own(read.independent.programmes, programmeId) : undefined;
  return {
    lean: here.lean,
    leanReason: here.leanReason,
    fit: here.fit,
    summary: read.summary,
    strengths: read.strengths,
    concerns: read.concerns,
    reviewers: read.reviewers,
    toWeigh: read.toWeigh,
    thinAnswers: read.thinAnswers,
    independent:
      blind && read.independent ? { lean: blind.lean, leanReason: blind.leanReason, summary: read.independent.summary } : null,
    model: read.model,
    at: read.at,
    fingerprint: read.fingerprint,
    reviewerUids: read.reviewerUids,
  };
}

/** The read on an assessment document for one programme, or null. */
export function storedReadFor(data: Raw, programmeId: string): StoredClaudeRead | null {
  const read = applicationReadOf(data);
  return read ? readForProgramme(read, programmeId) : null;
}
