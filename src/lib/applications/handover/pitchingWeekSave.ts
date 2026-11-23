import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  PICKS_ONLY_HERE,
  PITCHING_NO_RUN,
  PITCHING_WEEK_NOT_YOURS,
  PITCHING_WEEK_SAVED,
  TEAMS_MADE_ALREADY,
  bodyOf,
  sameSettings,
  type PitchingWeekInput,
} from "@/lib/courses/pitching/settings";
import { TEAMS_COLLECTION } from "@/lib/courses/teams/model";
import { NO_PROGRAMME, RUN_GONE } from "@/lib/courses/teams/words";
import { NOTHING_CHANGED } from "@/lib/courses/weekSettings/words";
import type { SessionUser } from "@/lib/firebase/session";
import { storedPitchSettings } from "@/lib/firestore/courses";
import { opensProgrammeGroups, roleOnProgramme } from "../access";
import { own } from "../keys";
import type { ProgrammeSettings } from "../model";
import { isApplicationForm, isId, normaliseForm, type ApplicationForm } from "../normalise";
import { formRef, loadForm } from "../repo";
import { RUNS_COLLECTION, readRun } from "./run";

/**
 * SAVING PITCHING WEEK'S SETTINGS from a programme's Groups, Pitches
 * (`PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/pitching-week`).
 *
 * WHO: an admin, or the programme's lead while they meet the lead's bar
 * (`roleOnProgramme`, `opensProgrammeGroups`), decided from the form before
 * the run is read: the people the Pitches view itself is drawn for. A
 * reviewer of the programme is refused; anybody with no role on it is told
 * the programme is not there.
 * Asked again inside the transaction that writes, of the form it reads,
 * and the run written is the one that form names then (`mayChange`).
 *
 * WHAT: the run's `pitchSettings` (`storedPitchSettings`) and `teamsFrom`,
 * the fields and the shape the run editor's Pitching week section writes,
 * with `updatedAt`, in one transaction, and only when something changed.
 * Which week is pitching week is never written here (it is that week's own
 * tick). Nothing is emailed.
 *
 * A programme with no teams (not an incubator) sets only how many pitches
 * each person may pick: a body that changes anything else there is refused.
 *
 * WHAT IT KEEPS AS IT IS. Pitches and picks are their own documents and are
 * never touched. Once the run has any team, how its teams are made cannot
 * change (`TEAMS_MADE_ALREADY`): the Teams tab draws the teams through the
 * way they were made, and another way, or none, would hide them. The sizes
 * and the day may still change: a team already made keeps its people.
 */

export type PitchingWeekSaved = { ok: true; saved: boolean; message: string; settings: ReturnType<typeof bodyOf> };
export type PitchingWeekRefused = { ok: false; status: number; error: string };

class Refusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Who may, and the programme they may for, from one reading of the form: an
 * admin or the programme's lead (`opensProgrammeGroups`), on a programme
 * that names a run. Asked once before the transaction, so a refusal reads
 * nothing of the run, and again inside it, of the form the transaction read.
 */
function mayChange(user: SessionUser, form: ApplicationForm | null, programmeId: string): { ok: true; programme: ProgrammeSettings; runId: string } | Refusal {
  const programme = form ? own(form.programmes, programmeId) : null;
  if (!form || !programme) return new Refusal(NO_PROGRAMME, 404);
  const role = roleOnProgramme(user, form, programmeId);
  if (role === null) return new Refusal(NO_PROGRAMME, 404);
  if (!opensProgrammeGroups(role)) return new Refusal(PITCHING_WEEK_NOT_YOURS, 403);
  if (programme.runId === null) return new Refusal(PITCHING_NO_RUN, 409);
  return { ok: true, programme, runId: programme.runId };
}

/** The form as the transaction reads it. */
async function formIn(tx: Transaction, db: Firestore, roundId: string): Promise<ApplicationForm | null> {
  const snap = await tx.get(formRef(db, roundId));
  const data = snap.exists ? snap.data() : undefined;
  return data && isApplicationForm(data) ? normaliseForm(snap.id, data) : null;
}

export async function savePitchingWeek(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  next: PitchingWeekInput,
): Promise<PitchingWeekSaved | PitchingWeekRefused> {
  if (!isId(roundId) || !isId(programmeId)) return { ok: false, status: 404, error: NO_PROGRAMME };
  const before = mayChange(user, await loadForm(db, roundId), programmeId);
  if (before instanceof Refusal) return { ok: false, status: before.status, error: before.message };

  try {
    return await db.runTransaction(async (tx): Promise<PitchingWeekSaved> => {
      // Asked again of the form this transaction reads: a lead replaced, or
      // the run the programme names changed, since the first read is met here.
      const now = mayChange(user, await formIn(tx, db, roundId), programmeId);
      if (now instanceof Refusal) throw now;
      const hasTeams = now.programme.kind === "incubator";
      const runRef = db.collection(RUNS_COLLECTION).doc(now.runId);
      const snap = await tx.get(runRef);
      const read = snap.exists ? readRun(snap.id, snap.data()) : null;
      if (!read || read.destroying) throw new Refusal(RUN_GONE, 404);
      const run = read.run;
      const stored: PitchingWeekInput = { teamsFrom: run.teamsFrom, settings: run.pitchSettings };
      if (sameSettings(stored, next)) return { ok: true, saved: false, message: NOTHING_CHANGED, settings: bodyOf(stored) };

      // A programme with no teams sets only how many pitches each person may pick.
      if (!hasTeams) {
        const keep = (input: PitchingWeekInput) => JSON.stringify({ ...bodyOf(input), pickLimit: null });
        if (keep(stored) !== keep(next)) throw new Refusal(PICKS_ONLY_HERE, 400);
      }

      if (next.teamsFrom !== stored.teamsFrom) {
        // Whether any team exists, read in this transaction: one equality on one field, so no declared index.
        const teams = await tx.get(db.collection(TEAMS_COLLECTION).where("runId", "==", run.id));
        if (!teams.empty) throw new Refusal(TEAMS_MADE_ALREADY, 409);
      }

      tx.update(runRef, {
        pitchSettings: storedPitchSettings(next.settings),
        teamsFrom: next.teamsFrom,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true, saved: true, message: PITCHING_WEEK_SAVED, settings: bodyOf(next) };
    });
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}
