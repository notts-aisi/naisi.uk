import { isCrestKey, type CrestKey } from "./keys";

/**
 * A CREST AS A REQUEST SENDS ONE, read the one way for both of its writers:
 * the course's crest route (`/api/courses/[courseId]/crest`) and a
 * programme's settings route (`parseProgrammeChange`). One of the four keys,
 * or `null` (or an empty choice from a picker) for no crest, which shows the
 * NAISI emblem in its place. Anything else is refused with a sentence a
 * person can act on, never stored and never trimmed into a key.
 *
 * Pure, so it is executed by a test rather than through a route.
 */

export const CREST_NOT_ONE_OF_THE_FOUR =
  "That is not one of the four crests. Pick one from the list, or No crest to show the NAISI emblem.";

export type CrestChoice = { ok: true; crest: CrestKey | null } | { ok: false; error: string };

export function readCrestChoice(raw: unknown): CrestChoice {
  if (raw === null || raw === "") return { ok: true, crest: null };
  if (isCrestKey(raw)) return { ok: true, crest: raw };
  return { ok: false, error: CREST_NOT_ONE_OF_THE_FOUR };
}
