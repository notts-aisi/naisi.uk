import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { arrangeOptions, askAboutArrangement, CLAUDE_ADMINS_ONLY } from "@/lib/applications/arrange/advise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Up to five arrangements of a programme's people into groups, for an admin
 * or the programme's lead: `{ askClaude, minutes?, size?, startAgain? }`.
 *
 * The site works out several over the run's groups as they are, from when
 * each person said they are free (`src/lib/applications/arrange/options.ts`):
 * everybody already placed stays where they are, and each facilitator in the
 * group they facilitate, unless `startAgain` asks to seat afresh everybody
 * placed and not told (the told and the facilitators still stay). With
 * `askClaude`, Claude ranks
 * them with pros and cons, gives a reason for each group, a facilitator for
 * each and any moves, and only what the rules allow is kept
 * (`arrange/advice.ts`). Before decision day it is a preview of the people
 * the decisions as they stand place on the programme, the caller's own
 * application left out. NOTHING IS WRITTEN AND NOTHING IS STORED: Circles
 * draws the answer over the run's groups as a preview, and "Apply N changes"
 * sends only the differences through the site's own routes for groups,
 * places and facilitators, which ask every question they always ask. Nobody
 * is emailed until Publish.
 *
 * With `{ ask: { question, history, groups }, minutes? }` instead, it is a
 * question about the arrangement on the admin's screen (`groups`, with their
 * changes): Claude answers in words and may suggest moves, kept only where
 * they fit. The screen keeps the conversation and sends the last few turns
 * back each time; nothing is stored here either.
 *
 * FOR AN ADMIN, AND FOR THE PROGRAMME'S LEAD WITHOUT CLAUDE. Asking Claude
 * (`askClaude: true`, or a question with `ask`) is an admin's alone, refused
 * for anybody else before anything is read, whatever else the request says.
 * The lead's `askClaude: false` is worked out only from the people and
 * weeks the lead may have (`loadArranging`: the run's rows the board serves
 * them, and each person's week only where they may read the application),
 * reads no Claude or Pangram read, asks Claude nothing and writes nothing;
 * the preview before decision day stays an admin's. Anybody else with a role
 * on the programme is refused in a sentence, and anybody with none is
 * answered as for a programme that is not there.
 *
 * A POST, because asking Claude sends the people's numbered reads to
 * Anthropic. A view-as session is refused first. It may take most of the
 * backend's 300-second request limit.
 */
export const maxDuration = 290;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: { askClaude?: unknown; minutes?: unknown; size?: unknown; ask?: unknown; startAgain?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const asked: typeof body = body && typeof body === "object" ? body : {};
  // Anything that asks Claude is an admin's alone: refused before anything is read.
  if ((asked.ask !== undefined || asked.askClaude === true) && !canRunTerm(user)) {
    return NextResponse.json({ error: CLAUDE_ADMINS_ONLY }, { status: 403 });
  }
  if (asked.ask !== undefined) return answer(asked.ask, asked.minutes, user, roundId, programmeId);
  if (typeof asked.askClaude !== "boolean") {
    return NextResponse.json({ error: "Say whether to ask Claude: askClaude true or false." }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await arrangeOptions(db, user, roundId, programmeId, {
    askClaude: asked.askClaude,
    minutes: asked.minutes,
    size: asked.size,
    startAgain: asked.startAgain === true,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ arrangement: result.arrangement }, { headers: { "Cache-Control": "no-store" } });
}

const QUESTION_LIMIT = 1_000;
const ANSWER_LIMIT = 6_000;
const TURNS = 6;

/** A question about the arrangement on the admin's screen. */
async function answer(
  raw: unknown,
  minutes: unknown,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  roundId: string,
  programmeId: string,
) {
  const ask = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as {
    question?: unknown;
    history?: unknown;
    groups?: unknown;
  };
  const question = typeof ask.question === "string" ? ask.question.trim() : "";
  if (!question || question.length > QUESTION_LIMIT) {
    return NextResponse.json({ error: `Ask a question of up to ${QUESTION_LIMIT} characters.` }, { status: 400 });
  }
  const history = (Array.isArray(ask.history) ? ask.history : []).slice(-TURNS).flatMap((turn) => {
    const t = (turn && typeof turn === "object" ? turn : {}) as { question?: unknown; answer?: unknown };
    return typeof t.question === "string" && typeof t.answer === "string"
      ? [{ question: t.question.slice(0, QUESTION_LIMIT), answer: t.answer.slice(0, ANSWER_LIMIT) }]
      : [];
  });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const result = await askAboutArrangement(db, user, roundId, programmeId, { question, history, groups: ask.groups, minutes });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ask: result.ask }, { headers: { "Cache-Control": "no-store" } });
}

