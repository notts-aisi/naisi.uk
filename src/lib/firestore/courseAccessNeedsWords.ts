import "server-only";
import { ACCESS_NEEDS_KIND, TEAM_MESSAGE_LIMITS } from "./courseTeamAsks";

/**
 * WHAT A MEMBER WROTE IN AN ACCESS-NEEDS ASK, AND THE TICK, out of the stored
 * document: the one place in the site that reads either once they are
 * stored. Imported by `src/lib/courses/teamAsk/openAccessNeeds.ts` and by
 * nothing else, which calls it inside the transaction that records the
 * opening (`tests/ask-access-needs-boundary.test.mjs` holds both).
 *
 * Every other reader of an access ask goes through `normalizeAccessNeeds`
 * (`./courseTeamAsks.ts`), which has no field for either.
 */

export type AccessNeedsWords = { words: string; tellFacilitator: boolean };

/** The words and the tick of a stored access ask, or null for a document of any other kind. */
export function accessNeedsWordsOf(data: Record<string, unknown>): AccessNeedsWords | null {
  if (data.kind !== ACCESS_NEEDS_KIND) return null;
  const stored = data.change && typeof data.change === "object" && !Array.isArray(data.change) ? (data.change as Record<string, unknown>) : {};
  return {
    words: typeof stored.words === "string" ? stored.words.slice(0, TEAM_MESSAGE_LIMITS.words) : "",
    tellFacilitator: stored.tellFacilitator === true,
  };
}
