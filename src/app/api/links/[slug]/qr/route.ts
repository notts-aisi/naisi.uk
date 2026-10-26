import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/session";
import { codeForViewer } from "@/lib/qr/codeAccess";
import { qrPng, qrSvg, shortLinkAddress, shortLinkUrl } from "@/lib/qr/shortLinkCode";

export const dynamic = "force-dynamic";

/**
 * A short link's QR code as a picture: `GET /api/links/<slug>/qr`.
 *
 * `?format=png` (the default) or `?format=svg`; `&download=1` asks the browser
 * to save it as a file instead of showing it. The code encodes this site's
 * `/q/<slug>`, never where the link goes, so a printed code stays repointable.
 *
 * Read-only: it draws from the slug and writes nothing. Who may draw which
 * code is `codeForViewer`'s decision, shared with the sign page.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to see this code." }, { status: 401 });
  }

  const format = new URL(req.url).searchParams.get("format") ?? "png";
  if (format !== "png" && format !== "svg") {
    return NextResponse.json({ error: "Ask for format=png or format=svg." }, { status: 400 });
  }
  const download = new URL(req.url).searchParams.get("download") === "1";

  const { slug } = await ctx.params;
  const access = await codeForViewer(user, slug);
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.status });
  }

  const link = access.link;
  const text = shortLinkUrl(link.slug);
  const headers: Record<string, string> = {
    // The picture of a slug never changes, but who may see it can.
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="naisi-q-${link.slug}.${format}"`,
  };

  if (format === "svg") {
    return new NextResponse(qrSvg(text, `QR code for ${shortLinkAddress(link.slug)}`), {
      headers: {
        ...headers,
        "Content-Type": "image/svg+xml; charset=utf-8",
        // An SVG opened on its own is a document: let it run nothing.
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
  return new NextResponse(Buffer.from(qrPng(text)), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
