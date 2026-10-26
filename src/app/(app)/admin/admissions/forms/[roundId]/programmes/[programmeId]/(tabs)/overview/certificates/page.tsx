import Link from "next/link";
import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import CertificateFace from "@/features/courses/certificates/CertificateFace";
import { loadCertificatesPreview, programmePathOf } from "@/lib/courses/certificates/send";
import {
  LEADS_AND_ADMINS,
  PREVIEW_BACK,
  PREVIEW_PAGE_NOTE,
  PREVIEW_NOBODY,
  THE_EMAIL,
  previewPageTitle,
} from "@/lib/courses/certificates/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import styles from "./certificatesPreview.module.css";

/**
 * THE PREVIEW the Certificates section opens (board en-finish's thumbnail
 * and its "Preview"): one person's certificate as its page will show it to
 * them once it is sent, with its link off, and the email that sends it, laid
 * out as it will arrive. The person is the one the test is about: the first
 * still owed one. Nothing is made and nothing is sent.
 *
 * FOR THE PROGRAMME'S LEAD AND ADMINS, as the section is: the read asks the
 * form who the caller is before anything about the run (`loadCertificatesPreview`),
 * and is refused before the run's last session is over.
 */
export default async function CertificatesPreviewPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db
    ? await loadCertificatesPreview(db, user, roundId, programmeId, new Date(), process.env.NEXT_PUBLIC_APP_URL)
    : null;
  const overview = `${programmePathOf(roundId, programmeId)}/overview`;
  if (!outcome || (!outcome.ok && outcome.status === 404)) return <NoProgrammeHere roundId={roundId} />;
  if (!outcome.ok && outcome.status === 403) {
    return (
      <Refusal title={LEADS_AND_ADMINS} href={`${programmePathOf(roundId, programmeId)}/applications`} action="Go to applications">
        The certificates name the people who finished, so only the programme’s lead or an admin can see them before
        they are sent.
      </Refusal>
    );
  }
  return (
    <div className={styles.page}>
      <Link href={overview} className={styles.back}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {PREVIEW_BACK}
      </Link>
      {!outcome.ok ? (
        <p className={styles.note}>{outcome.error}</p>
      ) : !outcome.preview ? (
        <p className={styles.note}>{PREVIEW_NOBODY}</p>
      ) : (
        <>
          <section id="page" className={styles.section} aria-labelledby="preview-page">
            <h2 id="preview-page" className={styles.title}>
              {previewPageTitle(outcome.preview.name)}
            </h2>
            <p className={styles.note}>{PREVIEW_PAGE_NOTE}</p>
            <div className={styles.certificate}>
              <CertificateFace face={outcome.preview.face} />
            </div>
          </section>
          <section id="email" className={styles.section} aria-labelledby="preview-email">
            <h2 id="preview-email" className={styles.title}>
              {THE_EMAIL}
            </h2>
            <p className={styles.subject}>{outcome.preview.email.subject}</p>
            <iframe
              title={outcome.preview.email.subject}
              srcDoc={outcome.preview.email.html}
              sandbox=""
              className={styles.email}
            />
          </section>
        </>
      )}
    </div>
  );
}
