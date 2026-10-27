import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { PUBLIC_NUMBERS_COLLECTION, normalizePublicNumbers, publicNumbersId } from "@/lib/publicNumbers/model";
import { PUBLIC_NUMBERS_REFUSAL } from "@/lib/surveys/publicNumbers";
import { canRunSurveys } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * TAKE A PROGRAMME'S PUBLIC NUMBERS DOWN (sv-public): "Take it down any time."
 *
 *   POST { roundId, programmeId }  ->  { ok: true }
 *
 * ADMINS ONLY, asked before anything is read. Deletes the programme's record,
 * so its public page draws no "Last term" block from the next request on.
 * Addressed by the record's own ids, so it still works once the programme's
 * form has gone. Nothing published for it is answered 404.
 */
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
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The record's own ids must be the ones asked for: two pairs of ids can
  // join to one address, and one programme's press never takes down another's.
  const ref = db.collection(PUBLIC_NUMBERS_COLLECTION).doc(publicNumbersId(roundId, programmeId));
  const snap = await ref.get();
  const stored = snap.exists ? normalizePublicNumbers(snap.id, (snap.data() ?? {}) as Record<string, unknown>) : null;
  if (!stored || stored.roundId !== roundId || stored.programmeId !== programmeId) {
    return NextResponse.json({ error: PUBLIC_NUMBERS_REFUSAL.nothingPublished }, { status: 404 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
