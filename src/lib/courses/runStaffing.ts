import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { programmeLedBy, type LedProgramme } from "./programmeLead";

/**
 * WHO MAY DO A RUN'S TRACK LEAD'S WORK ON IT: an admin, one of the run's track
 * leads, or the lead of the programme that names it. One question, asked the
 * same way by every route a track lead passes.
 *
 * A run's track leads are named on the run (`trackLeadUids`, by an admin).
 * The lead of the programme that names the run is named nowhere on it: their
 * power is worked out from the form when the request arrives
 * (`programmeLedBy` in `./programmeLead.ts`), so a lead who is replaced, whose
 * programme stops naming the run, or who no longer meets the bar loses it on
 * the next request, and nothing has to be tidied.
 *
 * NEVER MORE THAN THE ONE RUN. `leadOf` is set only on the run the caller's
 * programme names: the lead of another programme is nobody here, and a
 * programme's reviewer gains nothing.
 *
 * `leadOf` is also the second half of who a row the application form put on
 * the run is served to (`rowIsServedTo` in
 * `src/lib/firestore/courseApplications.ts`): the lead is served the rows
 * their own programme's hand-over wrote, as an admin is served every row. So
 * a route hands this whole object to `rowIsServedTo`.
 *
 * `tests/course-hub-lead-every-gate.test.mjs` walks the tree for a route that
 * admits a track lead and does not ask this.
 */

export type RunStaffing = {
  isAdmin: boolean;
  /** Named on the run's `trackLeadUids` and still meeting that bar. */
  isTrackLead: boolean;
  /**
   * The programme the caller leads that names this run, while they still meet
   * the bar a lead is appointed behind. Null for everybody else, and for an
   * admin, who needs no programme to be served every row.
   */
  leadOf: LedProgramme | null;
};

/** The run as far as this question needs it. */
export type StaffedRun = { id: string; trackLeadUids: unknown };

/**
 * How the caller stands on this run. Reads the forms only for somebody who is
 * not an admin and could stand as a lead.
 */
export async function runStaffingOf(db: Firestore, actor: SessionUser, run: StaffedRun): Promise<RunStaffing> {
  const isAdmin = actor.role === "admin";
  return {
    isAdmin,
    isTrackLead: isNamedWithStanding(actor, "courseRuns.trackLeadUids", run.trackLeadUids),
    leadOf: isAdmin ? null : await programmeLedBy(db, actor, run.id),
  };
}

/** Does a run's track lead's work: an admin, a track lead, or the lead of the programme that names the run. */
export function doesTrackLeadWork(staffing: RunStaffing): boolean {
  return staffing.isAdmin || staffing.isTrackLead || staffing.leadOf !== null;
}
