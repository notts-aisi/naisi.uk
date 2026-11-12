import { NextResponse } from "next/server";
import { REQUEST_EMAILS_REFUSAL } from "@/lib/courses/excused/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "EMAIL ME ABOUT NEW REQUESTS", an admin's own switch on the Requests page:
 * whether they are emailed when somebody asks to be excused
 * (`src/lib/courses/excused/alert.ts`). On unless they switch it off.
 *
 * The body is `{ on }`, true or false. It writes one field on the caller's
 * own user document, `requestEmails.excused`, and nothing else; there is no
 * way to spell another person here. Admins only: nobody else is emailed
 * about a request, so nobody else has the switch.
 *
 * ORDER: a view-as session is refused first, then somebody signed out, then
 * anybody but an admin with one 403, then a body that is not a switch.
 * Nobody is emailed.
 */

export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body || Object.keys(body).some((key) => key !== "on") || typeof body.on !== "boolean") {
    return NextResponse.json({ error: REQUEST_EMAILS_REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  await db.collection("users").doc(user.uid).set({ requestEmails: { excused: body.on } }, { merge: true });
  return NextResponse.json({ ok: true, on: body.on });
}
