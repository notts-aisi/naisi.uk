import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ProgrammeKind } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { Role, SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";

/**
 * THE LEAD OF THE PROGRAMME THAT NAMES A COURSE RUN, AND WHETHER THEY STILL
 * STAND. The one answer, for a gate and for a sender alike.
 *
 * A course run has no lead of its own. A programme on an application form
 * names the run its people go onto (`programmes.<id>.runId`, written only by
 * `setProgrammeRun` in `src/lib/applications/handover/run.ts`), and that
 * programme's lead (`programmes.<id>.leadUid`) leads the run. Two kinds of
 * code ask about them:
 *
 *  - A GATE asks whether the person making the request is that lead
 *    (`programmeLedBy`), and holds them to the bar with their live session.
 *  - A SENDER OR A JOB asks who the lead is (`readRunLead`): who signs the
 *    facilitators' email, who is given a task. The lead is not the person
 *    asking, so their stored account is read and held to the same bar.
 *
 * ## Derived when it is asked, and kept nowhere
 *
 * Nothing copies the lead onto the run: not onto `trackLeadUids`, not onto
 * anything else. The forms are read each time the question is put, so a lead
 * who is replaced, whose programme stops naming the run, or who no longer
 * meets the bar is nobody on the run from the next request.
 *
 * ## The bar is asked again, in one place
 *
 * A lead is appointed behind the reviewer bar (`admissionRounds.leadUid` in
 * `src/lib/firebase/eligibility.ts`: an admin or SU-recognised committee),
 * and nothing clears the name when the account changes. Every answer here
 * goes through `leadsNamingProgramme`, which asks `isNamedWithStanding`.
 *
 * ## One programme, or nobody
 *
 * `setProgrammeRun` lets one programme, on one form, name a run. Should two
 * ever be stored naming the same run, nobody leads it through either: the
 * answer is never a guess between them.
 *
 * Staff only: it reads every form's programmes. Nothing that builds an
 * applicant's page may import it.
 */

/** The programme that names a run, as far as the question of its lead needs it. */
export type NamingProgramme = {
  roundId: string;
  programmeId: string;
  /** The uid the form names as the programme's lead, or null. Not held to any bar yet. */
  leadUid: string | null;
  /** The programme's short name ("AGI Strategy"), or null when it has none. */
  shortName: string | null;
  /** A fellowship or an incubator: Publish sends an incubator's people their own email. */
  kind: ProgrammeKind;
};

/**
 * The one programme, on any of these forms in any state, whose `runId` names
 * this run. Null when none does, and when more than one does. Pure.
 */
export function namingProgrammeIn(
  forms: readonly ApplicationForm[],
  runId: string,
): NamingProgramme | null {
  if (!runId) return null;
  const found: NamingProgramme[] = [];
  for (const form of forms) {
    for (const programmeId of form.programmeIds) {
      const programme = own(form.programmes, programmeId);
      if (!programme || programme.runId !== runId) continue;
      found.push({
        roundId: form.round.id,
        programmeId,
        leadUid: programme.leadUid,
        shortName: programme.shortName.trim() || null,
        kind: programme.kind,
      });
    }
  }
  return found.length === 1 ? found[0] : null;
}

/** The programme that names this run, read from every form: one equality on one field, the hand-over's own read. */
export async function readNamingProgramme(db: Firestore, runId: string): Promise<NamingProgramme | null> {
  if (!runId) return null;
  return namingProgrammeIn(await listForms(db), runId);
}

/**
 * IS THIS PERSON THE LEAD OF THE PROGRAMME THAT NAMES THE RUN, AND DO THEY
 * STILL MEET THE BAR A LEAD IS APPOINTED BEHIND?
 *
 * The one place the question is put to `isNamedWithStanding`. `person` is a
 * caller's live session, or a stored account read as one (`standingUserOf`).
 */
export function leadsNamingProgramme(person: SessionUser, naming: NamingProgramme | null): boolean {
  if (!naming) return false;
  return isNamedWithStanding(person, "admissionRounds.leadUid", naming.leadUid);
}

/** A programme on a form, by its two ids. */
export type LedProgramme = { roundId: string; programmeId: string };

/**
 * The programme this caller leads that names the run, while they still meet
 * the bar, or null. Nobody below the bar can stand as a lead, so the forms
 * are not read for them at all.
 */
export async function programmeLedBy(
  db: Firestore,
  actor: SessionUser,
  runId: string,
): Promise<LedProgramme | null> {
  if (!holdsStanding(actor, "admissionRounds.leadUid")) return null;
  const naming = await readNamingProgramme(db, runId);
  if (!naming || !leadsNamingProgramme(actor, naming)) return null;
  return { roundId: naming.roundId, programmeId: naming.programmeId };
}

/** The lead of the programme that names a run, as a sender or a job names them. */
export type RunLead = {
  uid: string;
  /** The first word of the name they chose, then of their account's, or "" when there is neither. */
  firstName: string;
  /** The programme they lead, which names the run. */
  naming: NamingProgramme;
};

/**
 * WHO LEADS THE PROGRAMME THAT NAMES THIS RUN, while that account still meets
 * the bar. Null for a run no programme names, a programme with no lead, a
 * lead whose account is gone, and a lead who no longer stands.
 *
 * `naming` is the programme when the caller has read it already (undefined
 * reads it here). Reads the lead's account, never anybody else's.
 */
export async function readRunLead(
  db: Firestore,
  runId: string,
  naming?: NamingProgramme | null,
): Promise<RunLead | null> {
  const named = naming === undefined ? await readNamingProgramme(db, runId) : naming;
  if (!named || !named.leadUid) return null;
  const snap = await db.collection("users").doc(named.leadUid).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (!leadsNamingProgramme(standingUserOf(named.leadUid, data), named)) return null;
  return { uid: named.leadUid, firstName: firstNameOfUser(data), naming: named };
}

/**
 * A stored user document, read as the session shape the standing table
 * takes. Only the role, the SU flag and the permission keys decide a bar;
 * nothing else is copied.
 */
export function standingUserOf(uid: string, data: Record<string, unknown>): SessionUser {
  const perms = (data.permissions as Record<string, unknown> | undefined) ?? {};
  const role = typeof data.role === "string" ? (data.role as Role) : "pending";
  return {
    uid,
    email: null,
    role,
    suRecognised: data.suRecognised === true,
    permissions: {
      draftNewsletter: perms.draftNewsletter === true,
      approveNewsletter: perms.approveNewsletter === true,
      draftEvent: perms.draftEvent === true,
      approveEvent: perms.approveEvent === true,
      draftCourse: perms.draftCourse === true,
      approveCourse: perms.approveCourse === true,
      manageMembership: perms.manageMembership === true,
      circulateWorksheet: perms.circulateWorksheet === true,
    },
  };
}

/** The first word of the name a person chose, then of their account's, or "". */
export function firstNameOfUser(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName : "";
  const display = typeof data.displayName === "string" ? data.displayName : "";
  return firstWord(preferred.trim() || display.trim());
}
