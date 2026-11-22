import { send, type Answer } from "../courses/excused/api";

/**
 * THE PRESSES OF ASK THE TEAM, from the browser: the member's message, and an
 * admin's Take it and reply (`POST /api/courses/requests/[requestId]/team/<action>`).
 * Every route decides everything again; the page only says what the route
 * answered. Nothing here logs a body: a message is the person's own words.
 */

export type { Answer };

export function sendTeamMessage(topic: string, words: string): Promise<Answer> {
  return send("/api/courses/requests/ask", { topic, words });
}

const path = (requestId: string, action: string) => `/api/courses/requests/${encodeURIComponent(requestId)}/team/${action}`;

export function takeTeamMessage(requestId: string): Promise<Answer> {
  return send(path(requestId, "take"), {});
}

export function replyToTeamMessage(requestId: string, reply: string): Promise<Answer> {
  return send(path(requestId, "reply"), { reply: reply.trim() });
}
