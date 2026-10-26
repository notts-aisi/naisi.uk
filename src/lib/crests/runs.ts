import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { courseCrests } from "./load";
import { crestForRun, type HoldsCrest, type ShownCrest } from "./resolve";

/**
 * WHAT A COURSE RUN SHOWS BESIDE ITS NAME, for the member's pages: the card
 * on My programmes and the head of the run's own page.
 *
 * A run has no crest of its own. The programme that names it on a form
 * (`namingProgrammeIn`, one programme or nobody) may carry one, and so may
 * its course; `crestForRun` chooses. The forms are read once and the courses
 * once, whatever the number of runs.
 *
 * Staff-side reads (every form's programmes), so nothing that builds an
 * applicant's page imports this; only the crest leaves.
 */

/** The programme that names this run, as the resolver takes it, or null when none does. */
export function namingProgrammeHolder(forms: readonly ApplicationForm[], runId: string): HoldsCrest {
  const naming = namingProgrammeIn(forms, runId);
  if (!naming) return null;
  const form = forms.find((candidate) => candidate.round.id === naming.roundId);
  return form ? (own(form.programmes, naming.programmeId) ?? null) : null;
}

/** What each of these runs shows, by run id. No runs, no reads. */
export async function runCrests(
  db: Firestore,
  runs: readonly { id: string; courseId: string }[],
): Promise<Map<string, ShownCrest>> {
  const shown = new Map<string, ShownCrest>();
  if (runs.length === 0) return shown;
  const [forms, courses] = await Promise.all([
    listForms(db),
    courseCrests(
      db,
      runs.map((run) => run.courseId),
    ),
  ]);
  for (const run of runs) {
    shown.set(run.id, crestForRun(namingProgrammeHolder(forms, run.id), courses.get(run.courseId)));
  }
  return shown;
}
