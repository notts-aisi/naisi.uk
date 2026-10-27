"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import codeActions from "@/features/qr/codeActions.module.css";
import { QrFullScreen } from "@/features/qr/QrFullScreen";
import { useHydrated } from "@/hooks/useHydrated";
import { CODE_CARD_WORDS } from "@/lib/surveys/events/words";
import styles from "./surveyAdmin.module.css";
import eventStyles from "./eventSurvey.module.css";

/**
 * "At the event: the QR code" (sv-send): the survey's own short link and its
 * code, drawn by the server, with the PNG to download and the code to show
 * full screen at the end of the event. Until the survey is open, a button
 * opens it, which fixes its questions as a send does and emails nobody.
 */
export default function SurveyCodeCard({
  surveyId,
  code,
  qr,
  openSince,
  answers,
  canOpen,
}: {
  surveyId: string;
  code: { slug: string; address: string; active: boolean } | null;
  /** The code itself, drawn by the server. */
  qr: ReactNode;
  /** "Sun 1 Nov, 4:30pm" once it takes answers, else "". */
  openSince: string;
  /** Answers sent signed in with the code. */
  answers: number;
  /** It can be opened now: a draft whose closing day has not passed. */
  canOpen: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [full, setFull] = useState(false);

  async function open() {
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/open-at-event`, { method: "POST" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setProblem(result.error ?? CODE_CARD_WORDS.failed);
      router.refresh();
    } catch {
      setProblem(CODE_CARD_WORDS.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-code">
      <h2 id="send-code" className={`${styles.sectionTitle} ${eventStyles.step}`}>
        <span className={eventStyles.stepNumber} aria-hidden="true">
          2
        </span>
        {CODE_CARD_WORDS.heading}
      </h2>
      {code ? (
        <div className={eventStyles.codeRow}>
          <div className={eventStyles.codeImage}>{qr}</div>
          <div className={eventStyles.codeText}>
            <p className={eventStyles.codeAddress}>{code.address}</p>
            <p className={styles.muted}>{openSince ? CODE_CARD_WORDS.upSince(openSince, answers) : CODE_CARD_WORDS.notOpen}</p>
            {!code.active && <p className={styles.muted}>{CODE_CARD_WORDS.switchedOff}</p>}
            <div className={eventStyles.actions}>
              <a href={`/api/links/${encodeURIComponent(code.slug)}/qr?format=png&download=1`} download={`naisi-q-${code.slug}.png`} className={codeActions.action}>
                {CODE_CARD_WORDS.download}
              </a>
              <button type="button" className={eventStyles.fullButton} disabled={!hydrated} onClick={() => setFull(true)}>
                {CODE_CARD_WORDS.fullScreen}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.muted}>{CODE_CARD_WORDS.noCode}</p>
      )}
      <p className={styles.muted}>{CODE_CARD_WORDS.who}</p>
      <p className={styles.muted}>{CODE_CARD_WORDS.oneEach}</p>
      {canOpen && (
        <>
          <div className={eventStyles.actions}>
            <Button onClick={() => void open()} disabled={!hydrated || busy}>
              {busy ? CODE_CARD_WORDS.opening : CODE_CARD_WORDS.open}
            </Button>
          </div>
          <p className={styles.muted}>{CODE_CARD_WORDS.openNote}</p>
        </>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      {full && code && <QrFullScreen slug={code.slug} address={code.address} onClose={() => setFull(false)} />}
    </section>
  );
}
