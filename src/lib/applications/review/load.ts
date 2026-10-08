import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { formatRoundDate } from "@/lib/admissions/window";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import {
  canDecideFor,
  canReadApplication,
  canSeeForm,
  programmeRolesFor,
  roleOnProgramme,
  type ProgrammeRole,
} from "../access";
import type { QuestionSetDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { loadForm, loadQuestionSets } from "../repo";
import { listDecisions, listReviews, listSentApplications } from "../staffRepo";
import { REVOCATION_AUDIT_KIND } from "./audit";
import { buildProgrammeBoard } from "./board";
import { buildReview } from "./detail";
import { emptyMap, own, programmeOn } from "./own";
import { UNNAMED_STAFF, firstWord } from "./people";
import { NOT_FOUND } from "./refusals";
import { listedOn, termPictureFor, type TermPicture, type Viewer } from "./term";
import type { ProgrammeBoard, Refusal, ReviewPayload } from "./types";

/**
 * READING FOR THE REVIEW SCREENS: the gate, then the documents, then the
 * projection.
 *
 * Both loaders answer in the same order, and the order is the point:
 *
 *  1. The form is read, because a staff role is a property of the form.
 *  2. The caller's role is asked of `access.ts`. Somebody with no role is
 *     told "Not found", in the same words as for a form that does not exist,
 *     so nobody learns that a form or a programme is there by asking.
 *  3. Only then are applications, reviews and decisions read, and what leaves
 *     is built field by field by `board.ts` and `detail.ts`.
 *
 * Nothing here writes. The page and the GET route for each screen call the
 * same loader, so they cannot disagree about who may see what.
 */

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

/** `getAll` in batches, skipping the call entirely for nobody. */
async function userDocs(db: Firestore, uids: readonly string[]) {
  const unique = [...new Set(uids.filter(Boolean))];
  const found = new Map<string, Raw>();
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) found.set(snap.id, asRecord(snap.data()));
    }
  }
  return found;
}

/** What a committee member is called on these screens: their first name. */
export async function loadStaffNames(
  db: Firestore,
  uids: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const [uid, data] of await userDocs(db, uids)) {
    const preferred = asRecord(data.profile).preferredName;
    const display = typeof data.displayName === "string" ? data.displayName : "";
    const name =
      (typeof preferred === "string" && preferred.trim()) || firstWord(display) || UNNAMED_STAFF;
    names.set(uid, name);
  }
  return names;
}

/** The applicants whose account is still waiting to be approved. */
async function loadPendingUids(db: Firestore, uids: readonly string[]): Promise<Set<string>> {
  const pending = new Set<string>();
  for (const [uid, data] of await userDocs(db, uids)) {
    if (data.role === "pending") pending.add(uid);
  }
  return pending;
}

/** The caller, reduced to what the builders read. Roles come from `access.ts`. */
export function viewerFor(
  user: SessionUser,
  form: ApplicationForm,
  staffNames: ReadonlyMap<string, string>,
): { viewer: Viewer; leads: Set<string> } {
  const roles = emptyMap<ProgrammeRole>();
  for (const { programmeId, role } of programmeRolesFor(user, form)) roles[programmeId] = role;
  const leads = new Set<string>();
  for (const programmeId of form.programmeIds) {
    const leadUid = programmeOn(form, programmeId)?.leadUid ?? null;
    if (isNamedWithStanding(user, "admissionRounds.leadUid", leadUid)) leads.add(programmeId);
  }
  const name = staffNames.get(user.uid) ?? (firstWord(user.displayName ?? "") || UNNAMED_STAFF);
  return { viewer: { uid: user.uid, name, isAdmin: user.role === "admin", roles }, leads };
}

type Loaded = {
  form: ApplicationForm;
  sets: QuestionSetDoc[];
  term: TermPicture;
};

/** Everything a screen is built from. Called only after the caller is gated. */
async function loadTerm(db: Firestore, form: ApplicationForm, viewerUid: string): Promise<Loaded> {
  const [sets, applications, decisions, reviews] = await Promise.all([
    loadQuestionSets(db, form.round.id),
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    listReviews(db, form.round.id),
  ]);
  return { form, sets, term: termPictureFor({ form, applications, decisions, reviews, viewerUid }) };
}

/** Everybody a form names as a lead, once each. */
function leadUids(form: ApplicationForm): string[] {
  const uids: string[] = [];
  for (const programmeId of form.programmeIds) {
    const leadUid = programmeOn(form, programmeId)?.leadUid;
    if (leadUid && !uids.includes(leadUid)) uids.push(leadUid);
  }
  return uids;
}

export type BoardResult = { ok: true; board: ProgrammeBoard } | Refusal;

/** One programme's applications, for a caller with a role on it. */
export async function loadProgrammeBoard(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<BoardResult> {
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  // The id came from the address. It is a programme only if the form itself
  // carries it, which is asked before anything is looked up by it.
  if (!programmeOn(form, programmeId)) return NOT_FOUND;
  if (roleOnProgramme(user, form, programmeId) === null) return NOT_FOUND;

  const { sets, term } = await loadTerm(db, form, user.uid);
  const mine = term.applications
    .filter((application) => listedOn(term, application.uid).includes(programmeId))
    .map((application) => application.uid);
  const [staffNames, pendingUids] = await Promise.all([
    loadStaffNames(db, [...leadUids(form), user.uid]),
    loadPendingUids(db, mine),
  ]);
  const { viewer } = viewerFor(user, form, staffNames);
  const board = buildProgrammeBoard({
    form,
    sets,
    term,
    viewer,
    programmeId,
    canDecide: canDecideFor(user, form, programmeId),
    pendingUids,
    staffNames,
  });
  return board ? { ok: true, board } : NOT_FOUND;
}

/** The last time an admin took an acceptance back for this programme, if ever. */
async function loadLastRevocation(
  db: Firestore,
  roundId: string,
  programmeId: string,
  applicantUid: string,
): Promise<ReviewPayload["decision"]["lastRevocation"]> {
  const snap = await db
    .collection(COURSE_AUDIT_COLLECTION)
    .where("subjectUid", "==", applicantUid)
    .get();
  let latest: { at: Date | null; byName: string; reason: string } | null = null;
  for (const doc of snap.docs) {
    const data = asRecord(doc.data());
    if (data.kind !== REVOCATION_AUDIT_KIND) continue;
    if (data.roundId !== roundId || data.programmeId !== programmeId) continue;
    const stamp = data.at as Date | { toDate?: () => Date } | null | undefined;
    const at =
      stamp instanceof Date
        ? stamp
        : stamp && typeof stamp.toDate === "function"
          ? stamp.toDate()
          : null;
    if (latest && (latest.at?.getTime() ?? 0) >= (at?.getTime() ?? 0)) continue;
    latest = {
      at,
      byName: firstWord(typeof data.actorName === "string" ? data.actorName : "") || UNNAMED_STAFF,
      reason: typeof data.reason === "string" ? data.reason : "",
    };
  }
  if (!latest) return null;
  return {
    byName: latest.byName,
    on: latest.at ? formatRoundDate(latest.at) : null,
    reason: latest.reason,
  };
}

export type ReviewResult = { ok: true; review: ReviewPayload } | Refusal;

/**
 * One application, for a caller who may read it. `programmeId` is the
 * programme they opened it under; without one it is the first programme the
 * caller has a role on among those the applicant ranked and the one they
 * joined by accepting an invitation.
 */
export async function loadReview(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
  programmeId: string | null,
): Promise<ReviewResult> {
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  if (!canSeeForm(user, form)) return NOT_FOUND;
  // Nobody reads their own application through the committee's screens: what
  // was scored and decided about them is not theirs to see before decision day.
  if (applicantUid === user.uid) return NOT_FOUND;

  const { sets, term } = await loadTerm(db, form, user.uid);
  const application = term.applications.find((entry) => entry.uid === applicantUid) ?? null;
  if (!application) return NOT_FOUND;
  const ranked = term.ranked.get(applicantUid) ?? [];
  if (!canReadApplication(user, form, ranked, term.joined.get(applicantUid) ?? null)) return NOT_FOUND;

  // The programmes this application can be opened under: the ones it ranked,
  // and the one its owner joined by accepting an invitation.
  const listed = listedOn(term, applicantUid);
  const focus =
    programmeId ??
    listed.find((id) => programmeOn(form, id) && roleOnProgramme(user, form, id) !== null) ??
    null;
  if (
    !focus ||
    !programmeOn(form, focus) ||
    !listed.includes(focus) ||
    roleOnProgramme(user, form, focus) === null
  ) {
    return NOT_FOUND;
  }

  const reviews = term.reviews.get(applicantUid) ?? [];
  const decision = term.decisions.get(applicantUid) ?? null;
  const decidedBy = Object.values(decision?.programmes ?? {}).map((entry) => entry.decidedByUid);
  const canDecide = canDecideFor(user, form, focus);
  const [staffNames, pendingUids, lastRevocation] = await Promise.all([
    loadStaffNames(db, [
      ...leadUids(form),
      ...reviews.map((review) => review.reviewerUid),
      ...decidedBy,
      user.uid,
    ]),
    loadPendingUids(db, [applicantUid]),
    canDecide && !own(decision?.programmes, focus)
      ? loadLastRevocation(db, form.round.id, focus, applicantUid)
      : Promise.resolve(null),
  ]);
  const { viewer, leads } = viewerFor(user, form, staffNames);

  const board = buildProgrammeBoard({
    form,
    sets,
    term,
    viewer,
    programmeId: focus,
    canDecide,
    pendingUids,
    staffNames,
  });
  if (!board) return NOT_FOUND;

  const review = buildReview({
    form,
    sets,
    term,
    viewer,
    leads,
    programmeId: focus,
    canDecide,
    application,
    accountWaiting: pendingUids.has(applicantUid),
    staffNames,
    order: board.rows.map((row) => row.uid),
    queue: board.queue,
    lastRevocation,
  });
  return review ? { ok: true, review } : NOT_FOUND;
}
