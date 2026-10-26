import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { QrCode } from "@/features/qr/QrCode";
import { isCampaignSlug } from "@/lib/campaign/attribution";
import { getCurrentUser } from "@/lib/firebase/session";
import { codeForViewer } from "@/lib/qr/codeAccess";
import { shortLinkAddress, shortLinkUrl } from "@/lib/qr/shortLinkCode";
import { PrintButton } from "./PrintButton";
import styles from "./sign.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print a sign",
  robots: { index: false, follow: false },
};

/**
 * An A4 sign for one short link: its name, its QR code and its address
 * written out, so somebody whose camera will not read the code can type it.
 *
 * Outside every route group, under the root layout alone: the signed-in
 * frame's sidebar and phone bar would print, and this page is for paper. On
 * screen it shows the sheet with a Print button and a way back; in print the
 * sheet is all there is.
 *
 * The code is drawn here on the server, as inline SVG, so it prints sharp at
 * any size. It encodes this site's `/q/<slug>`, never where the link goes.
 * Who may print which sign is `codeForViewer`'s decision, the same one the
 * download route asks.
 */
export default async function SignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();

  const user = await getCurrentUser();
  if (!user) {
    redirect(isCampaignSlug(slug) ? `/login?next=${encodeURIComponent(`/signs/${slug}`)}` : "/login");
  }

  const access = await codeForViewer(user, slug);
  if (!access.ok) {
    return (
      <main className={styles.page}>
        <div className={styles.refusal}>
          <h1 className={styles.refusalTitle}>No sign to print</h1>
          <p>{access.reason}</p>
          <p>
            <Link href="/dashboard" className={styles.backLink}>
              Go to Home
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const { link } = access;
  const address = shortLinkAddress(link.slug);
  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={link.backHref} className={styles.backLink}>
          Back
        </Link>
        <p className={styles.toolbarNote}>One A4 sheet. The code always goes to {address}.</p>
        <PrintButton />
      </div>

      <article className={styles.sheet} aria-label="The sign, as it prints">
        <div className={styles.sheetInner}>
          <h1 className={styles.name}>{link.name}</h1>
          <QrCode
            className={styles.code}
            text={shortLinkUrl(link.slug)}
            label={`QR code for ${address}`}
          />
          <p className={styles.address}>{address}</p>
          {link.note && <p className={styles.note}>{link.note}</p>}
        </div>
      </article>
    </main>
  );
}
