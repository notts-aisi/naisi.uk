import { NextResponse } from "next/server";
import { codeFrom, parseLinkSwitch } from "@/lib/courses/certificates/model";
import { setCertificateLink } from "@/lib/courses/certificates/record";
import { NOT_HERE } from "@/lib/courses/certificates/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A certificate's owner turning its link on or off (board en-cert: "Anyone
 * with the link can see it"). The body is `{ linkOn }`.
 *
 * Only the owner, signed in as themselves: a view-as session is turned away
 * first, because the switch decides whether a member's name is public.
 * Anybody else, and any code that opens nothing or cannot be one, is told
 * the same thing, so the answer says nothing about whether a certificate is
 * there. The owner is asked again inside the write (`setCertificateLink`).
 */

type Ctx = { params: Promise<{ code: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseLinkSwitch(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const code = codeFrom((await ctx.params).code);
  if (!code) return NextResponse.json({ error: NOT_HERE }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await setCertificateLink(db, user, code, parsed.value.linkOn);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, linkOn: outcome.linkOn });
}
