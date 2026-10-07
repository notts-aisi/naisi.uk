import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { ROUNDS_COLLECTION } from "@/lib/firestore/admissionRounds";
import { isEligibleAdmissionsReviewer, normalizeUser } from "@/lib/firestore/users";
import { APPLICATION_LIMITS } from "./model";
import { isApplicationForm, normaliseForm, type ApplicationForm } from "./normalise";

/**
 * APPOINTING A PROGRAMME'S LEAD AND ITS REVIEWERS. The one writer.
 *
 * This is an ACCESS GRANT, not authoring: being named here is what lets a
 * person read applications, which are personal. So it has the same three
 * properties as the round roles route it sits beside:
 *
 *  - ONLY AN ADMIN CHANGES THE LEAD. A programme's own lead may add and
 *    remove its reviewers, and nobody else may.
 *  - EVERYBODY NAMED IS CHECKED AGAINST THEIR LIVE USER DOCUMENT. A lead or a
 *    reviewer has to be an admin or SU-recognised committee, read at request
 *    time and never taken from the browser, and a refusal names the person
 *    rather than dropping them, because a reviewer who vanishes from a saved
 *    list is a programme that quietly ends up under-staffed.
 *  - THE ROUND'S OWN `reviewerUids` IS KEPT AS THE UNION of every lead and
 *    reviewer on the form, together with the server-owned
 *    `users.admissionsReviewer` flag that draws the sidebar entry. Every
 *    existing gate keys off those two, so they keep meaning "this person is
 *    on this round" without any of them learning about programmes.
 *
 * The write is one transaction on the round, so two people editing two
 * programmes at once each see the other's change in the union.
 */

export type ProgrammeRolesChange = {
  /** Omit to leave the lead as it is. Null removes the lead. */
  leadUid?: string | null;
  /** Omit to leave the reviewers as they are. */
  reviewerUids?: string[];
};

export type ProgrammeRolesResult =
  | { ok: true; form: ApplicationForm; added: string[]; removed: string[] }
  | { ok: false; status: 400 | 403 | 404; error: string; uids?: string[] };

function refuse(
  status: 400 | 403 | 404,
  error: string,
  uids?: string[],
): ProgrammeRolesResult {
  return uids ? { ok: false, status, error, uids } : { ok: false, status, error };
}

/** Everybody a form names: every lead and every reviewer, once each. */
export function everyoneNamedOn(form: Pick<ApplicationForm, "programmeIds" | "programmes">): string[] {
  const named: string[] = [];
  for (const programmeId of form.programmeIds) {
    const programme = form.programmes[programmeId];
    if (!programme) continue;
    for (const uid of [programme.leadUid, ...programme.reviewerUids]) {
      if (uid && !named.includes(uid)) named.push(uid);
    }
  }
  return named;
}

function cleanUids(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of raw) {
    const uid = typeof value === "string" ? value.trim() : "";
    if (uid && !out.includes(uid)) out.push(uid);
  }
  return out;
}

export async function setProgrammeRoles(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  change: ProgrammeRolesChange,
): Promise<ProgrammeRolesResult> {
  const roundRef = db.collection(ROUNDS_COLLECTION).doc(roundId);

  // People this save could take off the form are looked up BEFORE the
  // transaction: whether another round still names them decides whether they
  // keep the sidebar flag. The flag is a hint and never the boundary, so a
  // read that is a moment stale costs a link, not access.
  const before = await roundRef.get();
  if (!before.exists || !isApplicationForm(before.data())) {
    return refuse(404, "There is no application form here.");
  }
  const stale = normaliseForm(before.id, before.data());
  if (!stale.programmes[programmeId]) return refuse(404, "That programme is not on this form.");

  const isAdmin = actor.role === "admin";
  const isLead = isNamedWithStanding(
    actor,
    "admissionRounds.leadUid",
    stale.programmes[programmeId].leadUid,
  );
  if (!isAdmin && !isLead) {
    return refuse(403, "Only an admin or this programme's lead can change who reviews it.");
  }
  if (change.leadUid !== undefined && !isAdmin) {
    return refuse(403, "Only an admin can change the lead.");
  }

  const nextReviewers =
    change.reviewerUids === undefined ? null : cleanUids(change.reviewerUids);
  if (nextReviewers && nextReviewers.length > APPLICATION_LIMITS.maxProgrammeReviewers) {
    return refuse(
      400,
      `A programme takes at most ${APPLICATION_LIMITS.maxProgrammeReviewers} reviewers.`,
    );
  }
  const nextLead =
    change.leadUid === undefined
      ? undefined
      : typeof change.leadUid === "string" && change.leadUid.trim()
        ? change.leadUid.trim()
        : null;

  // Eligibility, against each newly named person's LIVE user document.
  const toCheck = cleanUids([...(nextReviewers ?? []), ...(nextLead ? [nextLead] : [])]);
  if (toCheck.length > 0) {
    const docs = await db.getAll(...toCheck.map((uid) => db.collection("users").doc(uid)));
    const missing: string[] = [];
    const ineligible: string[] = [];
    for (const doc of docs) {
      if (!doc.exists) {
        missing.push(doc.id);
        continue;
      }
      const candidate = normalizeUser(doc.id, doc.data() ?? {});
      if (!isEligibleAdmissionsReviewer(candidate)) {
        ineligible.push(candidate.displayName || candidate.email || doc.id);
      }
    }
    if (missing.length > 0) {
      return refuse(
        400,
        "Somebody named here no longer has an account on this site. Reload and save again.",
        missing,
      );
    }
    if (ineligible.length > 0) {
      return refuse(
        400,
        `${ineligible.join(", ")} cannot be named here. Leads and reviewers have to be admins or ` +
          "SU-recognised committee, because they read applications.",
        ineligible,
      );
    }
  }

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef);
    if (!snap.exists || !isApplicationForm(snap.data())) return null;
    const form = normaliseForm(snap.id, snap.data());
    const programme = form.programmes[programmeId];
    if (!programme) return null;

    // Who the form names NOW is read from the programmes as well as from the
    // stored union, so a union that has drifted is repaired by the next save
    // rather than trusted: somebody named on a programme and missing from the
    // union still loses their flag when they are taken off.
    const namedBefore = new Set([
      ...form.round.reviewerUids,
      ...everyoneNamedOn(form),
      ...(form.round.finalDeciderUid ? [form.round.finalDeciderUid] : []),
    ]);

    const leadUid = nextLead === undefined ? programme.leadUid : nextLead;
    const reviewerUids = nextReviewers ?? programme.reviewerUids;
    const next = {
      ...form,
      programmes: { ...form.programmes, [programmeId]: { ...programme, leadUid, reviewerUids } },
    };
    const union = everyoneNamedOn(next);
    const namedAfter = new Set([
      ...union,
      ...(form.round.finalDeciderUid ? [form.round.finalDeciderUid] : []),
    ]);

    tx.update(roundRef, {
      [`programmes.${programmeId}.leadUid`]: leadUid,
      [`programmes.${programmeId}.reviewerUids`]: reviewerUids,
      reviewerUids: union,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      added: [...namedAfter].filter((uid) => !namedBefore.has(uid)),
      removed: [...namedBefore].filter((uid) => !namedAfter.has(uid)),
    };
  });
  if (!outcome) return refuse(404, "That programme is not on this form.");

  // The sidebar flag: on for everybody newly named, off for everybody this
  // took off the form who is not still named on another round. Both lookups
  // are single-field, so neither needs a composite index.
  const stillElsewhere = new Set<string>();
  for (const uid of outcome.removed) {
    const asReviewer = await db
      .collection(ROUNDS_COLLECTION)
      .where("reviewerUids", "array-contains", uid)
      .get();
    if (asReviewer.docs.some((doc) => doc.id !== roundId)) {
      stillElsewhere.add(uid);
      continue;
    }
    const asDecider = await db
      .collection(ROUNDS_COLLECTION)
      .where("finalDeciderUid", "==", uid)
      .get();
    if (asDecider.docs.some((doc) => doc.id !== roundId)) stillElsewhere.add(uid);
  }
  const toClear = outcome.removed.filter((uid) => !stillElsewhere.has(uid));
  const flagWrites = [...outcome.added.map((uid) => [uid, true] as const), ...toClear.map((uid) => [uid, false] as const)];
  if (flagWrites.length > 0) {
    // An account deleted since it was named has no document to update, and one
    // missing document would reject the whole batch.
    const docs = await db.getAll(...flagWrites.map(([uid]) => db.collection("users").doc(uid)));
    const present = new Set(docs.filter((doc) => doc.exists).map((doc) => doc.id));
    const batch = db.batch();
    let writes = 0;
    for (const [uid, value] of flagWrites) {
      if (!present.has(uid)) continue;
      batch.update(db.collection("users").doc(uid), { admissionsReviewer: value });
      writes += 1;
    }
    if (writes > 0) await batch.commit();
  }

  const saved = await roundRef.get();
  return {
    ok: true,
    form: normaliseForm(saved.id, saved.data()),
    added: outcome.added,
    removed: outcome.removed,
  };
}
