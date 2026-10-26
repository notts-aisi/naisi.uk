import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { writeKairosChoice } from "@/lib/kairos/choice";
import { KAIROS_REFUSAL } from "@/lib/kairos/words";

/**
 * A PERSON CHANGES THEIR KAIROS CHOICE ON THEIR PROFILE: "Don't share my
 * details with Kairos", or sharing them again. The same choice every
 * programme survey's form ends with, kept on the person's own record
 * (`src/lib/kairos/model.ts`) through its one writer.
 *
 * There is no uid in the request: the record changed is the caller's own.
 * Refused during a view-as session, so an admin looking at the site as a
 * member can never change what the member said. Body `{ shared }`, true to
 * share and false not to. Nobody is emailed.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: KAIROS_REFUSAL.notSignedIn }, { status: 401 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const shared = raw && typeof raw === "object" ? (raw as { shared?: unknown }).shared : undefined;
  if (typeof shared !== "boolean") return NextResponse.json({ error: KAIROS_REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  await writeKairosChoice(db, { uid: actor.uid, shared, via: "settings" });
  return NextResponse.json({ ok: true, shared });
}
