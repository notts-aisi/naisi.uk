import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { isId, own } from "@/lib/applications/keys";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import type { EventProgramme } from "@/lib/firestore/events";
import { chooseTerm } from "@/lib/surveys/term/choose";

/**
 * WHICH PROGRAMMES SOMEBODY MAY MAKE AN EVENT PART OF.
 *
 * An event for chosen people that is part of a programme invites the people
 * holding a place on it with a programme notice, which reaches them whatever
 * their settings: the notice lane is for the people running a programme,
 * writing to the people on it. So the choice is offered, and accepted by
 * `/api/events/[id]/audience`, only for a programme the person leads (held to
 * the lead's bar, `isNamedWithStanding`) and, for an admin, any of them. The
 * programmes are the term's, read as "Who is this for?" reads them
 * (`chooseTerm`), so the programme and the tags that name its people are
 * always the same term's.
 */

export type TieableProgramme = {
  roundId: string;
  programmeId: string;
  /** "Alignment Research Incubator", for the editor's sentence. */
  name: string;
  /** "Alignment Research", for the card on Home. */
  shortName: string;
};

export async function programmesToTie(db: Firestore, viewer: SessionUser, now: Date): Promise<TieableProgramme[]> {
  const form = chooseTerm(await listForms(db), now);
  if (!form) return [];
  return form.programmeIds.flatMap((programmeId): TieableProgramme[] => {
    const settings = own(form.programmes, programmeId);
    if (!settings) return [];
    const leads = isNamedWithStanding(viewer, "admissionRounds.leadUid", settings.leadUid);
    if (viewer.role !== "admin" && !leads) return [];
    const name = settings.name.trim() || settings.shortName.trim() || "Programme";
    return [{ roundId: form.round.id, programmeId, name, shortName: settings.shortName.trim() || name }];
  });
}

/** A programme a request names: `{ roundId, programmeId }`, `null` for none, or `undefined` for anything else. */
export function parseProgrammeChoice(raw: unknown): { roundId: string; programmeId: string } | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { roundId, programmeId } = raw as { roundId?: unknown; programmeId?: unknown };
  return isId(roundId) && isId(programmeId) ? { roundId, programmeId } : undefined;
}

type ProgrammeRef = { roundId: string; programmeId: string };

const sameProgramme = (a: ProgrammeRef, b: ProgrammeRef) => a.roundId === b.roundId && a.programmeId === b.programmeId;

/**
 * Whether this person may take the programme an event is part of OFF it (or
 * swap it for another): its lead or an admin, as for putting it on. An admin
 * may take off one that is no longer the term's, which nobody may tie.
 */
export function mayUntie(stored: EventProgramme | null, offered: readonly TieableProgramme[], viewer: SessionUser): boolean {
  if (stored === null) return true;
  return viewer.role === "admin" || offered.some((each) => sameProgramme(each, stored));
}

/**
 * The programme the event will store, given the one it stores now, or
 * "refused":
 *  - THE SAME ONE: kept as it is, whoever saves. Keeping it is not choosing
 *    it, so somebody who may change the people but not the programme can
 *    save the people without taking the programme off.
 *  - NONE, OR ANOTHER: only for somebody who may take the stored one off
 *    (`mayUntie`) and, for another, may put that one on.
 */
export function tieTo(
  choice: ProgrammeRef | null,
  offered: readonly TieableProgramme[],
  stored: EventProgramme | null,
  viewer: SessionUser,
): EventProgramme | null | "refused" {
  if (choice !== null && stored !== null && sameProgramme(choice, stored)) return stored;
  if (!mayUntie(stored, offered, viewer)) return "refused";
  if (choice === null) return null;
  const found = offered.find((each) => sameProgramme(each, choice));
  return found ? { roundId: found.roundId, programmeId: found.programmeId, name: found.shortName } : "refused";
}
