import "server-only";

/**
 * THE ONE PLACE THE SITE TALKS TO PANGRAM, the AI-writing detector.
 *
 * Pangram is a processor the privacy policy names, and every text sent to it
 * leaves through this file. Its text API takes a task and answers it
 * asynchronously: `POST /task` returns an id, and `GET /task/{id}` returns
 * the result once its `stage` is `STAGE_SUCCESS`.
 *
 * - THE KEY IS A SERVER SECRET. `PANGRAM_API_KEY`, RUNTIME only, sent in the
 *   `x-api-key` header. With no key nothing is sent (`pangramConfigured()`).
 * - SHORT TEXT IS NEVER SENT. A detector's verdict on a sentence or two is
 *   close to a guess, and a wrong flag on a student is an accusation. The
 *   caller decides what is long enough (`PANGRAM_MIN_WORDS`); this file
 *   refuses anything under it as a second line.
 * - A RESULT IS A SIGNAL, NOT A VERDICT. What comes back is Pangram's label
 *   and its fractions, kept as Pangram gave them. Nothing here decides
 *   anything about a person.
 */

const BASE_URL = "https://text.external-api.pangram.com";
export const PANGRAM_MODEL = "pangram-4";

/** Under this many words an answer is not sent to Pangram at all. */
export const PANGRAM_MIN_WORDS = 50;

const POLL_EVERY_MS = 1_000;

export function pangramConfigured(): boolean {
  return Boolean(process.env.PANGRAM_API_KEY);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export type PangramReading = {
  /** Pangram's short label: "AI", "AI-Assisted", "Mixed" or "Human". */
  label: string;
  /** Pangram's one-line summary, as it wrote it. */
  headline: string;
  fractionAi: number;
  fractionAiAssisted: number;
  fractionHuman: number;
};

export type PangramResult = { ok: true; reading: PangramReading } | { ok: false; reason: string };

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

const fraction = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

function readingFrom(data: Raw): PangramReading | null {
  const label = typeof data.prediction_short === "string" ? data.prediction_short : "";
  if (!label) return null;
  return {
    label,
    headline: typeof data.headline === "string" ? data.headline : "",
    fractionAi: fraction(data.fraction_ai),
    fractionAiAssisted: fraction(data.fraction_ai_assisted),
    fractionHuman: fraction(data.fraction_human),
  };
}

/**
 * Whether a reading is worth a person's look: Pangram called some of it AI
 * or AI-assisted. It opens a question, never answers one.
 */
export function worthALook(reading: PangramReading): boolean {
  return reading.label !== "Human" || reading.fractionAi + reading.fractionAiAssisted >= 0.5;
}

/** Check one text, giving up at `deadline` (a `Date.now()` value). */
export async function checkWriting(text: string, deadline: number): Promise<PangramResult> {
  const apiKey = process.env.PANGRAM_API_KEY;
  if (!apiKey) return { ok: false, reason: "Pangram isn’t set up on this site yet." };
  if (wordCount(text) < PANGRAM_MIN_WORDS) return { ok: false, reason: "Too short to check." };

  const headers = { "content-type": "application/json", "x-api-key": apiKey };
  try {
    const submitted = await fetch(`${BASE_URL}/task`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, model: PANGRAM_MODEL }),
      signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
    });
    if (submitted.status === 401 || submitted.status === 403) {
      console.error("[pangram] the API key was refused", submitted.status);
      return { ok: false, reason: "Pangram refused this site’s key." };
    }
    if (submitted.status === 402 || submitted.status === 429) {
      return { ok: false, reason: "Pangram is out of credits or busy. Try again later." };
    }
    if (!submitted.ok) {
      console.error("[pangram] submit failed", submitted.status);
      return { ok: false, reason: "Pangram couldn’t take this just now." };
    }
    const taskId = asRecord(await submitted.json()).task_id;
    if (typeof taskId !== "string" || !taskId) {
      return { ok: false, reason: "Pangram’s answer couldn’t be read." };
    }

    while (Date.now() + POLL_EVERY_MS < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
      const polled = await fetch(`${BASE_URL}/task/${encodeURIComponent(taskId)}`, {
        headers,
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      });
      if (!polled.ok) {
        console.error("[pangram] poll failed", polled.status);
        return { ok: false, reason: "Pangram couldn’t finish this one." };
      }
      const data = asRecord(await polled.json());
      const stage = typeof data.stage === "string" ? data.stage : "";
      if (stage === "STAGE_SUCCESS") {
        const reading = readingFrom(data);
        return reading ? { ok: true, reading } : { ok: false, reason: "Pangram’s answer couldn’t be read." };
      }
      if (/FAIL|ERROR|CANCEL/i.test(stage)) {
        console.error("[pangram] task ended", stage);
        return { ok: false, reason: "Pangram couldn’t finish this one." };
      }
    }
    return { ok: false, reason: "Pangram took too long. Try again." };
  } catch (error) {
    console.error("[pangram] request failed", error);
    return { ok: false, reason: "Pangram couldn’t be reached. Try again." };
  }
}
