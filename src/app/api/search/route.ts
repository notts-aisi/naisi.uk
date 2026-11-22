import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { answerSearch, findsProgrammes, searcherOf } from "@/lib/search/load";
import { NO_ANSWER, isAskableQuery, queryWords } from "@/lib/search/model";
import { SEARCH_REFUSAL } from "@/lib/search/words";

/**
 * SEARCH FOR A PERSON OR A GROUP, from the sidebar (`src/features/search/`).
 *
 * WHO: an admin, a programme's lead and a group's facilitator, worked out
 * from the records on every request (`searcherOf`, `src/lib/search/load.ts`).
 * Everybody else, signed out, waiting, refused or an approved account that
 * runs nothing, gets ONE answer, the same 403 with the same words, before
 * their request is read: nobody learns from it whether they are signed in, or
 * anything about anybody. In a view-as session the session is the person
 * viewed, so they are answered as that person would be; nothing here writes,
 * so there is nothing for the view-as guard to refuse.
 *
 * ## GET: does the sidebar draw the box?
 *
 * `{ searches: true, programmes }` for somebody this route answers, the
 * refusal for anybody else. The shell asks once, because who leads and who
 * facilitates is in the records and not on the session. `programmes` says
 * whether a query can find a programme for them (an admin, or a programme's
 * lead: `findsProgrammes`), so the box promises programmes only to those it
 * can find one for; a facilitator who leads nothing is told false.
 *
 * ## POST: one query
 *
 *   { query }
 *
 * A POST so the words typed travel in the body and never in an address that
 * a request log would keep. The answer is at most six people and four groups
 * (`src/lib/search/model.ts`), each a name as the reader is already shown it,
 * what it is, and a page the reader may already open; and, only when one
 * matched, at most four programmes whose Overview the reader opens. Fewer than two letters
 * is answered with nothing, without a read.
 *
 * LIMITS, checked BEFORE anything decides who the caller is, so a caller
 * who is refused cannot spend reads without limit either: thirty requests a
 * minute and three hundred an hour, for each account, and for a caller with
 * no session for each address the request came from (`rateLimit` and
 * `clientIp`, the site's own throttles, kept in the server's memory: nothing
 * is written to count them). The GET has its own count, so the shell's one
 * question never takes a query from the box. The box asks after a pause in
 * typing, or on Enter, never on every key.
 *
 * NOTHING IS KEPT OR LOGGED: not the query, not what it found, not that it
 * was asked. A failure is logged without either.
 */

const PER_MINUTE = 30;
const PER_HOUR = 300;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * One request against the two windows, by account, or by address for a
 * caller with no session. Null when it may go on; the 429 when it may not.
 */
function throttled(req: Request, uid: string | null, kind: "ask" | "check") {
  const who = uid ? `uid:${uid}` : `ip:${clientIp(req)}`;
  // Both windows count every request, so a burst cannot hide inside the hour.
  const minute = rateLimit(`search:${kind}:${who}`, PER_MINUTE, MINUTE_MS);
  const hour = rateLimit(`search:${kind}:hour:${who}`, PER_HOUR, HOUR_MS);
  if (minute.ok && hour.ok) return null;
  const wait = Math.max(minute.retryAfterSeconds, hour.retryAfterSeconds);
  return NextResponse.json({ error: SEARCH_REFUSAL.tooMany }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(wait) } });
}

/** The one answer for everybody search is not for. */
function refused() {
  return NextResponse.json({ error: SEARCH_REFUSAL.notYours }, { status: 403, headers: NO_STORE });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const slow = throttled(req, user?.uid ?? null, "check");
  if (slow) return slow;
  if (!user) return refused();
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: SEARCH_REFUSAL.notConfigured }, { status: 500, headers: NO_STORE });
  let searcher;
  try {
    searcher = await searcherOf(db, user);
  } catch {
    console.error("[search] could not work out who may search");
    return NextResponse.json({ error: SEARCH_REFUSAL.failed }, { status: 500, headers: NO_STORE });
  }
  if (!searcher) return refused();
  return NextResponse.json({ searches: true, programmes: findsProgrammes(searcher) }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const slow = throttled(req, user?.uid ?? null, "ask");
  if (slow) return slow;
  if (!user) return refused();
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: SEARCH_REFUSAL.notConfigured }, { status: 500, headers: NO_STORE });

  let searcher;
  try {
    searcher = await searcherOf(db, user);
  } catch {
    console.error("[search] could not work out who may search");
    return NextResponse.json({ error: SEARCH_REFUSAL.failed }, { status: 500, headers: NO_STORE });
  }
  if (!searcher) return refused();

  const body = (await req.json().catch(() => null)) as { query?: unknown } | null;
  const query = body && typeof body === "object" ? body.query : undefined;
  if (!isAskableQuery(query)) {
    return NextResponse.json({ error: SEARCH_REFUSAL.badQuery }, { status: 400, headers: NO_STORE });
  }
  // Too short to ask: the same empty answer as a name nobody holds, and nothing read.
  if (!queryWords(query)) return NextResponse.json(NO_ANSWER, { headers: NO_STORE });

  try {
    const answer = await answerSearch(db, user, searcher, query, new Date());
    return NextResponse.json(answer, { headers: NO_STORE });
  } catch {
    // Never the query, never what it found.
    console.error("[search] a search failed");
    return NextResponse.json({ error: SEARCH_REFUSAL.failed }, { status: 500, headers: NO_STORE });
  }
}
