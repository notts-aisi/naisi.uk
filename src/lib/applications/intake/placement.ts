import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { own } from "../keys";
import { decideApplication } from "../review/decide";
import { loadStaffNames } from "../review/load";
import { NOT_FOUND, refuse } from "../review/refusals";
import type { Refusal } from "../review/types";
import { decisionsFor, type DecisionOp, type HeldBy } from "./advice";
import { loadIntake, type IntakeLoaded, type IntakePerson, type IntakeProgramme } from "./load";
import type { Standing } from "./match";

/**
 * ONE PERSON'S PLACEMENT, the one source of truth for it: the Placement box
 * beside their application (whichever programme it is opened from) and the
 * Placements list on Plan the intake are both this, read and written here.
 *
 * A placement is where somebody goes this term: one programme they ranked, or
 * no place. It is not stored as such. It is what the per-programme decisions
 * say through the one-place rule, so every other screen (each programme's
 * list, decision day, the pool) agrees with it with nothing to keep in step.
 * Placing somebody writes the decisions that make it true (`decisionsFor`),
 * through the decision route's own writer (`decideApplication`), one at a
 * time, as the admin, so every rule a decision is held to holds and each one
 * records who made it.
 *
 * Two ways in, admins only, before decision day:
 *
 *  - A PICK is an admin's own choice. It may change decisions already made
 *    (an acceptance above it is pooled, a Pool or Decline on it becomes an
 *    Accept), and the box says whose first.
 *  - THE FILL is the one button that places everybody nobody has placed as
 *    the plan suggests. It never changes a decision already made: somebody
 *    any programme has accepted is left alone, and so is anybody the
 *    suggestion could only reach by undoing one.
 */

export type PlacementChoice = {
  programmeId: string;
  shortName: string;
  standing: Standing;
  /** Who made the decision on this programme, by first name, or null while nobody has. */
  by: string | null;
  lean: string | null;
  score: number | null;
  facilitates: boolean;
};

export type PlacementNow =
  /** The decisions as they stand place them here. */
  | { kind: "placed"; programmeId: string; by: string | null }
  /** Every programme they ranked has pooled or declined them. */
  | { kind: "no-place" }
  /** A decision is still owed somewhere that could change where they go. */
  | { kind: "open" };

export type PlacementView = {
  uid: string;
  name: string;
  /** Their application, opened under their first choice. */
  href: string;
  /** Each programme they ranked, in their order. */
  choices: PlacementChoice[];
  now: PlacementNow;
  /** The plan's suggestion: Claude's, kept from the last plan, or the site's draft. Null with neither. */
  suggestion: { programmeId: string | null; why: string; at: string; source: "claude" | "draft" } | null;
  /** Long answers Pangram thought worth a look, or null until a clean check. */
  flags: number | null;
  read: { claude: boolean; pangram: boolean };
  /**
   * What the fill would do for them: the decisions, or why it leaves them.
   * Null when there is no suggestion to fill from.
   */
  fill: { ops: DecisionOp[] } | { leftBecause: string } | null;
};

const STANDING_WORDS: Record<string, string> = {
  accepted: "accepted",
  pooled: "pooled",
  declined: "declined",
};

/** "Governance and Macrostrategy, accepted by Lloyd". */
export function heldWords(held: HeldBy, choices: readonly PlacementChoice[]): string {
  const choice = choices.find((each) => each.programmeId === held.programmeId);
  const name = choice?.shortName ?? "another programme";
  const by = choice?.by ? ` by ${choice.by}` : "";
  return `${name}, ${own(STANDING_WORDS, held.standing) ?? held.standing}${by}`;
}

/** Every uid that made a decision for these people, for one read of their names. */
function decidersOf(people: readonly IntakePerson[]): string[] {
  return [...new Set(people.flatMap((person) => Object.values(person.on).flatMap((on) => (on.byUid ? [on.byUid] : []))))];
}

export function placementViewOf(
  person: IntakePerson,
  context: {
    roundId: string;
    programmes: readonly IntakeProgramme[];
    names: ReadonlyMap<string, string>;
    /** The suggestion to show: the plan just made, or what is kept, or the draft's. */
    suggestion: PlacementView["suggestion"];
  },
): PlacementView {
  const shortOf = new Map(context.programmes.map((p) => [p.id, p.shortName] as const));
  const choices: PlacementChoice[] = person.ranked.flatMap((programmeId) => {
    const on = own(person.on, programmeId);
    const shortName = shortOf.get(programmeId);
    if (!on || !shortName) return [];
    return [
      {
        programmeId,
        shortName,
        standing: on.standing,
        by: on.byUid ? (context.names.get(on.byUid) ?? null) : null,
        lean: on.lean,
        score: on.score,
        facilitates: on.facilitates,
      },
    ];
  });
  const placed = person.placedNow;
  const now: PlacementNow = placed
    ? { kind: "placed", programmeId: placed, by: choices.find((c) => c.programmeId === placed)?.by ?? null }
    : choices.length > 0 && choices.every((c) => c.standing === "pooled" || c.standing === "declined")
      ? { kind: "no-place" }
      : { kind: "open" };

  let fill: PlacementView["fill"] = null;
  if (context.suggestion) {
    const accepted = choices.find((c) => c.standing === "accepted");
    if (accepted) {
      fill = { leftBecause: `Already placed: ${heldWords({ programmeId: accepted.programmeId, standing: "accepted" }, choices)}.` };
    } else {
      const steps = decisionsFor(person, context.suggestion.programmeId);
      fill = steps.held
        ? { leftBecause: `It would change ${heldWords(steps.held, choices)}.` }
        : steps.ops.length === 0
          ? { leftBecause: "Nothing to change." }
          : { ops: steps.ops };
    }
  }

  const first = person.ranked[0] ?? "";
  return {
    uid: person.uid,
    name: person.name,
    href: `/admin/admissions/forms/${encodeURIComponent(context.roundId)}/programmes/${encodeURIComponent(first)}/applications/${encodeURIComponent(person.uid)}`,
    choices,
    now,
    suggestion: context.suggestion,
    flags: person.flags,
    read: { claude: person.hasRead, pangram: person.hasPangram },
    fill,
  };
}

/** The names of everybody who made a decision for these people. */
export async function decidersNames(db: Firestore, people: readonly IntakePerson[]): Promise<Map<string, string>> {
  const uids = decidersOf(people);
  return uids.length > 0 ? loadStaffNames(db, uids) : new Map();
}

/** The suggestion kept from the last plan, as a view shows it, or null. */
export function keptSuggestion(person: IntakePerson): PlacementView["suggestion"] {
  return person.suggestion ? { ...person.suggestion, source: "claude" } : null;
}

export type PlacementResult = { ok: true; placement: PlacementView } | Refusal;

async function viewFor(
  db: Firestore,
  loaded: IntakeLoaded,
  uid: string,
): Promise<PlacementView | null> {
  const person = loaded.people.find((each) => each.uid === uid);
  if (!person) return null;
  return placementViewOf(person, {
    roundId: loaded.roundId,
    programmes: loaded.programmes,
    names: await decidersNames(db, [person]),
    suggestion: keptSuggestion(person),
  });
}

/** One person's placement, for an admin. Not found for anybody not in the term, the admin's own application included. */
export async function loadPlacement(db: Firestore, user: SessionUser, roundId: string, uid: string): Promise<PlacementResult> {
  const loaded = await loadIntake(db, user, roundId);
  if (!loaded.ok) return loaded;
  const placement = await viewFor(db, loaded.intake, uid);
  return placement ? { ok: true, placement } : NOT_FOUND;
}

export type PlaceMode = "pick" | "fill";

/** Write the decisions one person's placement needs, through the decision route's writer. Stops at the first refusal. */
async function writeSteps(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  uid: string,
  ops: readonly DecisionOp[],
): Promise<{ ok: true } | Refusal> {
  for (const op of ops) {
    const decided = await decideApplication(db, user, roundId, uid, {
      programmeId: op.programmeId,
      decision: op.decision,
      poolReason: op.poolReason,
      couldSuitProgrammeId: null,
    });
    if (!decided.ok) return decided;
  }
  return { ok: true };
}

/**
 * Place one person: `programmeId` (one they ranked) or null for no place.
 * A pick may change decisions already made; the fill never does.
 */
export async function placePerson(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  uid: string,
  programmeId: string | null,
  mode: PlaceMode,
): Promise<PlacementResult> {
  const loaded = await loadIntake(db, user, roundId);
  if (!loaded.ok) return loaded;
  const person = loaded.intake.people.find((each) => each.uid === uid);
  if (!person) return NOT_FOUND;
  if (programmeId !== null && (!person.ranked.includes(programmeId) || !loaded.intake.programmes.some((p) => p.id === programmeId))) {
    return refuse(400, "They can only be placed on a programme they ranked that is still open.");
  }
  if (mode === "fill" && Object.values(person.on).some((on) => on.standing === "accepted")) {
    return refuse(409, "Somebody has already placed them, so the plan leaves them alone.");
  }
  const steps = decisionsFor(person, programmeId, mode === "pick");
  if (steps.held) return refuse(409, "The plan would change a decision already made, so it leaves them for you.");
  const written = await writeSteps(db, user, roundId, uid, steps.ops);
  if (!written.ok) return written;
  return loadPlacement(db, user, roundId, uid);
}

export type FillResult =
  | { ok: true; placed: string[]; left: { uid: string; why: string }[] }
  | Refusal;

/**
 * THE FILL: everybody on `people` placed as the screen showed it, each only
 * if nobody has placed them yet and the suggestion needs no decision already
 * made changed. One read of the term, then each person's decisions in turn.
 * Somebody refused is left, with why, and the rest go on.
 */
export async function fillPlacements(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  people: readonly { uid: string; programmeId: string | null }[],
): Promise<FillResult> {
  const loaded = await loadIntake(db, user, roundId);
  if (!loaded.ok) return loaded;
  const byUid = new Map(loaded.intake.people.map((person) => [person.uid, person] as const));
  const open = new Set(loaded.intake.programmes.map((p) => p.id));
  const placed: string[] = [];
  const left: { uid: string; why: string }[] = [];
  for (const { uid, programmeId } of people) {
    const person = byUid.get(uid);
    if (!person) {
      left.push({ uid, why: "Not in this term." });
      continue;
    }
    if (programmeId !== null && (!person.ranked.includes(programmeId) || !open.has(programmeId))) {
      left.push({ uid, why: "That programme is not one they ranked that is still open." });
      continue;
    }
    if (Object.values(person.on).some((on) => on.standing === "accepted")) {
      left.push({ uid, why: "Somebody has already placed them." });
      continue;
    }
    const steps = decisionsFor(person, programmeId);
    if (steps.held) {
      left.push({ uid, why: "It would change a decision already made." });
      continue;
    }
    const written = await writeSteps(db, user, roundId, uid, steps.ops);
    if (!written.ok) left.push({ uid, why: written.error });
    else placed.push(uid);
  }
  return { ok: true, placed, left };
}
