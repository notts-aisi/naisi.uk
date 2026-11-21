import { send, type Answer } from "../courses/excused/api";

/**
 * THE PRESSES OF ASK THE TEAM, from the browser: the member's message, and an
 * admin's Take it and reply (`POST /api/courses/requests/[requestId]/team/<action>`).
 * Every route decides everything again; the page only says what the route
 * answered. Nothing here logs a body: a message is the person's own words.
 * An access ask goes to the same send route from its own form, and an admin
 * opens one by a press that records the opening (`team/open`).
 */

export type { Answer };

export function sendTeamMessage(topic: string, words: string): Promise<Answer> {
  return send("/api/courses/requests/ask", { topic, words });
}

/** An access ask: what would help, and the tick (off unless ticked). */
export function sendAccessNeeds(words: string, tellFacilitator: boolean): Promise<Answer> {
  return send("/api/courses/requests/ask", { topic: "access", words, tellFacilitator });
}

const path = (requestId: string, action: string) => `/api/courses/requests/${encodeURIComponent(requestId)}/team/${action}`;

export function takeTeamMessage(requestId: string): Promise<Answer> {
  return send(path(requestId, "take"), {});
}

export function replyToTeamMessage(requestId: string, reply: string): Promise<Answer> {
  return send(path(requestId, "reply"), { reply: reply.trim() });
}

/** Open what a member wrote in an access ask: the opening is recorded, or nothing is shown. */
export function openAccessNeeds(requestId: string): Promise<Answer> {
  return send(path(requestId, "open"), {});
}
