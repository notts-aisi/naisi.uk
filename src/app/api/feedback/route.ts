import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { keepAnonymousAnswer } from "@/lib/anonymousFeedback/answer";
import { formByToken } from "@/lib/anonymousFeedback/forms";
import { isFormOpen, readAnswerBody } from "@/lib/anonymousFeedback/model";
import { REFUSAL_WORDS } from "@/lib/anonymousFeedback/words";

/**
 * "SEND ANONYMOUSLY": one answer to a programme's anonymous keep, change and
 * drop form (docs/surveys.md, "The anonymous form at a programme's end").
 *
 * Body `{ token, keep?, change?, drop? }`: the secret in the form's link,
 * which is the same for everybody on the programme, and up to three answers.
 *
 * THIS HANDLER NEVER ASKS WHO IS CALLING. It reads no session, no cookie (the
 * view-as marker included) and no header but the one the rate limit needs,
 * and it keeps none of them: whoever sends an answer, signed in, signed out
 * or in a view-as session, the same three answers, the programme and the day
 * are kept, and nothing else (`keepAnonymousAnswer`). Because nothing kept
 * names anybody, there is nobody for a view-as session to be recorded as, so
 * the view-as guard has nothing to refuse here and is not called: it reads a
 * cookie. Nothing is logged. `tests/anonymous-feedback-no-trace.test.mjs`
 * holds every file of the form to that.
 *
 * Two limits keep floods out, each a count in this server's memory alone: one
 * per address, which is read for that key and nothing else, and one per form.
 * No captcha: one would hand the caller's address and browser to a third
 * party at the moment of answering.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`feedback:answer:ip:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: REFUSAL_WORDS.tooMany },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    raw = "";
  }
  const read = readAnswerBody(raw);
  if (!read.ok) return NextResponse.json({ error: REFUSAL_WORDS[read.problem] }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const form = await formByToken(db, read.sent.token);
  if (!form) return NextResponse.json({ error: REFUSAL_WORDS.noForm }, { status: 404 });
  const now = new Date();
  if (!isFormOpen(form, now)) return NextResponse.json({ error: REFUSAL_WORDS.closed }, { status: 409 });

  const perForm = rateLimit(`feedback:answer:form:${form.id}`, 200, 3_600_000);
  if (!perForm.ok) {
    return NextResponse.json(
      { error: REFUSAL_WORDS.tooManyForForm },
      { status: 429, headers: { "Retry-After": String(perForm.retryAfterSeconds) } },
    );
  }

  await keepAnonymousAnswer(db, form, read.sent, now);
  return NextResponse.json({ ok: true });
}
