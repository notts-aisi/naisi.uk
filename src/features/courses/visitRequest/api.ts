import { send, type Answer } from "../excused/api";

/**
 * THE PRESSES ABOUT GOING TO ANOTHER GROUP'S SESSION FOR A WEEK, from the
 * browser: the person's ask, withdraw and dismiss, and an admin's approve,
 * decline, reply and take (`POST /api/courses/requests/[requestId]/visit/<action>`).
 * Every route decides everything again; the page only says what the route
 * answered. Nothing here logs a body.
 */

export type { Answer };

/** Ask to go to that group's session in the week of their next session, with anything they add. */
export function askForVisit(runId: string, hostGroupId: string, reason: string): Promise<Answer> {
  return send(`/api/courses/runs/${encodeURIComponent(runId)}/requests/visit`, reason.trim() ? { hostGroupId, reason: reason.trim() } : { hostGroupId });
}

const path = (requestId: string, action: string) => `/api/courses/requests/${encodeURIComponent(requestId)}/visit/${action}`;

export function withdrawVisitRequest(requestId: string): Promise<Answer> {
  return send(path(requestId, "withdraw"), {});
}

export function dismissVisitRequest(requestId: string): Promise<Answer> {
  return send(path(requestId, "dismiss"), {});
}

export function approveVisitRequest(requestId: string, emailCount: number, overLimit: boolean, reply: string): Promise<Answer> {
  return send(path(requestId, "approve"), { emailCount, overLimit, ...(reply.trim() ? { reply: reply.trim() } : {}) });
}

export function declineVisitRequest(requestId: string, reply: string): Promise<Answer> {
  return send(path(requestId, "decline"), { reply: reply.trim() });
}

export function replyToVisitRequest(requestId: string, reply: string): Promise<Answer> {
  return send(path(requestId, "reply"), { reply: reply.trim() });
}

export function takeVisitRequest(requestId: string): Promise<Answer> {
  return send(path(requestId, "take"), {});
}
