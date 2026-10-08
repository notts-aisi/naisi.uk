import type { ApplicationContent } from "@/lib/applications/model";
import type { ApplicantApplication } from "@/lib/applications/applicant/types";

/**
 * The two requests the form makes: save the draft, and send.
 *
 * Both answer with the same small union, so the form has one way to tell
 * "saved" from "not saved" and never has to guess from a thrown error. A
 * failure always carries a sentence for the person.
 */

export type SendIssue = { step: string; questionId: string | null; message: string };

export type Failure = {
  ok: false;
  /** 0 when the request never reached the server. */
  status: number;
  error: string;
  /** Present on a refused send: what is missing, and on which step. */
  issues: SendIssue[];
  /** True when the server says the same request will succeed if it is made again. */
  retry: boolean;
};

export type Saved = { ok: true; application: ApplicantApplication | null };

const OFFLINE = "We could not reach the site. Check your connection.";

function applicationUrl(roundId: string): string {
  return `/api/admissions/forms/${encodeURIComponent(roundId)}/application`;
}

async function readFailure(response: Response, fallback: string): Promise<Failure> {
  let error = fallback;
  let issues: SendIssue[] = [];
  // Too many requests, or a fault on our side: both pass.
  let retry = response.status === 429 || response.status >= 500;
  try {
    const body = (await response.json()) as { error?: unknown; issues?: unknown; retry?: unknown };
    if (typeof body.error === "string" && body.error) error = body.error;
    if (body.retry === true) retry = true;
    if (Array.isArray(body.issues)) {
      issues = body.issues.filter(
        (issue): issue is SendIssue =>
          Boolean(issue) &&
          typeof (issue as SendIssue).step === "string" &&
          typeof (issue as SendIssue).message === "string",
      );
    }
  } catch {
    // Not JSON: keep the fallback sentence.
  }
  return { ok: false, status: response.status, error, issues, retry };
}

/** Bodies under this size may outlive the page that sent them (`keepalive`). */
const KEEPALIVE_LIMIT = 60_000;

/**
 * Save the whole draft. `leaving` marks a save made as the page is being put
 * away, which the browser is asked to finish even if the tab closes.
 */
export async function saveDraft(
  roundId: string,
  draft: ApplicationContent,
  leaving = false,
): Promise<Saved | Failure> {
  const body = JSON.stringify({ draft });
  try {
    const response = await fetch(applicationUrl(roundId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: leaving && body.length < KEEPALIVE_LIMIT,
    });
    if (!response.ok) return readFailure(response, "We could not save your application.");
    const data = (await response.json()) as { application?: ApplicantApplication | null };
    return { ok: true, application: data.application ?? null };
  } catch {
    return { ok: false, status: 0, error: OFFLINE, issues: [], retry: true };
  }
}

/** Send what is saved. The request carries no answers: the server reads the stored draft. */
export async function sendApplication(roundId: string): Promise<Saved | Failure> {
  try {
    const response = await fetch(`${applicationUrl(roundId)}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return readFailure(response, "We could not send your application.");
    const data = (await response.json()) as { application?: ApplicantApplication | null };
    return { ok: true, application: data.application ?? null };
  } catch {
    return { ok: false, status: 0, error: OFFLINE, issues: [], retry: true };
  }
}
