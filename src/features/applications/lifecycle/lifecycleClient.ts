"use client";

/**
 * The term page's one door to the route that moves a form.
 *
 * A refusal is thrown as an `Error` carrying the server's own sentence. The
 * route answers in words an admin can act on, and writing them again in the
 * browser would be two sets of words for one refusal.
 */

export type MovedForm = {
  /** False when the form was already there. */
  changed: boolean;
  status: string;
  /** Set when the term was settled and a member record could not be written. */
  recordWarning: string | null;
};

export async function moveForm(roundId: string, status: string): Promise<MovedForm> {
  const res = await fetch(`/api/admissions/forms/${encodeURIComponent(roundId)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Every call comes from a confirmation the admin has just pressed.
    body: JSON.stringify({ status, confirm: true }),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    /* an empty body, or a proxy's error page */
  }
  if (!res.ok) {
    throw new Error(
      typeof payload.error === "string" && payload.error
        ? payload.error
        : `That did not go through (${res.status}).`,
    );
  }
  return {
    changed: payload.changed === true,
    status: typeof payload.status === "string" ? payload.status : status,
    recordWarning: typeof payload.recordWarning === "string" ? payload.recordWarning : null,
  };
}
