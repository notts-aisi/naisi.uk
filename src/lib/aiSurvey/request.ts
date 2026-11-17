import { NextResponse } from "next/server";

/**
 * What the AI at Nottingham survey's public routes share: reading a small
 * JSON body, and answering.
 *
 * THESE ROUTES NEVER ASK WHO IS CALLING. They read no cookie, no session and
 * no header: not the view-as marker, not an IP address, not a referrer. The
 * page calls them with no credentials and no referrer (see `callSurvey` in
 * src/app/ai-survey/api.ts), and nothing here would look if it did not. There
 * is no limit by IP address and nothing is kept against one: a room of
 * students shares a few.
 *
 * NOTHING IS LOGGED: not a body, not an address, not a pass.
 * tests/ai-survey-no-trace.test.mjs holds every file of the survey to both.
 */

/** Far above any real body: a page of answers with its pass is under 4 KB. */
const MAX_BODY_CHARS = 16_000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The body as an object, or null when it is too big, not JSON, or not an
 * object. It is read a piece at a time and DROPPED THE MOMENT IT PASSES ITS
 * LIMIT, so nobody can make the server hold a body of megabytes by sending one.
 */
export async function readSurveyBody(req: Request): Promise<Record<string, unknown> | null> {
  let text = "";
  try {
    const reader = req.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > MAX_BODY_CHARS) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
    }
    text += decoder.decode();
  } catch {
    return null;
  }
  if (text.length === 0 || text.length > MAX_BODY_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * A refusal: the NAME of what went wrong and never a sentence. The page holds
 * the words (the survey's own, from its definition), so a route cannot drift
 * from them.
 */
export function refuse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export function accept(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}

/** The status each named refusal travels with. */
export function statusOf(error: string): number {
  switch (error) {
    case "askedAgainTooSoon":
    case "tooManyCodesToday":
    case "tooManyWrongTries":
      return 429;
    case "busy":
    case "couldNotSend":
    case "failed":
      return 503;
    case "closed":
    case "gone":
    case "alreadyAnswered":
      return 409;
    default:
      return 400;
  }
}
