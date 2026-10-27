"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CertificateFace from "@/features/courses/certificates/CertificateFace";
import { useHydrated } from "@/hooks/useHydrated";
import type { CertificatesSectionModel } from "@/lib/courses/certificates/send";
import { PREVIEW, SECTION_TITLE, SEND_TEST, THE_EMAIL, testSaid } from "@/lib/courses/certificates/words";
// The Overview's own stylesheet: this card is a part of that page.
import styles from "./ProgrammeOverview.module.css";

/**
 * CERTIFICATES (board en-finish), on the programme's Overview under Who
 * finished, once the run's last session is over, for its lead and admins.
 * The server worded all of it (`buildCertificatesSection`); this draws it and
 * sends the two presses.
 *
 * "Send a test to me" emails the presser the first person's email, marked as
 * a test. Until one has reached them the send stays locked, and the line under
 * it says why. The send carries the two numbers it showed, so nobody is
 * emailed by a count they did not see; the answer is the section as the
 * server now has it, with what the press did. Before the page is live neither
 * button can be pressed, since nothing would be listening.
 *
 * The thumbnail is the certificate itself, made smaller, and opens the
 * preview of its page; "Preview" opens the email's.
 */
export default function CertificatesSection({
  model: initial,
  roundId,
  programmeId,
}: {
  model: CertificatesSectionModel;
  roundId: string;
  programmeId: string;
}) {
  const live = useHydrated();
  const router = useRouter();
  const [model, setModel] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const base = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/certificates`;

  async function press(path: string, body: unknown, words: (answer: Record<string, unknown>) => string[]) {
    setBusy(true);
    setProblem(null);
    setSaid([]);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      if (!response.ok) {
        setProblem(typeof answer.error === "string" ? answer.error : "That didn’t go. Try again in a minute.");
        // The numbers or the people may have moved: draw the section as it is now.
        router.refresh();
        return;
      }
      if (answer.model) setModel(answer.model as CertificatesSectionModel);
      setSaid(words(answer));
    } catch {
      setProblem("Couldn’t reach the site. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const sendTest = () =>
    press(`${base}/test`, {}, (answer) => {
      const delivery = answer.delivery === "sent" || answer.delivery === "suppressed" ? answer.delivery : "held";
      return [testSaid(delivery, typeof answer.subject === "string" ? answer.subject : "")];
    });

  const send = () =>
    press(base, { certificates: model.owed.certificates, emails: model.owed.emails }, (answer) =>
      Array.isArray(answer.said) ? answer.said.filter((line): line is string => typeof line === "string") : [],
    );

  const idle = live && !busy;
  return (
    <section className={styles.wfCard} aria-labelledby="overview-certificates">
      <h2 id="overview-certificates" className={styles.wfTitle}>
        {SECTION_TITLE}
      </h2>
      <p className={styles.wfSentence}>{model.counts}</p>
      <div className={styles.ctBody}>
        {model.preview && (
          <Link href={model.preview.href} aria-label={model.preview.label} className={styles.ctThumb}>
            <span className={styles.ctThumbZoom}>
              <CertificateFace face={model.preview.face} />
            </span>
          </Link>
        )}
        <div className={styles.ctSide}>
          {model.email && (
            <>
              <p className={styles.ctEyebrow}>{THE_EMAIL}</p>
              <p className={styles.ctSubject}>
                <span>{model.email.subject}</span>
                <Link href={model.email.href} className={styles.textLink}>
                  {PREVIEW}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.arrow}>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </p>
            </>
          )}
          <div className={styles.ctButtons}>
            <button
              type="button"
              className={`${styles.ctButton} ${styles.ctButtonQuiet}`}
              disabled={!idle || model.email === null}
              onClick={() => void sendTest()}
            >
              {SEND_TEST}
            </button>
            {model.owed.certificates > 0 && (
              <button
                type="button"
                className={`${styles.ctButton} ${styles.ctButtonMain}`}
                disabled={!idle || !model.tested}
                onClick={() => void send()}
              >
                {model.button}
              </button>
            )}
          </div>
          {model.testFirst && (
            <p className={styles.ctLock}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.ctIcon}>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              {model.testFirst}
            </p>
          )}
          {model.emailsLine && <p className={styles.ctLine}>{model.emailsLine}</p>}
          {model.allSent && <p className={styles.ctLine}>{model.allSent}</p>}
          {model.noAddress && <p className={styles.ctWarn}>{model.noAddress}</p>}
          <div role="status" className={styles.ctSaid}>
            {said.map((line) => (
              <p key={line} className={styles.ctLine}>
                {line}
              </p>
            ))}
          </div>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </div>
      </div>
      <p className={styles.ctFoot}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.ctIcon}>
          <path d="M4 4l16 16M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1-.9 2.3-2 3.6M6.3 6.6C4.2 8 3.2 10 3 12c.5 2.5 4 7 9 7 1.6 0 3-.4 4.2-1" />
        </svg>
        {model.notFinished}
      </p>
    </section>
  );
}
