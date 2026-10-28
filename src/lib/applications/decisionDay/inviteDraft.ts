/**
 * CLAUDE'S DRAFT OF AN INVITATION'S PERSONAL NOTE, kept with the application.
 *
 * When an admin asks Claude to draft the note for a pooled applicant's
 * invitation, the draft is written onto their assessment document
 * (`admissionAssessments/{roundId}__{uid}`, beside Claude's read), so the
 * Pooled applicants page shows it after a reload, until the next draft or
 * "Clear all reads". It is a draft: it is never sent. Only an admin's Save
 * puts words in an email, and those are kept with the invitation itself
 * (`PooledOutcome.note`). It goes wherever the application goes, as the read
 * does.
 *
 * The shape, its reading, and the read of a page's worth of them. The writer
 * is `./inviteNote.ts`'s.
 */
import type { Firestore } from "firebase-admin/firestore";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";

export type StoredInviteDraft = {
  /** The programme the invitation was to when the draft was made. A draft for another is not shown. */
  programmeId: string;
  /** The note, as Claude drafted it. */
  text: string;
  /** For the admin, never the applicant: what in the application the draft drew on. */
  basis: string;
  /** The model that answered, as Anthropic reported it. */
  model: string;
  /** ISO instant. */
  at: string;
};

/** The draft on an assessment document, or null when there is none of this shape. */
export function inviteDraftOf(data: Record<string, unknown>): StoredInviteDraft | null {
  const raw = data.inviteDraft;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.programmeId !== "string" || typeof d.text !== "string" || !d.text.trim()) return null;
  return {
    programmeId: d.programmeId,
    text: d.text,
    basis: typeof d.basis === "string" ? d.basis : "",
    model: typeof d.model === "string" ? d.model : "",
    at: typeof d.at === "string" ? d.at : "",
  };
}

/** Claude's drafts for these people, by uid, read from their assessment documents. */
export async function loadInviteDrafts(
  db: Firestore,
  roundId: string,
  uids: readonly string[],
): Promise<Map<string, StoredInviteDraft>> {
  const drafts = new Map<string, StoredInviteDraft>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids
      .slice(i, i + 100)
      .map((uid) => db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(roundId, uid)));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) {
      if (!snap.exists) continue;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const draft = inviteDraftOf(data);
      if (draft && typeof data.uid === "string" && uids.includes(data.uid)) drafts.set(data.uid, draft);
    }
  }
  return drafts;
}
