import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * THE ONE PLACE THE SITE TALKS TO CLAUDE.
 *
 * Anthropic is a processor the privacy policy names, and everything sent to
 * it leaves through this file, so there is one place to read for what goes
 * out and how. A caller hands over a system prompt, one user message and the
 * JSON schema it wants back, and gets the parsed object or a reason.
 *
 * - THE KEY IS A SERVER SECRET. `ANTHROPIC_API_KEY` is RUNTIME only in
 *   `apphosting.yaml` and is never `NEXT_PUBLIC_`. With no key the site does
 *   not call out and says so in words (`claudeConfigured()`), on every
 *   backend: there is no development default that calls anyway.
 * - IT FITS INSIDE ONE REQUEST. The backend stops a request at 300 seconds
 *   (`runConfig.timeoutSeconds`). A caller says how long its call may take
 *   (`timeoutMs`, never more than `MAX_CALL_MS`), and a call is never
 *   retried: a retry after a slow first attempt would be cut off mid-way and
 *   still billed. The caller says "try again" instead.
 * - A DECLINED REQUEST IS RETRIED SERVER SIDE. `fallbacks: "default"` lets
 *   Anthropic re-run a request its safety classifiers decline on the model it
 *   recommends for that case, inside the same call. A request every model
 *   declines comes back as a reason, never as an empty object.
 * - NOTHING IS SAMPLED. The answer is constrained to the schema
 *   (`output_config.format`) and then parsed and checked here; a malformed
 *   answer is a reason, not a crash.
 * - IT ONLY EVER TALKS TO ANTHROPIC. The SDK on its own reads
 *   `ANTHROPIC_BASE_URL` and sends the key wherever that names. Here the
 *   address is always given, and is Anthropic's unless the variable names
 *   this machine (`claudeBaseUrl`): that is how the end-to-end harness points
 *   a local server at its fake Claude, and nothing on a deployed backend's
 *   loopback answers as Claude. `tests/claude-base-url.test.mjs` keeps the
 *   variable out of every `apphosting*.yaml`.
 */

export const CLAUDE_MODEL = "claude-opus-5-5";

/** The longest any one call may take, inside the backend's 300-second request limit. */
export const MAX_CALL_MS = 240_000;

/** Anthropic's API: where every request goes unless `claudeBaseUrl` says otherwise. */
export const ANTHROPIC_API_URL = "https://api.anthropic.com";

/** The hosts that are this machine, as `URL` writes them. Never "localhost", which a hosts file can point anywhere. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);

/**
 * Where requests go: `value` (the `ANTHROPIC_BASE_URL` this backend holds)
 * only when it is plain http to a loopback address with no credentials in
 * it, and Anthropic's API otherwise. Pure: exported for the tests.
 */
export function claudeBaseUrl(value: string | undefined): string {
  if (!value) return ANTHROPIC_API_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return ANTHROPIC_API_URL;
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password) return ANTHROPIC_API_URL;
  return url.origin;
}

let cached: Anthropic | null | undefined;

function client(): Anthropic | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const named = process.env.ANTHROPIC_BASE_URL;
  const baseURL = claudeBaseUrl(named);
  if (named && baseURL === ANTHROPIC_API_URL && named.replace(/\/+$/, "") !== ANTHROPIC_API_URL) console.error("[claude] ANTHROPIC_BASE_URL is ignored: only a loopback address is honoured");
  cached = apiKey ? new Anthropic({ apiKey, baseURL, timeout: MAX_CALL_MS, maxRetries: 0 }) : null;
  return cached;
}

/** Whether this backend has a key to call Claude with. */
export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ClaudeUsage = { inputTokens: number; outputTokens: number };

export type ClaudeJsonResult =
  | { ok: true; value: unknown; model: string; usage: ClaudeUsage }
  | { ok: false; reason: string };

/**
 * One request, one JSON object back.
 *
 * `schema` is a JSON schema with `additionalProperties: false` and every
 * property required, which is what structured outputs ask for. The object
 * comes back unchecked beyond being JSON: the caller checks its fields.
 */
export async function askClaudeForJson(input: {
  system: string;
  message: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  /** How long this call may take. */
  timeoutMs: number;
}): Promise<ClaudeJsonResult> {
  const anthropic = client();
  if (!anthropic) return { ok: false, reason: "Claude isn’t set up on this site yet." };

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: input.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: input.system,
        messages: [{ role: "user", content: input.message }],
        output_config: {
          effort: input.effort,
          format: { type: "json_schema", schema: input.schema },
        },
      },
      { timeout: Math.min(input.timeoutMs, MAX_CALL_MS) },
    );
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return { ok: false, reason: "Claude took too long to answer. Try again." };
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("[claude] the API key was refused", error.status);
      return { ok: false, reason: "Claude refused this site’s key. Check the key on the Claude Platform." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: "Claude is busy or this month’s spending limit is used up. Try again shortly." };
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[claude] request failed", error.status, error.message);
      return { ok: false, reason: "Claude couldn’t answer just now. Try again." };
    }
    console.error("[claude] request failed", error);
    return { ok: false, reason: "Claude couldn’t be reached. Try again." };
  }

  if (response.stop_reason === "refusal") {
    return { ok: false, reason: "Claude declined to assess this one. Read it yourself." };
  }
  if (response.stop_reason === "max_tokens") {
    return { ok: false, reason: "Claude’s answer was cut short. Try again." };
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
  }
  return {
    ok: true,
    value,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
