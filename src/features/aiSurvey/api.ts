/**
 * How the AI at Nottingham survey's pages call its routes.
 *
 * WITH NO CREDENTIALS AND NO REFERRER, every time. A student may be signed in
 * to the site in the same browser, and the address bar may still carry the
 * short link they arrived by (`?q=`). Neither travels: `credentials: "omit"`
 * leaves the session cookie behind, and `referrerPolicy: "no-referrer"` leaves
 * the address behind, so a save is a pass and a page of answers and nothing
 * that says who sent it or how they got here.
 *
 * A route answers with the NAME of what went wrong and the page holds the
 * words, so anything that is not a clean answer comes back as `failed`.
 *
 * EVERY CALL HAS A TIME LIMIT. A phone with one bar of signal can send a
 * request and never hear back, and a browser left to itself waits a minute or
 * more before it says so. Past the limit the call is given up and comes back
 * as `failed`, so the page can say "Try again" while somebody is still
 * looking at it. Every route is safe to call again: a save replaces the page
 * it saved, a second Finish is told it is finished, and a code check is asked
 * again as the same person.
 */
export type SurveyReply<T> = ({ ok: true } & T) | { ok: false; error: string };

/** How long a call may take before the page stops waiting for it. */
export const CALL_LIMIT_MS = 20_000;

export async function callSurvey<T>(path: string, body: unknown, limitMs: number = CALL_LIMIT_MS): Promise<SurveyReply<T>> {
  // A controller and a timer, not `AbortSignal.timeout`: phones a few years
  // old do not have that, and there the call would fail before it was sent.
  const gaveUp = new AbortController();
  const timer = setTimeout(() => gaveUp.abort(), limitMs);
  try {
    const res = await fetch(`/api/ai-survey/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: gaveUp.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (data !== null && typeof data === "object") {
      const reply = data as { ok?: unknown; error?: unknown };
      if (res.ok && reply.ok === true) return data as { ok: true } & T;
      if (typeof reply.error === "string") return { ok: false, error: reply.error };
    }
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
