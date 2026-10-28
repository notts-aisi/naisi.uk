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

const POLL_EVERY_MS = 2_000;

/** How long to wait before asking again after Pangram says it is busy (429). */
function busyWait(response: Response, attempt: number): number {
  const said = Number(response.headers.get("retry-after"));
  if (Number.isFinite(said) && said > 0) return Math.min(said * 1_000, 20_000);
  return Math.min(2_000 * 2 ** attempt, 16_000);
}

/** What Pangram said when it refused, for the server log: its status and the start of its words, never the key. */
async function refusalOf(response: Response): Promise<string> {
  const words = await response.text().catch(() => "");
  return `${response.status} ${words.replace(/\s+/g, " ").slice(0, 200)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** One stretch of a checked text, as Pangram labelled it ("AI-Generated", "Moderately AI-Assisted", "Human Written"). */
export type PangramWindow = { start: number; end: number; label: string };

export type PangramResult =
  | { ok: true; reading: PangramReading; windows: PangramWindow[] }
  | { ok: false; reason: string };

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

function windowsFrom(data: Raw): PangramWindow[] {
  if (!Array.isArray(data.windows)) return [];
  return data.windows.flatMap((value) => {
    const window = asRecord(value);
    const start = window.start_index;
    const end = window.end_index;
    const label = typeof window.label === "string" ? window.label : "";
    return typeof start === "number" && typeof end === "number" && end > start && label ? [{ start, end, label }] : [];
  });
}

const kindOf = (label: string): "ai" | "assisted" | "human" =>
  /assisted/i.test(label) ? "assisted" : /\bAI\b|generated/i.test(label) ? "ai" : "human";

/**
 * SEVERAL ANSWERS, CHECKED AS ONE TEXT, read back one answer at a time.
 *
 * An application's long answers go to Pangram joined into one text, once:
 * Pangram charges by the request as well as by the word, and reads a longer
 * text more surely. Pangram labels the text in stretches (`windows`), so each
 * answer's reading is made from the stretches that cover it, weighted by how
 * much of the answer each covers, and its headline is the label of the one
 * that covers most. When Pangram gives no stretches, every answer carries the
 * reading of the whole.
 *
 * Pure.
 */
export function readingsForParts(
  parts: readonly { start: number; end: number }[],
  whole: PangramReading,
  windows: readonly PangramWindow[],
): PangramReading[] {
  return parts.map((part) => {
    const share = { ai: 0, assisted: 0, human: 0 };
    let covered = 0;
    let widest: { label: string; overlap: number } | null = null;
    for (const window of windows) {
      const overlap = Math.min(part.end, window.end) - Math.max(part.start, window.start);
      if (overlap <= 0) continue;
      share[kindOf(window.label)] += overlap;
      covered += overlap;
      if (!widest || overlap > widest.overlap) widest = { label: window.label, overlap };
    }
    if (covered === 0 || !widest) return whole;
    const fractionAi = share.ai / covered;
    const fractionAiAssisted = share.assisted / covered;
    const flagged = fractionAi + fractionAiAssisted;
    return {
      label: flagged < 0.1 ? "Human" : fractionAi >= 0.9 ? "AI" : flagged >= 0.9 ? "AI-Assisted" : "Mixed",
      headline: widest.label,
      fractionAi,
      fractionAiAssisted,
      fractionHuman: share.human / covered,
    };
  });
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
    // Asked again while Pangram says it is busy, waiting longer each time.
    let submitted: Response;
    for (let attempt = 0; ; attempt += 1) {
      submitted = await fetch(`${BASE_URL}/task`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, model: PANGRAM_MODEL }),
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      });
      if (submitted.status !== 429) break;
      const wait = busyWait(submitted, attempt);
      if (attempt >= 4 || Date.now() + wait > deadline) {
        console.error("[pangram] busy", await refusalOf(submitted));
        return { ok: false, reason: "Pangram is busy. Try again in a few minutes." };
      }
      await sleep(wait);
    }
    if (submitted.status === 401 || submitted.status === 403) {
      console.error("[pangram] the API key was refused", await refusalOf(submitted));
      return { ok: false, reason: "Pangram refused this site’s key." };
    }
    if (submitted.status === 402) {
      console.error("[pangram] no credit", await refusalOf(submitted));
      return { ok: false, reason: "Pangram has no API credit left. Add credit in Pangram’s API dashboard." };
    }
    if (!submitted.ok) {
      console.error("[pangram] submit failed", await refusalOf(submitted));
      return { ok: false, reason: "Pangram couldn’t take this just now." };
    }
    const taskId = asRecord(await submitted.json()).task_id;
    if (typeof taskId !== "string" || !taskId) {
      return { ok: false, reason: "Pangram’s answer couldn’t be read." };
    }

    let busy = 0;
    while (Date.now() + POLL_EVERY_MS < deadline) {
      await sleep(POLL_EVERY_MS);
      const polled = await fetch(`${BASE_URL}/task/${encodeURIComponent(taskId)}`, {
        headers,
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      });
      if (polled.status === 429) {
        await sleep(busyWait(polled, busy++));
        continue;
      }
      if (!polled.ok) {
        console.error("[pangram] poll failed", await refusalOf(polled));
        return { ok: false, reason: "Pangram couldn’t finish this one." };
      }
      const data = asRecord(await polled.json());
      const stage = typeof data.stage === "string" ? data.stage : "";
      if (stage === "STAGE_SUCCESS") {
        const reading = readingFrom(data);
        return reading
          ? { ok: true, reading, windows: windowsFrom(data) }
          : { ok: false, reason: "Pangram’s answer couldn’t be read." };
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
