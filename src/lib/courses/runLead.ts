import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms, programmeNaming } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import { holdsStanding } from "@/lib/firebase/eligibility";
import type { Role, SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";

/**
 * THE LEAD OF A COURSE RUN, and the account standing behind a stored uid.
 *
 * A run has no lead of its own. Its lead is the lead of the programme, on an
 * application form, whose `runId` names it: `programmeNaming` finds that
 * programme (one equality over the forms, the same read the hand-over uses),
 * and the programme's `leadUid` is the person. A run no programme names has no
 * lead, and whatever would have gone to the lead goes to the admins alone.
 *
 * STANDING IS ASKED AGAIN HERE. A lead is appointed behind the reviewer bar
 * (`admissionRounds.leadUid` in `src/lib/firebase/eligibility.ts`), and nothing
 * clears the name when the account changes. So the stored role is read and
 * held to that same bar before the lead is put on a task or named on a page,
 * through `holdsStanding`, the one table of bars.
 */

export type RunLead = {
  uid: string;
  /** The first word of the name they chose, or "" when they chose none. */
  firstName: string;
};

/**
 * A stored user document, read as the session shape the standing table takes.
 * Only the role, the SU flag and the permission keys decide a bar; nothing
 * else is copied.
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

/**
 * The lead of the programme that names this run, if that account still meets
 * the bar a lead is appointed behind. Null otherwise.
 */
export async function readRunLead(db: Firestore, runId: string): Promise<RunLead | null> {
  const forms = await listForms(db);
  const named = programmeNaming(forms, runId);
  if (!named) return null;
  const form = forms.find((candidate) => candidate.round.id === named.roundId);
  const leadUid = own(form?.programmes, named.programmeId)?.leadUid ?? null;
  if (!leadUid) return null;
  const snap = await db.collection("users").doc(leadUid).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (!holdsStanding(standingUserOf(leadUid, data), "admissionRounds.leadUid")) return null;
  return { uid: leadUid, firstName: firstNameOfUser(data) };
}
