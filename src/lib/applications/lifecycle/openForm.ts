import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { roundWindowState } from "@/lib/admissions/window";
import { ROUNDS_COLLECTION, type AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";
import { FORM_VERSION, type ProgrammeKind } from "../model";
import { normaliseForm, type ApplicationForm } from "../normalise";
import { openProgrammes } from "../sections";

/**
 * WHICH APPLICATION FORM IS OPEN RIGHT NOW, IF ANY.
 *
 * The question a page asks before it offers somebody an Apply button. There
 * is one application form a term, so the answer is one form or none, and the
 * button leads to `applyPath`.
 *
 * ## Safe for a page any visitor can load
 *
 * A form is stored on an admission round, which is closed to every browser
 * and carries things no visitor may be told: who leads and who reviews each
 * programme, the live counts of applications, each programme's places and
 * the wording of its decision emails. This module reads the round on the
 * Admin SDK, so the rules are no defence here, and it keeps those things in
 * by PROJECTION: `OpenFormView` is written out field by field below, and no
 * round or form leaves this file. A field added to the round later stays
 * private until somebody names it here on purpose.
 *
 * It imports nothing that reads a review or a decision, and nothing that
 * says who has a role on a form. `tests/applications-wave-e1-open-form.test.mjs`
 * walks its imports to hold that, so a public page may import it.
 *
 * ## Open means what the apply routes mean
 *
 * `roundWindowState`, the one predicate the form's own routes refuse on: the
 * status is open and now is inside both dates. A form that is a draft, opens
 * later, has closed, was closed early, is archived or is finished is not
 * offered. Neither is a form with no programme left to tick.
 *
 * ## The read
 *
 * One equality on one field (`formVersion`), which needs no declared index.
 * A site has a handful of forms over its whole life, so the rest is done in
 * memory.
 */

/** One programme somebody can tick, as a page that links to the form may know it. */
export type OpenFormProgramme = {
  id: string;
  kind: ProgrammeKind;
  /** "AGI Strategy Fellowship". */
  name: string;
  /** "AGI Strategy". */
  shortName: string;
  /** The course run it places people on, once one is set. A lookup key, never printed. */
  runId: string | null;
};

/**
 * The open form, as a stranger may know it. The three dates are the round's
 * own, under the round's own names: when it opened, when it closes, and the
 * day everybody hears.
 */
export type OpenFormView = Pick<AdmissionRoundDoc, "opensAt" | "closesAt" | "decisionsByDate"> & {
  /** The round the form is stored on. */
  id: string;
  /** Always open: a form in any other state is not returned at all. */
  state: "open";
  /** Where the form is served. */
  applyPath: string;
  /** The term, as applicants read it at the top of the form: "Autumn 2026". */
  label: string;
  /** The programmes somebody can tick, in the form's order. Closed ones are left out. */
  programmes: OpenFormProgramme[];
  /**
   * The course runs those programmes place people on, where one is set, once
   * each. Empty while no programme has been linked to a run.
   */
  outcomeRunIds: string[];
};

/** Where the application form on a round is served. */
export function applyPathFor(roundId: string): string {
  return `/apply/${encodeURIComponent(roundId)}`;
}

/** The one projection. Everything a visitor's page is handed is named here. */
function viewOf(form: ApplicationForm): OpenFormView {
  const { opensAt, closesAt, decisionsByDate } = form.round;
  const programmes: OpenFormProgramme[] = openProgrammes(form).map((programme) => ({
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    runId: programme.runId,
  }));
  const outcomeRunIds: string[] = [];
  for (const programme of programmes) {
    if (programme.runId && !outcomeRunIds.includes(programme.runId)) outcomeRunIds.push(programme.runId);
  }
  return {
    id: form.round.id,
    state: "open",
    applyPath: applyPathFor(form.round.id),
    label: form.round.label,
    opensAt,
    closesAt,
    decisionsByDate,
    programmes,
    outcomeRunIds,
  };
}

/** Sooner close first, a form with no close last, then by id so two reads agree. */
function byClose(a: ApplicationForm, b: ApplicationForm): number {
  const at = (form: ApplicationForm) => form.round.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return at(a) - at(b) || a.round.id.localeCompare(b.round.id);
}

/**
 * The application form that is taking applications at `now`, or null.
 *
 * There should only ever be one. If two are open at once, the one that closes
 * first is returned, because that is the one somebody could miss.
 */
export async function findOpenForm(db: Firestore, now: Date = new Date()): Promise<OpenFormView | null> {
  const snap = await db.collection(ROUNDS_COLLECTION).where("formVersion", "==", FORM_VERSION).get();
  const open: ApplicationForm[] = [];
  for (const doc of snap.docs) {
    const form = normaliseForm(doc.id, doc.data());
    if (roundWindowState(form.round, now).state !== "open") continue;
    if (openProgrammes(form).length === 0) continue;
    open.push(form);
  }
  if (open.length === 0) return null;
  return viewOf(open.sort(byClose)[0]);
}

/**
 * Does the open form take applications for any of these course runs?
 *
 * True when one of its programmes places people on one of them. A form whose
 * programmes have not been linked to a run speaks for none by this test: the
 * caller decides what a form with no links means for its page, and can see
 * that it has none from an empty `outcomeRunIds`.
 */
export function openFormSpeaksFor(form: Pick<OpenFormView, "outcomeRunIds">, runIds: readonly string[]): boolean {
  return form.outcomeRunIds.some((runId) => runIds.includes(runId));
}
