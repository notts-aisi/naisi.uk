import type { Metadata } from "next";
import Link from "next/link";
import NetField from "@/components/ui/NetField";
import CertificateFace from "@/features/courses/certificates/CertificateFace";
import OwnerControls from "@/features/courses/certificates/OwnerControls";
import { codeFrom } from "@/lib/courses/certificates/model";
import { certificatePageView, type CertificatePageView } from "@/lib/courses/certificates/record";
import {
  CALM_BODY,
  CALM_EYEBROW,
  CALM_HOME_LINK,
  CALM_SIGN_IN,
  CALM_SIGN_IN_LINK,
  CALM_TITLE,
} from "@/lib/courses/certificates/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import styles from "./certificatePage.module.css";

/**
 * A CERTIFICATE'S PAGE, `naisi.uk/c/<code>` (boards en-cert and
 * en-cert-phone). The code is printed on the certificate's PDF, so this is a
 * printed-code landing page: everything it says is in its first HTML.
 *
 *  - TO ITS OWNER, signed in as themselves: the certificate, and under it
 *    what only they see (Download PDF, Add to LinkedIn, the switch that says
 *    whether anyone with the link can see it, Copy link), whether its link
 *    is on or off.
 *  - TO ANYBODY ELSE, signed in or not, while its link is on: the
 *    certificate, with the line that says where to check it.
 *  - OTHERWISE (its link is off, or the code opens nothing or cannot be
 *    one): one calm page, the same in every case, so it says nothing about
 *    whether a certificate is there. A signed-out visitor is also offered
 *    the way to sign in, which is the same for all of them.
 *
 * NEVER `notFound()`, and no not-found page beside it: a page that matched
 * its route and then calls it answers with an empty body until its script
 * arrives (tests/printed-code-landing-pages.test.mjs). Never indexed, and
 * linked from no public page and no sitemap. It shows the name the
 * certificate was issued to and nobody else's: no committee member's name,
 * no photo, no email address. Who sees what is decided once, in
 * `certificatePageView`; a view-as session is never the owner.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Certificate",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ code: string }> };

export default async function CertificatePage({ params }: Props) {
  const [{ code: raw }, user, marker] = await Promise.all([params, getCurrentUser(), getImpersonator()]);
  const db = getAdminDb();
  const viewAs = markerIsLive(marker, user?.uid ?? null);
  const view: CertificatePageView = db
    ? await certificatePageView(db, codeFrom(raw), user, viewAs, process.env.NEXT_PUBLIC_APP_URL)
    : { state: "none" };

  if (view.state === "none") {
    return <NothingHere signInHref={user ? null : `/login?next=${encodeURIComponent(`/c/${encodeURIComponent(raw)}`)}`} />;
  }

  return (
    <NetField net="hero" strength="soft" className={styles.hero}>
      <div className={styles.column}>
        <p className={styles.address}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={styles.addressIcon}
          >
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </svg>
          <span>{view.address}</span>
        </p>
        <CertificateFace face={view.face} nameAs="h1" />
        {view.state === "owner" && (
          <OwnerControls
            key={view.linkOn ? "on" : "off"}
            code={view.code}
            url={view.url}
            linkOn={view.linkOn}
            pdfHref={view.pdfHref}
            linkedInHref={view.linkedInHref}
          />
        )}
      </div>
    </NetField>
  );
}

/** The one page for a link that is off and a code that opens nothing. */
function NothingHere({ signInHref }: { signInHref: string | null }) {
  return (
    <NetField net="hero" strength="soft" className={styles.hero}>
      <div className={`${styles.column} ${styles.calm}`}>
        <p className={`meta ${styles.calmEyebrow}`}>{CALM_EYEBROW}</p>
        <h1 className={styles.calmTitle}>{CALM_TITLE}</h1>
        <p className={styles.calmBody}>{CALM_BODY}</p>
        {signInHref && <p className={styles.calmBody}>{CALM_SIGN_IN}</p>}
        <div className={styles.calmLinks}>
          {signInHref && (
            <Link href={signInHref} className={styles.calmLink}>
              {CALM_SIGN_IN_LINK}
            </Link>
          )}
          <Link href="/" className={styles.calmLink}>
            {CALM_HOME_LINK}
          </Link>
        </div>
      </div>
    </NetField>
  );
}
