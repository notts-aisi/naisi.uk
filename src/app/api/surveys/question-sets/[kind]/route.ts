import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isQuestionSetKind } from "@/lib/firestore/surveyQuestionSets";
import { QUESTION_SET_REFUSAL, checkWholeChange, checkWordsChange, editsWhole } from "@/lib/surveys/questionSets";
import { saveQuestionSet } from "@/lib/surveys/questionSetsStore";
import { canRunSurveys } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ kind: string }> };

/**
 * CHANGE THE QUESTIONS ONE KIND OF SURVEY STARTS WITH (Run NAISI › Surveys ›
 * Question sets), from its page's Save:
 *
 *   PUT { words }  for before, after, leaving, check-in and session-report
 *   PUT { items }  for event
 *     ->  { ok: true }
 *
 * ADMINS ONLY, view-as refused first, then the session and the admin bar,
 * before the body is read or the database touched.
 *
 * WORDS ONLY, BUT AFTER AN EVENT, held here and not only on the page: a
 * words-only set's save names places in the set and their words and nothing
 * else, so a save that adds, takes out or retypes a question, or changes an
 * answer's id, is refused whole (`checkWordsChange`). The survey after an
 * event's set is changed whole, a question the code asks keeping its kind
 * (`checkWholeChange`). A save that comes back to the code's deletes the set.
 *
 * A change reaches surveys made after it, never one already made: each
 * survey keeps the questions it copied when it was made.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { kind } = await ctx.params;
  if (!isQuestionSetKind(kind)) return NextResponse.json({ error: QUESTION_SET_REFUSAL.noSet }, { status: 404 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const checked = editsWhole(kind) ? checkWholeChange(raw) : checkWordsChange(kind, raw);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  await saveQuestionSet(db, kind, "items" in checked ? { items: checked.items } : { words: checked.words }, actor.uid);
  return NextResponse.json({ ok: true });
}
