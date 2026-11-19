import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { clearBefore, clearDayFits, countBefore } from "@/lib/societyFeedback/admin";
import { CLEAR_WORDS, dayKeyWordsWithYear } from "@/lib/societyFeedback/words";

/**
 * CLEARING OUT ANONYMOUS FEEDBACK BY HAND (docs/surveys.md, "Anonymous
 * feedback for the whole society"). Admins only. Nothing deletes an entry on
 * a timer: an admin chooses a day at the yearly review, is told how many were
 * sent before it, and confirms. The day can be no later than the same day a
 * year before today in London (`clearDayFits`), here as on the page, so no
 * press deletes feedback under a year old: the privacy policy says an admin
 * deletes "every entry more than a year old".
 *
 *  - GET `?before=YYYY-MM-DD`: `{ count }`, how many kept entries were sent
 *    before that day. One count; no entry is read.
 *  - POST `{ before, count }`: deletes them and answers `{ deleted, left }`.
 *    `count` is the number the admin was shown and confirmed: when the
 *    entries before that day are no longer that many, nothing is deleted
 *    and the answer is a 409 with the new count, so the confirm always said
 *    how many.
 */

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can do this." }, { status: 403 });
  const before = new URL(req.url).searchParams.get("before");
  if (!clearDayFits(before, new Date())) return NextResponse.json({ error: CLEAR_WORDS.badDay }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  return NextResponse.json({ count: await countBefore(db, before) });
}

export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can do this." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { before?: unknown; count?: unknown } | null;
  const before = body?.before;
  const confirmed = body?.count;
  if (!clearDayFits(before, new Date()) || typeof confirmed !== "number" || !Number.isInteger(confirmed) || confirmed < 1) {
    return NextResponse.json({ error: CLEAR_WORDS.badDay }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const count = await countBefore(db, before);
  if (count !== confirmed) return NextResponse.json({ error: CLEAR_WORDS.confirm(count, dayKeyWordsWithYear(before)), count }, { status: 409 });
  const { deleted, left } = await clearBefore(db, before);
  return NextResponse.json({ deleted, left });
}
