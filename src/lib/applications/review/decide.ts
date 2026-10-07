import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { canDecideFor, canRunTerm, roleOnProgramme } from "../access";
import {
  APPLICATION_LIMITS,
  POOL_REASONS,
  PROGRAMME_DECISION_KINDS,
  type PoolReason,
  type ProgrammeDecisionKind,
} from "../model";
import {
  isApplicationForm,
  isId,
  normaliseApplication,
  normaliseDecision,
  normaliseForm,
  type ApplicationForm,
} from "../normalise";
import { applicationRef, formRef, loadForm } from "../repo";
import { rankedProgrammes } from "../sections";
import { decisionRef } from "../staffRepo";
import {
  DECISION_AUDIT_KIND,
  REVOCATION_AUDIT_KIND,
  decisionSentence,
  revocationSentence,
} from "./audit";
import { own, programmeOn } from "./own";
import { UNNAMED_APPLICANT, UNNAMED_STAFF, applicantName, firstWord } from "./people";
import { DECISIONS_SENT, NOT_FOUND, closedToStaffWrites, refuse } from "./refusals";
import type { BulkDecisionResult, DecisionChange, Refusal } from "./types";

/**
 * A LEAD'S DECISION FOR THEIR OWN PROGRAMME, AND AN ADMIN TAKING ONE BACK.
 *
 * Every write here goes to the decision document beside the application and
 * to the audit log, in one transaction, and to nothing else. THE APPLICANT'S
 * OWN DOCUMENT IS NEVER WRITTEN and nothing is emailed: an applicant's status
 * stays "sent" until decision day publishes, which is what keeps anybody from
 * hearing early.
 *
 * What a decision is held to:
 *
 *  - ONLY THE PROGRAMME'S LEAD OR AN ADMIN decides (`canDecideFor`). Somebody
 *    with no role on the programme is told "Not found".
 *  - THE APPLICANT RANKED THE PROGRAMME, in the application they sent.
 *  - NOBODY DECIDES THEIR OWN APPLICATION.
 *  - UNTIL DECISION DAY. Once the form's decisions have been sent a decision
 *    cannot change. That is read again inside the transaction, so a decision
 *    and the send cannot both win.
 *
 * Revoking an acceptance is an admin's act (`canRunTerm`). It asks for a
 * reason, removes that programme's entry so the application is to review
 * again, and writes the reason to the log.
 */

const MAX_BULK = 200;

// ---------------------------------------------------------------------------
// Reading the request
// ---------------------------------------------------------------------------

export function parseDecision(body: unknown): { ok: true; change: DecisionChange } | Refusal {
  const raw = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  if (!isId(raw.programmeId)) return refuse(400, "Say which programme this decision is for.");
  const decision = raw.decision as ProgrammeDecisionKind;
  if (!PROGRAMME_DECISION_KINDS.includes(decision)) {
    return refuse(400, "Choose Accept, Pool or Decline.");
  }
  let poolReason: PoolReason | null = null;
  let couldSuitProgrammeId: string | null = null;
  if (decision === "pool") {
    if (raw.poolReason !== undefined && raw.poolReason !== null) {
      if (!POOL_REASONS.includes(raw.poolReason as PoolReason)) {
        return refuse(400, "The reason for pooling is Capacity or Better fit.");
      }
      poolReason = raw.poolReason as PoolReason;
    }
    if (raw.couldSuitProgrammeId !== undefined && raw.couldSuitProgrammeId !== null) {
      if (!isId(raw.couldSuitProgrammeId) || raw.couldSuitProgrammeId === raw.programmeId) {
        return refuse(400, "Pick a different programme they could suit.");
      }
      couldSuitProgrammeId = raw.couldSuitProgrammeId;
    }
  }
  return {
    ok: true,
    change: { programmeId: raw.programmeId, decision, poolReason, couldSuitProgrammeId },
  };
}

export function parseBulkDecision(
  body: unknown,
): { ok: true; uids: string[]; decision: "accept" | "pool" } | Refusal {
  const raw = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  if (raw.decision !== "accept" && raw.decision !== "pool") {
    return refuse(400, "Choose Accept or Pool for the applications you selected.");
  }
  if (!Array.isArray(raw.uids) || raw.uids.length === 0) {
    return refuse(400, "Select at least one application.");
  }
  if (raw.uids.length > MAX_BULK) {
    return refuse(400, `Decide ${MAX_BULK} applications at a time at most.`);
  }
  const uids: string[] = [];
  for (const value of raw.uids) {
    if (typeof value !== "string" || !isAddressableId(value)) {
      return refuse(400, "One of the selected applications is not an application.");
    }
    if (!uids.includes(value)) uids.push(value);
  }
  return { ok: true, uids, decision: raw.decision };
}

export function parseRevocation(
  body: unknown,
): { ok: true; programmeId: string; reason: string } | Refusal {
  const raw = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  if (!isId(raw.programmeId)) return refuse(400, "Say which programme’s acceptance to revoke.");
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (!reason) return refuse(400, "Say why you are revoking it.");
  if (reason.length > APPLICATION_LIMITS.revokeReason) {
    return refuse(400, `Keep the reason to ${APPLICATION_LIMITS.revokeReason} characters.`);
  }
  return { ok: true, programmeId: raw.programmeId, reason };
}

// ---------------------------------------------------------------------------
// One decision, in one transaction
// ---------------------------------------------------------------------------

type Applied =
  | { outcome: "changed" | "unchanged"; name: string }
  | { outcome: "refused"; status: Refusal["status"]; reason: string; name: string };

const actorNameOf = (user: SessionUser) => (user.displayName ?? "").trim() || UNNAMED_STAFF;

/**
 * Record one decision. The caller has already been held to `canDecideFor` on
 * the form it read; everything that could have changed since is read again
 * here, inside the transaction.
 */
async function applyDecision(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
  change: DecisionChange,
): Promise<Applied> {
  if (applicantUid === user.uid) {
    return { outcome: "refused", status: 403, reason: "You can’t decide your own application.", name: "" };
  }
  const roundRef = formRef(db, roundId);
  const appRef = applicationRef(db, roundId, applicantUid);
  const decRef = decisionRef(db, roundId, applicantUid);

  return db.runTransaction(async (tx): Promise<Applied> => {
    const [roundSnap, appSnap, decSnap] = await Promise.all([
      tx.get(roundRef),
      tx.get(appRef),
      tx.get(decRef),
    ]);
    if (!roundSnap.exists || !isApplicationForm(roundSnap.data())) {
      return { outcome: "refused", status: 404, reason: NOT_FOUND.error, name: "" };
    }
    const form = normaliseForm(roundSnap.id, roundSnap.data());
    const programme = programmeOn(form, change.programmeId);
    if (!programme || !canDecideFor(user, form, change.programmeId)) {
      return { outcome: "refused", status: 404, reason: NOT_FOUND.error, name: "" };
    }

    const application = appSnap.exists
      ? normaliseApplication(appSnap.id, appSnap.data(), form.round.availabilityGrid)
      : null;
    if (!application?.sent) {
      return {
        outcome: "refused",
        status: 404,
        reason: "There is no sent application here.",
        name: "",
      };
    }
    const name = applicantName(application.sent.aboutYou, application.displayName);
    if (form.decisionsSentAt) return { outcome: "refused", status: 409, reason: DECISIONS_SENT, name };
    const ranked = rankedProgrammes(form, application.sent).map((entry) => entry.id);
    if (!ranked.includes(change.programmeId)) {
      return {
        outcome: "refused",
        status: 409,
        reason: `They did not rank ${programme.shortName}.`,
        name,
      };
    }
    if (change.couldSuitProgrammeId && !programmeOn(form, change.couldSuitProgrammeId)) {
      return {
        outcome: "refused",
        status: 400,
        reason: "The programme they could suit is not on this form.",
        name,
      };
    }

    const existing = decSnap.exists ? normaliseDecision(decSnap.id, decSnap.data()) : null;
    const before = own(existing?.programmes, change.programmeId) ?? null;
    if (
      before &&
      before.decision === change.decision &&
      before.poolReason === change.poolReason &&
      before.couldSuitProgrammeId === change.couldSuitProgrammeId
    ) {
      return { outcome: "unchanged", name };
    }

    const entry = {
      decision: change.decision,
      poolReason: change.poolReason,
      couldSuitProgrammeId: change.couldSuitProgrammeId,
      decidedByUid: user.uid,
      decidedAt: FieldValue.serverTimestamp(),
    };
    // A merge, with the round and the applicant written every time: this may
    // be the write that creates the document, and the round's own clean-up
    // finds a decision by its `roundId`. Only this programme's entry is
    // touched, so another lead's decision, the outcome picked for a pooled
    // applicant and an exception are all left as they were.
    tx.set(
      decRef,
      {
        roundId,
        uid: applicantUid,
        programmes: { [change.programmeId]: entry },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: DECISION_AUDIT_KIND,
      runId: "",
      groupId: null,
      subjectUid: applicantUid,
      actorUid: user.uid,
      actorName: actorNameOf(user),
      targetLabel: `${form.round.label} · ${programme.shortName}`,
      detail: decisionSentence({
        actorName: firstWord(actorNameOf(user)),
        applicantName: name || UNNAMED_APPLICANT,
        programmeName: programme.shortName,
        decision: change.decision,
        previous: before?.decision ?? null,
      }),
      roundId,
      programmeId: change.programmeId,
      at: FieldValue.serverTimestamp(),
    });
    return { outcome: "changed", name };
  });
}

/** The checks one decision and a batch of them share, made before anything is written. */
async function gateDecision(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<{ ok: true; form: ApplicationForm } | Refusal> {
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  if (!programmeOn(form, programmeId)) return NOT_FOUND;
  if (roleOnProgramme(user, form, programmeId) === null) return NOT_FOUND;
  if (!canDecideFor(user, form, programmeId)) {
    return refuse(403, "Only the programme’s lead or an admin can decide.");
  }
  const closed = closedToStaffWrites(form);
  if (closed) return refuse(409, closed);
  if (form.decisionsSentAt) return refuse(409, DECISIONS_SENT);
  return { ok: true, form };
}

export type DecideResult = { ok: true; changed: boolean } | Refusal;

export async function decideApplication(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
  change: DecisionChange,
): Promise<DecideResult> {
  const gate = await gateDecision(db, user, roundId, change.programmeId);
  if (!gate.ok) return gate;
  const applied = await applyDecision(db, user, roundId, applicantUid, change);
  if (applied.outcome === "refused") return refuse(applied.status, applied.reason);
  return { ok: true, changed: applied.outcome === "changed" };
}

export type DecideManyResult = { ok: true; result: BulkDecisionResult } | Refusal;

/**
 * Accept or pool several applications. Each is its own transaction under the
 * same rules as a single decision, so one that is refused does not hold up the
 * rest, and the answer says which were refused and why.
 */
export async function decideMany(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  input: { uids: readonly string[]; decision: "accept" | "pool" },
): Promise<DecideManyResult> {
  const gate = await gateDecision(db, user, roundId, programmeId);
  if (!gate.ok) return gate;
  const result: BulkDecisionResult = {
    decision: input.decision,
    changed: 0,
    unchanged: 0,
    refused: [],
  };
  for (const uid of input.uids) {
    const applied = await applyDecision(db, user, roundId, uid, {
      programmeId,
      decision: input.decision,
      poolReason: null,
      couldSuitProgrammeId: null,
    });
    if (applied.outcome === "refused") {
      result.refused.push({ uid, name: applied.name, reason: applied.reason });
    } else if (applied.outcome === "changed") result.changed += 1;
    else result.unchanged += 1;
  }
  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// Revoking an acceptance
// ---------------------------------------------------------------------------

export type RevokeResult = { ok: true } | Refusal;

export async function revokeAcceptance(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  applicantUid: string,
  input: { programmeId: string; reason: string },
): Promise<RevokeResult> {
  if (!canRunTerm(user)) return refuse(403, "Only an admin can revoke an acceptance.");
  const form = await loadForm(db, roundId);
  if (!form || !programmeOn(form, input.programmeId)) return NOT_FOUND;
  const closed = closedToStaffWrites(form);
  if (closed) return refuse(409, closed);
  if (form.decisionsSentAt) return refuse(409, DECISIONS_SENT);

  const roundRef = formRef(db, roundId);
  const appRef = applicationRef(db, roundId, applicantUid);
  const decRef = decisionRef(db, roundId, applicantUid);
  return db.runTransaction(async (tx): Promise<RevokeResult> => {
    const [roundSnap, appSnap, decSnap] = await Promise.all([
      tx.get(roundRef),
      tx.get(appRef),
      tx.get(decRef),
    ]);
    if (!roundSnap.exists || !isApplicationForm(roundSnap.data())) return NOT_FOUND;
    const fresh = normaliseForm(roundSnap.id, roundSnap.data());
    const programme = programmeOn(fresh, input.programmeId);
    if (!programme) return NOT_FOUND;
    if (fresh.decisionsSentAt) return refuse(409, DECISIONS_SENT);

    const existing = decSnap.exists ? normaliseDecision(decSnap.id, decSnap.data()) : null;
    if (own(existing?.programmes, input.programmeId)?.decision !== "accept") {
      return refuse(409, `There is no acceptance for ${programme.shortName} to revoke.`);
    }
    const application = appSnap.exists
      ? normaliseApplication(appSnap.id, appSnap.data(), fresh.round.availabilityGrid)
      : null;
    const name = application?.sent
      ? applicantName(application.sent.aboutYou, application.displayName)
      : UNNAMED_APPLICANT;

    // The same merge as a decision, taking this one programme's entry out
    // and leaving everything else on the document as it was.
    tx.set(
      decRef,
      {
        roundId,
        uid: applicantUid,
        programmes: { [input.programmeId]: FieldValue.delete() },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: REVOCATION_AUDIT_KIND,
      runId: "",
      groupId: null,
      subjectUid: applicantUid,
      actorUid: user.uid,
      actorName: actorNameOf(user),
      targetLabel: `${fresh.round.label} · ${programme.shortName}`,
      detail: revocationSentence({
        actorName: firstWord(actorNameOf(user)),
        applicantName: name,
        programmeName: programme.shortName,
        reason: input.reason,
      }),
      roundId,
      programmeId: input.programmeId,
      reason: input.reason,
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// The admin's switch
// ---------------------------------------------------------------------------

export type SettingsResult = { ok: true; revealOtherReviews: boolean } | Refusal;

/**
 * Show other reviewers' scores on a first review, for everybody reviewing on
 * this form. An admin's switch (`canRunTerm`): it changes what every reviewer
 * is shown, so it is not a programme lead's to flip.
 */
export async function setRevealOtherReviews(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  value: unknown,
): Promise<SettingsResult> {
  if (!canRunTerm(user)) {
    return refuse(403, "Only an admin can change whether other reviewers’ scores are shown.");
  }
  if (typeof value !== "boolean") {
    return refuse(400, "Say whether other reviewers’ scores are shown: true or false.");
  }
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  await formRef(db, roundId).update({
    revealOtherReviews: value,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, revealOtherReviews: value };
}
