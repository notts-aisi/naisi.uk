import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { isMemberRole, readSendBody, weekFits } from "@/lib/societyFeedback/model";
import { findProgramme } from "@/lib/societyFeedback/programmes";
import { keepSocietyFeedback } from "@/lib/societyFeedback/send";
import { REFUSAL_WORDS } from "@/lib/societyFeedback/words";

/**
 * "SEND ANONYMOUSLY": one entry of anonymous feedback for the whole society
 * (docs/surveys.md, "Anonymous feedback for the whole society").
 *
 * Body `{ words, roundId?, programmeId?, week?, about? }`.
 *
 * MEMBERS ONLY, AND NOTHING OF THE MEMBER IS KEPT. The session is read once,
 * to answer one question: is the caller a signed-in, approved member. The
 * answer is a yes or a no, and nothing else of the session (the account, the
 * address, the name) goes any further than that line: the writer is handed
 * what was sent, the programme found for it and the time, and writes exactly
 * `ENTRY_FIELDS` (`keepSocietyFeedback`). Nothing is logged, and the answer
 * carries no id. `tests/society-feedback-no-trace.test.mjs` holds every file
 * of the form to that.
 *
 * View-as is refused first: an admin looking through a member's eyes is not
 * that member, and an entry sent then would read as a member's own.
 *
 * Three limits keep floods out, each a count in this server's memory alone,
 * never stored: per address, 30 a minute and 30 an hour (the address is read
 * for those two keys and nothing else), so one address cannot use up the
 * whole form's allowance; and 300 an hour for the whole form.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const limit = rateLimit(`society-feedback:ip:${clientIp(req)}`, 30, 60_000);
  const hourly = limit.ok ? rateLimit(`society-feedback:ip-hour:${clientIp(req)}`, 30, 3_600_000) : limit;
  if (!limit.ok || !hourly.ok) {
    const wait = Math.max(limit.retryAfterSeconds, hourly.retryAfterSeconds);
    return NextResponse.json({ error: REFUSAL_WORDS.tooMany }, { status: 429, headers: { "Retry-After": String(wait) } });
  }

  // The one read of the session: a yes or a no. `user` is used on these two
  // lines and nowhere else in this handler.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: REFUSAL_WORDS.notMember }, { status: 401 });
  if (!isMemberRole(user.role)) return NextResponse.json({ error: REFUSAL_WORDS.notMember }, { status: 403 });

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    raw = "";
  }
  const read = readSendBody(raw);
  if (!read.ok) return NextResponse.json({ error: REFUSAL_WORDS[read.problem] }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const programme = read.sent.programme ? await findProgramme(db, read.sent.programme.roundId, read.sent.programme.programmeId) : null;
  if (read.sent.programme && !programme) return NextResponse.json({ error: REFUSAL_WORDS.noProgramme }, { status: 404 });
  if (programme && !weekFits(read.sent.week, programme)) return NextResponse.json({ error: REFUSAL_WORDS.shape }, { status: 400 });

  const overall = rateLimit("society-feedback:all", 300, 3_600_000);
  if (!overall.ok) {
    return NextResponse.json(
      { error: REFUSAL_WORDS.tooManyOverall },
      { status: 429, headers: { "Retry-After": String(overall.retryAfterSeconds) } },
    );
  }

  await keepSocietyFeedback(db, read.sent, programme, new Date());
  return NextResponse.json({ ok: true });
}
