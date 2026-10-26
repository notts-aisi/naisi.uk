import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";

/**
 * THE PROGRAMMES THE KAIROS FILE AND REPORT ARE ABOUT: a programme on an
 * application form that names the course run its people went onto. This
 * term's programmes, and only those (Zach, 26 Oct 2026): nobody from a run
 * no form names, no applicant who did not get a place.
 *
 * Admins only ask here; the page and the route decide that first.
 */

export type KairosProgramme = {
  roundId: string;
  programmeId: string;
  /** "AGI Strategy": the programme's short name, or its name. */
  name: string;
  /** The form's own name for its term: "Autumn 2026". */
  term: string;
  kind: "fellowship" | "incubator";
  runId: string;
};

function nameOf(programme: { shortName: string; name: string }): string {
  return programme.shortName.trim() || programme.name.trim() || "Programme";
}

/** One programme of a form that is already loaded, when it names a run; null otherwise. */
export function kairosProgrammeOf(form: ApplicationForm, programmeId: string): KairosProgramme | null {
  // Read through the map's own entries, so an inherited name is no programme.
  const programme = new Map(Object.entries(form.programmes)).get(programmeId);
  if (!programme || !programme.runId) return null;
  return {
    roundId: form.round.id,
    programmeId,
    name: nameOf(programme),
    term: form.round.label,
    kind: programme.kind === "incubator" ? "incubator" : "fellowship",
    runId: programme.runId,
  };
}

/** One programme, by its form and its id, when it names a run; null otherwise. */
export async function loadKairosProgramme(db: Firestore, roundId: string, programmeId: string): Promise<KairosProgramme | null> {
  if (!roundId || !programmeId || roundId.includes("/") || programmeId.includes("/")) return null;
  const form = await loadForm(db, roundId);
  return form ? kairosProgrammeOf(form, programmeId) : null;
}

/** Every programme on every form that names a run, a form's in its own order. */
export async function listKairosProgrammes(db: Firestore): Promise<KairosProgramme[]> {
  return (await listForms(db)).flatMap((form) =>
    form.programmeIds.flatMap((programmeId) => {
      const programme = kairosProgrammeOf(form, programmeId);
      return programme ? [programme] : [];
    }),
  );
}
