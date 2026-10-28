/**
 * THE PLAN'S SUGGESTION FOR ONE PERSON, kept with their application.
 *
 * When an admin asks Claude to plan the term, each person's suggested
 * placement (a programme they ranked, or no place) is written onto their
 * assessment document (`admissionAssessments/{roundId}__{uid}`, beside
 * Claude's read), so the Placement box shows it wherever the person is
 * opened, after a reload, until the next plan or "Clear all reads". It is a
 * suggestion: it decides nothing. It goes wherever the application goes, as
 * the read does.
 *
 * Pure: the shape and its reading. The writer is `./run.ts`'s.
 */

export type StoredSuggestion = {
  /** A programme they ranked, or null for no place. */
  programmeId: string | null;
  /** Claude's reason when it changed the draft; "" when it kept the draft's placement. */
  why: string;
  /** ISO instant. */
  at: string;
};

/** The suggestion on an assessment document, or null when there is none of this shape. */
export function suggestionOf(data: Record<string, unknown>): StoredSuggestion | null {
  const raw = data.suggestion;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (s.programmeId !== null && typeof s.programmeId !== "string") return null;
  return {
    programmeId: (s.programmeId as string | null) ?? null,
    why: typeof s.why === "string" ? s.why : "",
    at: typeof s.at === "string" ? s.at : "",
  };
}
