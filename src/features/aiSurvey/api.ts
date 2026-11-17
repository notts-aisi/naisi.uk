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
 */
export type SurveyReply<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function callSurvey<T>(path: string, body: unknown): Promise<SurveyReply<T>> {
  try {
    const res = await fetch(`/api/ai-survey/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
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
  }
}
