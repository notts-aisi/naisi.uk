import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { namingProgrammeIn, readRunLead } from "@/lib/courses/programmeLead";
import { own } from "../keys";
import type { ProgrammeKind } from "../model";
import { listForms } from "./run";

/**
 * THE PROGRAMME A COURSE RUN BELONGS TO, as a page about the run names it:
 * its kind, its short name, and the first name of its lead.
 *
 * A run has no programme of its own. A programme on an application form names
 * the run its people go onto (`programmes.<id>.runId`), and pitching week's
 * page says "Incubator: Alignment Research" and "Zach makes the teams" from
 * that programme. The forms are read when the question is asked, so a lead
 * who is replaced, or a programme that stops naming the run, changes what the
 * page says on the next request.
 *
 * WHICH PROGRAMME AND WHICH LEAD are the one answer's
 * (`src/lib/courses/programmeLead.ts`): one programme naming the run or
 * nobody, and a lead named only while their stored account meets the lead's
 * bar.
 *
 * Only what a page shows leaves here: no uid, no address, nothing else of the
 * form.
 */
export type RunProgramme = {
  kind: ProgrammeKind;
  /** "Alignment Research". */
  shortName: string;
  /** The lead's first name, or null when there is no lead who stands. */
  leadFirstName: string | null;
};

/** The programme that names this run, or null when none does. */
export async function runProgrammeOf(db: Firestore, runId: string): Promise<RunProgramme | null> {
  const forms = await listForms(db);
  const naming = namingProgrammeIn(forms, runId);
  if (!naming) return null;
  const form = forms.find((candidate) => candidate.round.id === naming.roundId);
  const programme = form ? own(form.programmes, naming.programmeId) : undefined;
  if (!programme) return null;
  const lead = await readRunLead(db, runId, naming);
  return {
    kind: programme.kind,
    shortName: programme.shortName.trim() || programme.name.trim(),
    leadFirstName: lead?.firstName || null,
  };
}
