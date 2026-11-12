import { lineBody, type LineChoice } from "@/lib/courses/registerCorrection/pageWords";

/**
 * THE PRESSES OF CORRECTING A REGISTER, from the browser: a line's
 * correction (`PATCH .../attendance`, with its reason), a facilitator's ask
 * (`POST .../attendance/requests`), what the people deciding a request do
 * with it (`POST /api/courses/requests/[id]/<action>`), the column's
 * corrections and their previews (`POST .../attendance/column`), and the
 * optional notice It didn't happen hands back (`POST
 * /api/courses/runs/[runId]/updates`, as the group's Change panel posts it).
 *
 * Every answer comes back as it came: its status, its body and the route's
 * own sentence when it refused, so the page says what the route said.
 */

export type Answer = {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  /** The route's own sentence when it refused, or a plain one when nothing came back. */
  error: string | null;
};

async function send(url: string, method: "POST" | "PATCH", body?: unknown): Promise<Answer> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const ok = res.ok && parsed?.ok === true;
    const said = typeof parsed?.error === "string" ? parsed.error : null;
    return { ok, status: res.status, body: parsed, error: ok ? null : (said ?? `That didn’t go through (${res.status}).`) };
  } catch {
    return { ok: false, status: 0, body: null, error: "That didn’t reach the site. Check your connection and try again." };
  }
}

const groupPath = (groupId: string) => `/api/courses/groups/${encodeURIComponent(groupId)}/attendance`;

/** A line of a finished register, corrected with a reason. */
export function correctLine(
  groupId: string,
  input: { weekNumber: number; occurrence: number; uid: string; to: LineChoice; reason: string },
): Promise<Answer> {
  return send(groupPath(groupId), "PATCH", {
    weekNumber: input.weekNumber,
    occurrence: input.occurrence,
    marks: [{ uid: input.uid, ...lineBody(input.to) }],
    reason: input.reason,
  });
}

/** A facilitator asks for a line of a finished register to be corrected. */
export function askForCorrection(
  groupId: string,
  input: { weekNumber: number; occurrence: number; uid: string; to: LineChoice; reason: string },
): Promise<Answer> {
  return send(`${groupPath(groupId)}/requests`, "POST", {
    weekNumber: input.weekNumber,
    occurrence: input.occurrence,
    uid: input.uid,
    to: lineBody(input.to),
    reason: input.reason,
  });
}

/** Withdraw, approve, decline or take a request. Decline takes a reply. */
export function requestAction(requestId: string, action: "withdraw" | "approve" | "decline" | "take", reply?: string): Promise<Answer> {
  return send(
    `/api/courses/requests/${encodeURIComponent(requestId)}/${action}`,
    "POST",
    action === "decline" ? { reply: reply ?? "" } : undefined,
  );
}

/** One of the column's corrections, or its preview. */
export function correctColumn(groupId: string, body: Record<string, unknown>): Promise<Answer> {
  return send(`${groupPath(groupId)}/column`, "POST", body);
}

/** The notice It didn't happen hands back, posted to the group as the Change panel posts one. */
export function postGroupNotice(
  runId: string,
  update: { groupId: string; title: string; message: string; emailCount: number },
): Promise<Answer> {
  return send(`/api/courses/runs/${encodeURIComponent(runId)}/updates`, "POST", {
    to: "group",
    groupId: update.groupId,
    title: update.title,
    message: update.message,
    email: update.emailCount > 0,
    ...(update.emailCount > 0 ? { emailCount: update.emailCount } : {}),
    // A change to the group's sessions reaches its facilitators too.
    withFacilitators: true,
  });
}
