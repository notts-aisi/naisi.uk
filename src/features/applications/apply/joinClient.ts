import type { AboutYou } from "@/lib/applications/model";

/**
 * The requests the join step makes, and the two the signed-in form makes
 * about a university address.
 *
 * EVERY ONE OF THESE IS A ROUTE THE SITE ALREADY HAS, called with the body
 * the register page and the sign-in page already send it. Nothing here is a
 * new way to make an account:
 *
 *   POST /api/register          an email address, and a link is emailed to it
 *   POST /api/register/resend   send that link again
 *   POST /api/auth/session      exchange a sign-in for the session cookie
 *   POST /api/verify-email/send email the link that checks a university address
 *   GET  .../application        the caller's own account, as the form reads it
 *   PUT  .../application        save the draft (About you, on the first save)
 *
 * WHAT A SIGNED-OUT VISITOR'S BROWSER SENDS: an email address to the first
 * two, and nothing else. The answers typed on the step go nowhere until
 * there is a session to send them under.
 *
 * Each answers with the same small union, so the step never has to guess
 * from a thrown error.
 */

export type Failed = { ok: false; status: number; error: string };

const OFFLINE = "We could not reach the site. Check your connection and try again.";

async function post(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function failure(response: Response | null, fallback: string): Promise<Failed> {
  if (!response) return { ok: false, status: 0, error: OFFLINE };
  let error = fallback;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) error = body.error;
  } catch {
    // Not JSON: keep the fallback sentence.
  }
  return { ok: false, status: response.status, error };
}

function applicationUrl(roundId: string): string {
  return `/api/admissions/forms/${encodeURIComponent(roundId)}/application`;
}

/**
 * Ask for an account by email. The answer is the same whether or not the
 * address was already registered, so the step can only ever say "if".
 */
export async function startEmailRegistration(
  email: string,
  recaptchaToken: string | null,
  next: string,
): Promise<{ ok: true } | Failed> {
  const response = await post("/api/register", { email, audience: "member", recaptchaToken, next });
  if (!response?.ok) return failure(response, "We could not start your account. Try again in a moment.");
  return { ok: true };
}

/** Send the confirmation link again. The server decides whether anything goes. */
export async function resendRegistration(email: string): Promise<void> {
  await post("/api/register/resend", { email });
}

export type AccountKind = "member" | "collaborator" | "new";

/**
 * Exchange the browser's sign-in for the session cookie, and learn from the
 * server what kind of account this is: one with a join request (`member`),
 * an external collaborator's, or one with neither (`new`).
 */
export async function mintSession(idToken: string): Promise<{ ok: true; kind: AccountKind } | Failed> {
  const response = await post("/api/auth/session", { idToken });
  if (!response?.ok) return failure(response, "We could not confirm that you are signed in.");
  try {
    const body = (await response.json()) as { exists?: unknown; kind?: unknown };
    const kind: AccountKind =
      body.kind === "member" || body.kind === "collaborator" || body.kind === "new"
        ? body.kind
        : body.exists === true
          ? "member"
          : "new";
    return { ok: true, kind };
  } catch {
    return { ok: false, status: response.status, error: "We could not confirm that you are signed in." };
  }
}

/**
 * Email the link that checks a university address.
 *
 * `sent` is false when the route held this press back because one went less
 * than a minute ago, and `wait` is how many seconds until another can be
 * asked for. The route says nothing about whose the address is, so neither
 * can this.
 */
export async function sendUniversityCheck(
  email: string,
  preferredName: string,
): Promise<{ ok: true; sent: boolean; wait: number } | Failed> {
  const response = await post("/api/verify-email/send", { email: email.trim().toLowerCase(), preferredName });
  if (!response?.ok) return failure(response, "We could not send the link. Try again in a moment.");
  try {
    const body = (await response.json()) as { cooldownRemaining?: unknown; sent?: unknown };
    const wait = typeof body.cooldownRemaining === "number" && body.cooldownRemaining > 0 ? body.cooldownRemaining : 0;
    return { ok: true, sent: body.sent !== false, wait };
  } catch {
    return { ok: true, sent: true, wait: 0 };
  }
}

/** Whether the caller's account has a join request, and whether its university address is checked. */
export async function readOwnAccount(
  roundId: string,
): Promise<{ ok: true; joined: boolean; verified: boolean } | Failed> {
  let response: Response | null = null;
  try {
    response = await fetch(applicationUrl(roundId), { cache: "no-store" });
  } catch {
    response = null;
  }
  if (!response?.ok) return failure(response, "We could not check your account.");
  try {
    const body = (await response.json()) as { joined?: unknown; account?: { universityEmailVerified?: unknown } };
    return {
      ok: true,
      joined: body.joined === true,
      verified: body.account?.universityEmailVerified === true,
    };
  } catch {
    return { ok: false, status: response.status, error: "We could not check your account." };
  }
}

/**
 * Start the application with About you, straight after a join request has
 * been sent. The route fills in everything else a draft needs and takes the
 * university email from the account, whatever is sent here.
 */
export async function saveAboutYou(roundId: string, about: AboutYou): Promise<{ ok: true } | Failed> {
  let response: Response | null = null;
  try {
    response = await fetch(applicationUrl(roundId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: { aboutYou: about } }),
    });
  } catch {
    response = null;
  }
  if (!response?.ok) return failure(response, "We could not save your application.");
  return { ok: true };
}
