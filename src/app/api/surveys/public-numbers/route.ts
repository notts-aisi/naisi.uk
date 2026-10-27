import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { PUBLIC_NUMBERS_COLLECTION, publicNumbersId } from "@/lib/publicNumbers/model";
import { PUBLIC_NUMBERS_REFUSAL, publishedFrom } from "@/lib/surveys/publicNumbers";
import { lastSessionOf, loadNumbersProgramme, loadOffer } from "@/lib/surveys/publicNumbersLoad";
import { canRunSurveys } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * PUBLISH A PROGRAMME'S NUMBERS AND QUOTES ON ITS PUBLIC PAGE (sv-public).
 *
 *   POST { roundId, programmeId, numbers: [measure ids], quotes: [offered ids] }  ->  { ok: true }
 *
 * ADMINS ONLY, asked before anything is read. Nothing published is taken
 * from the request: the offer is worked out again here from the programme's
 * own surveys, each picked number is written as the offer holds it now, and
 * each picked quote as its words alone, with nothing that points back at its
 * answer or its writer. A pick the offer no longer holds is refused (409), so
 * what is published is what was previewed.
 *
 * One record per programme of a term (`publicNumbers/{roundId}__{programmeId}`),
 * replaced whole by each press: the programme's public page shows it at once.
 * Take it down is `./take-down`.
 */

/** The most ids one list may carry: far more than are ever offered. */
const MAX_PICKS = 200;

function idList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PICKS) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 300) return null;
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const roundId = typeof body.roundId === "string" ? body.roundId : "";
  const programmeId = typeof body.programmeId === "string" ? body.programmeId : "";
  const numbers = idList(body.numbers);
  const quotes = idList(body.quotes);
  if (!isAddressableId(roundId) || !isAddressableId(programmeId) || !numbers || !quotes) {
    return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.body }, { status: 400 });
  }
  if (numbers.length === 0 && quotes.length === 0) {
    return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.nothing }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const programme = await loadNumbersProgramme(db, roundId, programmeId);
  if (!programme) return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.noProgramme }, { status: 404 });
  const published = publishedFrom(await loadOffer(db, programme), { numbers, quotes });
  if (!published.ok) {
    if (published.why === "nothing") return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.nothing }, { status: 400 });
    if (published.why === "notReady") return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.notReady }, { status: 409 });
    return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.changed }, { status: 409 });
  }
  const block = published.block;
  await db
    .collection(PUBLIC_NUMBERS_COLLECTION)
    .doc(publicNumbersId(programme.roundId, programme.programmeId))
    .set({
      roundId: programme.roundId,
      programmeId: programme.programmeId,
      courseId: programme.courseId,
      term: programme.term,
      lastSessionOn: await lastSessionOf(db, programme, new Date()),
      heading: block.heading,
      numbers: block.numbers,
      quotes: block.quotes,
      attribution: block.attribution,
      footer: block.footer,
      publishedAt: FieldValue.serverTimestamp(),
      publishedByUid: actor.uid,
    });
  return NextResponse.json({ ok: true });
}
