import { NextResponse } from "next/server";
import { codeFrom } from "@/lib/courses/certificates/model";
import { renderCertificatePdf } from "@/lib/courses/certificates/pdf";
import { pdfFileName } from "@/lib/courses/certificates/pdfLayout";
import { certificatePdfFor } from "@/lib/courses/certificates/record";
import { NOT_HERE } from "@/lib/courses/certificates/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Download PDF (board en-cert): a certificate as an A4 page, for its owner
 * alone, signed in as themselves. Anybody else, a view-as session, and any
 * code that opens nothing or cannot be one are told the same thing, whether
 * or not the link is on (`certificatePdfFor` says why).
 *
 * Reads and draws; writes nothing. The file is saved as
 * `naisi-certificate-<code>.pdf`, kept out of every cache but the owner's
 * browser, and out of search results.
 */

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const code = codeFrom((await ctx.params).code);
  if (!code) return NextResponse.json({ error: NOT_HERE }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const viewAs = markerIsLive(await getImpersonator(), user.uid);
  const found = await certificatePdfFor(db, code, user, viewAs, process.env.NEXT_PUBLIC_APP_URL);
  if (!found) return NextResponse.json({ error: NOT_HERE }, { status: 404 });

  const { bytes } = await renderCertificatePdf(found.face, found.issuedAt);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(found.code)}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
