import Link from "next/link";
import CertificateFace from "@/features/courses/certificates/CertificateFace";
import type { CertificateCardView } from "@/lib/courses/certificates/card";
import { ADD_TO_LINKEDIN, CARD_TITLE, CARD_TITLE_BOTH } from "@/lib/courses/certificates/words";
import weekly from "./weekly/weekly.module.css";

/**
 * "YOUR CERTIFICATE" (board en-after-phone), on the programme's page once the
 * owner has been sent one: the certificate made smaller, the day it was
 * issued, whether anyone else can see it, "See your certificate" and "Add to
 * LinkedIn". Both, one under the other, for a facilitator who also finished.
 * Nothing at all for somebody sent none.
 *
 * A part of its own, so the after-the-end page can place it in its own
 * layout. It takes the card's view (`cardViewOf`), never a stored document.
 */
export default function CertificateCard({
  certificates,
  className,
}: {
  certificates: CertificateCardView[];
  className?: string;
}) {
  if (certificates.length === 0) return null;
  return (
    <section className={`${weekly.card} ${className ?? ""}`} aria-labelledby="your-certificate">
      <h2 id="your-certificate" className={weekly.cardTitle}>
        {certificates.length === 1 ? CARD_TITLE : CARD_TITLE_BOTH}
      </h2>
      {certificates.map((certificate) => (
        <div key={certificate.kind} className={weekly.certRow}>
          <div className={weekly.certTop}>
            <span className={weekly.certThumb} aria-hidden="true">
              <span className={weekly.certThumbZoom}>
                <CertificateFace face={certificate.face} />
              </span>
            </span>
            <div className={weekly.certText}>
              {certificate.issued && <p className={weekly.certIssued}>{certificate.issued}</p>}
              <p className={weekly.cardLine}>{certificate.privacy}</p>
            </div>
          </div>
          <Link href={certificate.href} className={weekly.certSee}>
            {certificate.see}
          </Link>
          {certificate.linkedInHref && (
            <a href={certificate.linkedInHref} target="_blank" rel="noopener noreferrer" className={weekly.certLinkedIn}>
              {ADD_TO_LINKEDIN}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </div>
      ))}
    </section>
  );
}
