import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { Role, SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { own } from "../keys";
import type { ProgrammeKind } from "../model";
import { listForms, programmeNaming } from "./run";

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
 * THE LEAD IS HELD TO THE LEAD'S BAR (`admissionRounds.leadUid`), read off
 * their stored account: somebody who no longer meets it is not named.
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

/** A stored account, read as the session shape the standing table takes. */
function storedSession(uid: string, data: Record<string, unknown>): SessionUser {
  const perms = (data.permissions as Record<string, unknown> | undefined) ?? {};
  return {
    uid,
    email: null,
    role: (typeof data.role === "string" ? data.role : "pending") as Role,
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

/** The first word of the name a person chose, then of their account's. */
function firstNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
  const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
  return firstWord(preferred || display);
}

/** The programme that names this run, or null when none does. */
export async function runProgrammeOf(db: Firestore, runId: string): Promise<RunProgramme | null> {
  const forms = await listForms(db);
  const named = programmeNaming(forms, runId);
  if (!named) return null;
  const form = forms.find((candidate) => candidate.round.id === named.roundId);
  const programme = form ? own(form.programmes, named.programmeId) : undefined;
  if (!programme) return null;

  let leadFirstName: string | null = null;
  if (programme.leadUid) {
    const snap = await db.collection("users").doc(programme.leadUid).get();
    if (snap.exists) {
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const lead = storedSession(programme.leadUid, data);
      if (isNamedWithStanding(lead, "admissionRounds.leadUid", programme.leadUid)) {
        leadFirstName = firstNameOf(data) || null;
      }
    }
  }
  return {
    kind: programme.kind,
    shortName: programme.shortName.trim() || programme.name.trim(),
    leadFirstName,
  };
}
