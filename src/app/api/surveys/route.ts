import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { createSurvey, parseCreate } from "@/lib/surveys/create";
import { createEventSurvey, parseEventCreate } from "@/lib/surveys/events/create";
import { canRunSurveys } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * MAKE ONE OF A PROGRAMME'S SURVEYS from its stage's template (sv-new): the
 * programme, the stage (before it, at its end, 6 or 12 months on), the day
 * it closes and, for an incubator, its research strand. Or, with
 * `template: "event"`, the survey after an event ("After a social"): the
 * event, who its email goes to (`audience`: "came" or "signups") and the day
 * it closes. Admins only: only admins make, send, remind and close surveys.
 *
 * ORDER: view-as first, then the session and the admin bar, then the body,
 * and only then a read. Answers `{ ok, survey: { id } }`.
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
  const now = new Date();
  // A survey after an event is made from its own template (src/lib/surveys/events/create.ts).
  if (raw && typeof raw === "object" && (raw as { template?: unknown }).template === "event") {
    const parsedEvent = parseEventCreate(raw, now);
    if (!parsedEvent.ok) return NextResponse.json({ error: parsedEvent.error }, { status: parsedEvent.status });
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    const madeEvent = await createEventSurvey(db, actor.uid, parsedEvent.input, now);
    if (!madeEvent.ok) return NextResponse.json({ error: madeEvent.error }, { status: madeEvent.status });
    return NextResponse.json({ ok: true, survey: { id: madeEvent.id } });
  }
  const parsed = parseCreate(raw, now);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const made = await createSurvey(db, actor.uid, parsed.input, now);
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
  return NextResponse.json({ ok: true, survey: { id: made.id } });
}
