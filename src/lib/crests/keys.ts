/**
 * THE FOUR PROGRAMME CRESTS, BY KEY, and the one check that a value is one.
 *
 * The keys belong to the crests drawn in `src/components/ProgrammeCrest.tsx`,
 * which re-exports everything here, so a page imports them from the
 * component as the design handoff of 26 Oct 2026 has it. They live in this
 * plain module so that what reads a stored `crest` (the course and
 * programme readers, the request parser, the resolver) can ask the check
 * without loading a component: a module that never draws should not have to
 * compile JSX to read a field.
 *
 * Pure, with no imports.
 */

export const CREST_KEYS = [
  "agi-strategy",
  "technical-ai-safety",
  "governance-macrostrategy",
  "alignment",
] as const;

export type CrestKey = (typeof CREST_KEYS)[number];

export function isCrestKey(value: unknown): value is CrestKey {
  return typeof value === "string" && (CREST_KEYS as readonly string[]).includes(value);
}
