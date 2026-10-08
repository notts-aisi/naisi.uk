/**
 * The two audit rows the decision routes append to the course audit log.
 *
 * A decision document keeps only the latest answer for each programme, so the
 * log is where "who decided what, and when" stays answerable after a lead
 * changes their mind or an admin takes an acceptance back. Rows are written
 * in the same transaction as the decision they describe, so neither exists
 * without the other.
 *
 * These rows belong to a form and not to a course run, so `runId` is empty
 * and `roundId` names the form. Each also stores `programmeId` (the programme
 * the decision was for) and, on a revocation, `reason` as the admin wrote it,
 * so the programme's lead can be shown it.
 *
 * ## A line names the applicant by account id, and never by name
 *
 * The log is kept when an account is deleted: it is the record of what the
 * committee did. So a line about a decision must not be the thing that goes
 * on naming a person who has asked to be forgotten. Who a line is about is
 * its `subjectUid`, and nothing else on the row says: the sentence calls them
 * "an applicant", and no field holds a name, a first name or an address.
 * While the account exists the id leads to the name; once it has gone the id
 * leads nowhere, which is the point.
 *
 * `subjectLabel` below is how anything that DRAWS a line says who it was
 * about, so that a screen never has to decide what a missing account reads
 * as. `tests/applications-d2-zeta-audit-names.test.mjs` runs every writer of an
 * application line and fails on a row that carries a name.
 *
 * No server import: the strings are also read by tests. The one import is of
 * a type, and it is how each name below is held to the log's own list of
 * kinds: a name the log does not carry does not compile.
 */
import type { CourseAuditKind } from "@/lib/firestore/courseAudit";

/** A lead or an admin accepted, pooled or declined an application. */
export const DECISION_AUDIT_KIND = "application-decision" satisfies CourseAuditKind;

/** An admin took an acceptance back, with a reason. */
export const REVOCATION_AUDIT_KIND = "application-decision-revoked" satisfies CourseAuditKind;

/** What a line calls the person it is about. Their id is beside it, in `subjectUid`. */
const AN_APPLICANT = "an applicant";

/** The sentence a decision's audit row carries. It does not name the applicant. */
export function decisionSentence(input: {
  actorName: string;
  programmeName: string;
  decision: "accept" | "pool" | "decline";
  /** What this programme had decided before, when it had. */
  previous: "accept" | "pool" | "decline" | null;
}): string {
  const verb = { accept: "accepted", pool: "pooled", decline: "declined" }[input.decision];
  const was = input.previous
    ? ` It was ${{ accept: "accepted", pool: "pooled", decline: "declined" }[input.previous]} before.`
    : "";
  return `${input.actorName} ${verb} ${AN_APPLICANT} for ${input.programmeName}.${was}`;
}

/** The sentence a revocation's audit row carries. It does not name the applicant. */
export function revocationSentence(input: {
  actorName: string;
  programmeName: string;
  reason: string;
}): string {
  return (
    `${input.actorName} revoked ${AN_APPLICANT}’s acceptance for ${input.programmeName}. ` +
    `Reason: ${input.reason}`
  );
}

/** What a line's subject reads as once their account has been deleted. */
export const DELETED_ACCOUNT_LABEL = "somebody whose account has been deleted";

/**
 * Who a line was about, for a screen that draws one.
 *
 * `name` is what the caller found by looking the line's `subjectUid` up NOW:
 * the account's name while there is an account, and null when there is none.
 * The name is never read off the line, because the line does not hold one.
 */
export function subjectLabel(name: string | null | undefined): string {
  const found = typeof name === "string" ? name.trim() : "";
  return found || DELETED_ACCOUNT_LABEL;
}
