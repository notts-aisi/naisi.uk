/**
 * A FIRST DRAFT OF WHO GOES WHERE, across every programme of a term at once.
 *
 * Arithmetic, not judgement: the applicant-proposing deferred acceptance of
 * Gale and Shapley, the standard way to place people who rank options with
 * limited room. Each person "applies" down their own ranking; each programme
 * keeps the best of those who applied to it, up to its places, and turns the
 * rest away to try their next choice. What comes out is stable: nobody could
 * be on a programme they ranked higher that would rather have had them than
 * somebody it kept. Claude's part (`./advice.ts`) comes after and only
 * suggests changes this file's caller can check.
 *
 * How a programme orders the people who ranked it, best first:
 *
 *  1. ITS LEAD'S DECISION SO FAR. Accepted, then not decided, then pooled.
 *     A programme whose lead DECLINED somebody (spam, or not eligible) never
 *     takes them.
 *  2. Claude's lean for that programme: strong, borderline, weak, not read.
 *  3. The committee's score for that programme, higher first.
 *  4. Account id, so the same input always gives the same answer.
 *
 * A programme with no set number of places takes everybody who reaches it.
 * Pure, with no imports.
 */

import { own } from "../keys";

export type Standing = "accepted" | "to-review" | "pooled" | "declined";
export type MatchLean = "strong" | "borderline" | "weak" | null;

export type MatchPerson = {
  uid: string;
  /** Their ranking, first choice first. */
  ranked: readonly string[];
  /** Per programme they ranked: the lead's standing, Claude's lean, the committee's score. */
  on: Readonly<Record<string, { standing: Standing; lean: MatchLean; score: number | null }>>;
};

export type MatchProgramme = { id: string; places: number | null };

const STANDING_ORDER: Record<Standing, number> = { accepted: 0, "to-review": 1, pooled: 2, declined: 9 };
const LEAN_ORDER = (lean: MatchLean) => (lean === "strong" ? 0 : lean === "borderline" ? 1 : lean === "weak" ? 2 : 3);

/** Whether `a` comes before `b` in this programme's order. */
export function prefers(programmeId: string, a: MatchPerson, b: MatchPerson): number {
  const x = own(a.on, programmeId);
  const y = own(b.on, programmeId);
  const sx = x ? STANDING_ORDER[x.standing] : 9;
  const sy = y ? STANDING_ORDER[y.standing] : 9;
  if (sx !== sy) return sx - sy;
  const lx = LEAN_ORDER(x?.lean ?? null);
  const ly = LEAN_ORDER(y?.lean ?? null);
  if (lx !== ly) return lx - ly;
  const cx = x?.score ?? -1;
  const cy = y?.score ?? -1;
  if (cx !== cy) return cy - cx;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

/** May this programme take this person at all? */
function acceptable(programmeId: string, person: MatchPerson): boolean {
  const entry = own(person.on, programmeId);
  return entry !== undefined && entry.standing !== "declined";
}

/** Each person's programme in the draft, or null for nobody's. */
export function matchIntake(people: readonly MatchPerson[], programmes: readonly MatchProgramme[]): Map<string, string | null> {
  const places = new Map(programmes.map((p) => [p.id, p.places] as const));
  const byUid = new Map(people.map((p) => [p.uid, p] as const));
  const next = new Map<string, number>(people.map((p) => [p.uid, 0]));
  const held = new Map<string, string[]>(programmes.map((p) => [p.id, []]));
  const free = [...people.map((p) => p.uid)].sort();

  while (free.length > 0) {
    const uid = free.shift()!;
    const person = byUid.get(uid)!;
    let placed = false;
    while (!placed && next.get(uid)! < person.ranked.length) {
      const programmeId = person.ranked[next.get(uid)!];
      next.set(uid, next.get(uid)! + 1);
      if (!places.has(programmeId) || !acceptable(programmeId, person)) continue;
      const kept = held.get(programmeId)!;
      kept.push(uid);
      kept.sort((a, b) => prefers(programmeId, byUid.get(a)!, byUid.get(b)!));
      const room = places.get(programmeId);
      if (room === null || room === undefined || kept.length <= room) {
        placed = true;
        continue;
      }
      // Over its places: the last in its order is turned away and tries again.
      const out = kept.pop()!;
      if (out === uid) continue;
      placed = true;
      free.push(out);
    }
  }

  const result = new Map<string, string | null>(people.map((p) => [p.uid, null]));
  for (const [programmeId, kept] of held) for (const uid of kept) result.set(uid, programmeId);
  return result;
}
