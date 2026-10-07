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
 * No server import: the strings are also read by tests.
 */

/** A lead or an admin accepted, pooled or declined an application. */
export const DECISION_AUDIT_KIND = "application-decision";

/** An admin took an acceptance back, with a reason. */
export const REVOCATION_AUDIT_KIND = "application-decision-revoked";

/** The sentence a decision's audit row carries. */
export function decisionSentence(input: {
  actorName: string;
  applicantName: string;
  programmeName: string;
  decision: "accept" | "pool" | "decline";
  /** What this programme had decided before, when it had. */
  previous: "accept" | "pool" | "decline" | null;
}): string {
  const verb = { accept: "accepted", pool: "pooled", decline: "declined" }[input.decision];
  const was = input.previous
    ? ` It was ${{ accept: "accepted", pool: "pooled", decline: "declined" }[input.previous]} before.`
    : "";
  return `${input.actorName} ${verb} ${input.applicantName} for ${input.programmeName}.${was}`;
}

/** The sentence a revocation's audit row carries. */
export function revocationSentence(input: {
  actorName: string;
  applicantName: string;
  programmeName: string;
  reason: string;
}): string {
  return (
    `${input.actorName} revoked ${input.applicantName}’s acceptance for ${input.programmeName}. ` +
    `Reason: ${input.reason}`
  );
}
