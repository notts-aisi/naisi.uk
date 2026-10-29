import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { PLACEMENT_NOTES_COLLECTION, type PlacementChoice, type StoredChoice } from "./model";

/**
 * WHERE A NOTE FOR SOMEBODY PLACED OUTSIDE THE TIMES THEY GAVE IS KEPT, and
 * Claude's draft of one.
 *
 * One document per person per run, `coursePlacementNotes/{runId}__{uid}`, in a
 * collection no browser can read or write (`firestore.rules` shuts it): the
 * Admin SDK is the only way in, through the notes route and Publish. It holds:
 *
 *  - the CHOICE a person saved for the group they were in then: words of our
 *    own (`choice: "note"`, `text`), or "Send without a note" (`"none"`),
 *    with who saved it and when;
 *  - when the press that told them SENT it (`sentAt`), after which it is
 *    spent (`noteStandingFor` in `./model.ts`).
 *
 * Every document carries `runId` and `uid`, so destroying the run
 * (`src/lib/firestore/courseDeletion.ts`) and deleting the account
 * (`src/lib/firestore/accountDeletion.ts`) each find and delete it by one
 * equality.
 *
 * CLAUDE'S DRAFT IS NOT KEPT HERE. It is drafted from the person's
 * application, so it is kept with Claude's other notes on that application,
 * on its assessment document (`admissionAssessments/{roundId}__{uid}`, field
 * `placementDraft`), exactly as an invitation note's draft is: "Clear all
 * reads", the application's deletion and the account's deletion all take it,
 * and nothing that emails reads it. Only words a person saved go in an email.
 */

export { PLACEMENT_NOTES_COLLECTION };

export function placementNoteId(runId: string, uid: string): string {
  return `${runId}__${uid}`;
}

/** Claude's draft, as kept on the application's assessment document. Never sent. */
export type StoredPlacementDraft = {
  /** The run it was drafted for: a draft for another run is not shown. */
  runId: string;
  /** The note, as Claude drafted it. */
  text: string;
  /** For the admin, never the person: what in the application the draft drew on. */
  basis: string;
  /** The model that answered, as Anthropic reported it. */
  model: string;
  /** ISO instant. */
  at: string;
};

export type StoredPlacementNote = StoredChoice & {
  runId: string;
  uid: string;
  savedByUid: string | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null;
  return typeof stamp?.toDate === "function" ? stamp.toDate() : null;
}

function draftOf(raw: unknown): StoredPlacementDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.runId !== "string" || typeof d.text !== "string" || !d.text.trim()) return null;
  return {
    runId: d.runId,
    text: d.text,
    basis: typeof d.basis === "string" ? d.basis : "",
    model: typeof d.model === "string" ? d.model : "",
    at: typeof d.at === "string" ? d.at : "",
  };
}

export function normalizePlacementNote(data: Record<string, unknown>): StoredPlacementNote {
  const choice = data.choice === "note" || data.choice === "none" ? (data.choice as PlacementChoice) : null;
  return {
    runId: typeof data.runId === "string" ? data.runId : "",
    uid: typeof data.uid === "string" ? data.uid : "",
    groupId: typeof data.groupId === "string" ? data.groupId : null,
    choice,
    text: typeof data.text === "string" ? data.text : "",
    savedByUid: typeof data.savedByUid === "string" ? data.savedByUid : null,
    savedByName: typeof data.savedByName === "string" ? data.savedByName : null,
    savedAt: toDate(data.savedAt),
    sentAt: toDate(data.sentAt),
  };
}

/** What is kept for these people on this run, by uid. Addressed reads only. */
export async function readPlacementNotes(
  db: Firestore,
  runId: string,
  uids: Iterable<string>,
): Promise<Map<string, StoredPlacementNote>> {
  const list = [...new Set([...uids].filter((uid) => uid && !uid.includes("/")))];
  const out = new Map<string, StoredPlacementNote>();
  for (let at = 0; at < list.length; at += 300) {
    const refs = list.slice(at, at + 300).map((uid) => db.collection(PLACEMENT_NOTES_COLLECTION).doc(placementNoteId(runId, uid)));
    for (const snap of await db.getAll(...refs)) {
      if (!snap.exists) continue;
      const note = normalizePlacementNote((snap.data() ?? {}) as Record<string, unknown>);
      if (note.runId === runId && note.uid) out.set(note.uid, note);
    }
  }
  return out;
}

/**
 * Keep a person's choice for one group: words of our own, or none. Replaces
 * whatever was chosen before, for any group, and starts it unsent. Claude's
 * draft is left where it is.
 */
export async function savePlacementChoice(
  db: Firestore,
  input: {
    runId: string;
    uid: string;
    groupId: string;
    choice: PlacementChoice;
    text: string;
    by: { uid: string; name: string };
  },
): Promise<void> {
  await db
    .collection(PLACEMENT_NOTES_COLLECTION)
    .doc(placementNoteId(input.runId, input.uid))
    .set(
      {
        runId: input.runId,
        uid: input.uid,
        groupId: input.groupId,
        choice: input.choice,
        text: input.choice === "note" ? input.text : "",
        savedByUid: input.by.uid,
        savedByName: input.by.name,
        savedAt: FieldValue.serverTimestamp(),
        sentAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/**
 * Keep Claude's draft with Claude's other notes on the person's application,
 * replacing any draft before it. Nothing here is sent.
 */
export async function savePlacementDraft(
  db: Firestore,
  roundId: string,
  uid: string,
  draft: StoredPlacementDraft,
): Promise<void> {
  await db
    .collection(ASSESSMENTS_COLLECTION)
    .doc(admissionAssessmentId(roundId, uid))
    .set({ roundId, uid, placementDraft: draft, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Claude's drafts for these people on this run, by uid, read from their applications' assessment documents. */
export async function readPlacementDrafts(
  db: Firestore,
  runId: string,
  people: readonly { uid: string; roundId: string }[],
): Promise<Map<string, StoredPlacementDraft>> {
  const out = new Map<string, StoredPlacementDraft>();
  for (let at = 0; at < people.length; at += 100) {
    const slice = people.slice(at, at + 100);
    if (slice.length === 0) continue;
    const snaps = await db.getAll(
      ...slice.map((person) => db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(person.roundId, person.uid))),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const draft = draftOf(data.placementDraft);
      if (draft && draft.runId === runId && typeof data.uid === "string") out.set(data.uid, draft);
    }
  }
  return out;
}

/** The press that told them has sent what was chosen: it is spent. */
export async function markPlacementNoteSent(db: Firestore, runId: string, uid: string): Promise<void> {
  await db
    .collection(PLACEMENT_NOTES_COLLECTION)
    .doc(placementNoteId(runId, uid))
    .update({ sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}
