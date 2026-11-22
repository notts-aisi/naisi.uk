import { send, type Answer } from "../excused/api";

/**
 * THE PRESSES ABOUT CHANGING GROUP FOR GOOD, from the browser: the person's
 * ask, withdraw and dismiss, and an admin's approve, decline, reply and take
 * (`POST /api/courses/requests/[requestId]/move/<action>`). Every route
 * decides everything again; the page only says what the route answered.
 * Nothing here logs a body.
 */

export type { Answer };

/** Ask to move to that group for the rest of the programme, with why. */
export function askToChangeGroup(runId: string, toGroupId: string, reason: string): Promise<Answer> {
  return send(`/api/courses/runs/${encodeURIComponent(runId)}/requests/move`, { toGroupId, reason: reason.trim() });
}

const path = (requestId: string, action: string) => `/api/courses/requests/${encodeURIComponent(requestId)}/move/${action}`;

export function withdrawMoveRequest(requestId: string): Promise<Answer> {
  return send(path(requestId, "withdraw"), {});
}

export function dismissMoveRequest(requestId: string): Promise<Answer> {
  return send(path(requestId, "dismiss"), {});
}

export function approveMoveRequest(requestId: string, weekNumber: number, emailCount: number, reply: string): Promise<Answer> {
  return send(path(requestId, "approve"), { weekNumber, emailCount, ...(reply.trim() ? { reply: reply.trim() } : {}) });
}

export function declineMoveRequest(requestId: string, reply: string): Promise<Answer> {
  return send(path(requestId, "decline"), { reply: reply.trim() });
}

export function replyToMoveRequest(requestId: string, reply: string): Promise<Answer> {
  return send(path(requestId, "reply"), { reply: reply.trim() });
}

export function takeMoveRequest(requestId: string): Promise<Answer> {
  return send(path(requestId, "take"), {});
}
