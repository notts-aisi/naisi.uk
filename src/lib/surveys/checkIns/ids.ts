import "server-only";
import { createHash } from "node:crypto";

/**
 * A CHECK-IN'S ID, worked out from the session it is about: one run, one
 * group, one session (`sessionKey`). The same session always gives the same
 * id, so opening it is claimed by creating that one document (two presses
 * make one check-in), and the register reads a group's check-ins by their ids
 * with no query at all.
 *
 * `ci-` and forty hex characters: a survey id this site accepts (`isSurveyId`),
 * with no `_`, so a person's row (`{surveyId}__{uid}`) reads one way only. A
 * hash rather than the parts themselves, so the id carries no run or group id
 * into an address or a log line.
 */
export function checkInSurveyId(runId: string, groupId: string, sessionKey: string): string {
  const digest = createHash("sha256").update(`check-in\u0000${runId}\u0000${groupId}\u0000${sessionKey}`).digest("hex");
  return `ci-${digest.slice(0, 40)}`;
}
