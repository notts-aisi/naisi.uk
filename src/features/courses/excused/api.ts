/**
 * THE PRESSES OF ASKING TO BE EXCUSED, from the browser: asking (`POST
 * /api/courses/groups/[groupId]/excused`), withdrawing (the person who
 * asked), and an admin's approve, decline and reply (`POST
 * /api/courses/requests/[requestId]/excused/<action>`). Every route decides
 * everything again; the page only says what the route answered.
 *
 * Every answer comes back as it came: its status, its body and the route's
 * own sentence when it refused. Nothing here logs a body: a reason is the
 * person's own words.
 */

export type Answer = {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  /** The route's own sentence when it refused, or a plain one when nothing came back. */
  error: string | null;
};

async function send(url: string, body: unknown): Promise<Answer> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const ok = res.ok && parsed?.ok === true;
    const said = typeof parsed?.error === "string" ? parsed.error : null;
    return { ok, status: res.status, body: parsed, error: ok ? null : (said ?? `That didn’t go through (${res.status}).`) };
  } catch {
    return { ok: false, status: 0, body: null, error: "That didn’t reach the site. Check your connection and try again." };
  }
}

/** Ask to be excused from these sessions of the group, with one line of why. */
export function askToBeExcused(groupId: string, sessionKeys: readonly string[], reason: string): Promise<Answer> {
  return send(`/api/courses/groups/${encodeURIComponent(groupId)}/excused`, { sessionKeys, reason });
}

const requestPath = (requestId: string, action: string) =>
  `/api/courses/requests/${encodeURIComponent(requestId)}/excused/${action}`;

/** Withdraw one week of the person's own request, while it waits. */
export function withdrawExcused(requestId: string, sessionKey: string): Promise<Answer> {
  return send(requestPath(requestId, "withdraw"), { sessionKey });
}

/** An admin approves one week, with a reply or none. */
export function approveExcused(requestId: string, sessionKey: string, reply: string): Promise<Answer> {
  return send(requestPath(requestId, "approve"), reply.trim() ? { sessionKey, reply: reply.trim() } : { sessionKey });
}

/** An admin declines one week, with the reply a decline needs. */
export function declineExcused(requestId: string, sessionKey: string, reply: string): Promise<Answer> {
  return send(requestPath(requestId, "decline"), { sessionKey, reply: reply.trim() });
}

/** An admin replies without deciding. */
export function replyToExcused(requestId: string, reply: string): Promise<Answer> {
  return send(requestPath(requestId, "reply"), { reply: reply.trim() });
}
