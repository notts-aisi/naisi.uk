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

/** The programme as the event stores it, or null when it is not one this person may tie. */
export function tieTo(
  choice: { roundId: string; programmeId: string } | null,
  offered: readonly TieableProgramme[],
): EventProgramme | null | "refused" {
  if (choice === null) return null;
  const found = offered.find((each) => each.roundId === choice.roundId && each.programmeId === choice.programmeId);
  return found ? { roundId: found.roundId, programmeId: found.programmeId, name: found.shortName } : "refused";
}
