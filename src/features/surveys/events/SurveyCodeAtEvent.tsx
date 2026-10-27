"use client";

import { useState, type ReactNode } from "react";
import codeActions from "@/features/qr/codeActions.module.css";
import { QrFullScreen } from "@/features/qr/QrFullScreen";
import fullScreen from "@/features/surveys/admin/eventSurvey.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { CODE_CARD_WORDS } from "@/lib/surveys/events/words";
import styles from "@/features/events/checkIn/CheckInTab.module.css";

type Props = {
  /** The survey's own short link, as its card names it. */
  code: { slug: string; address: string; active: boolean };
  /** The code itself, drawn by the server. */
  qr: ReactNode;
};

/**
 * An event survey's QR code on the event's Survey after tab, for the people
 * who show it at the end of the event (`surveyCodeAtEvent`: admins and
 * SU-recognised committee, while the survey takes answers): the code, its
 * address, "Download PNG" and "Show full screen", in the Send tab's words.
 * Nothing about the survey's answers or who gave them, and no way to open
 * it: opening fixes its questions, an admin's act on the survey's own page.
 */
export default function SurveyCodeAtEvent({ code, qr }: Props) {
  const hydrated = useHydrated();
  const [full, setFull] = useState(false);
  return (
    <section className={styles.card} aria-labelledby="survey-code-heading">
      <h2 id="survey-code-heading" className={styles.cardHeading}>
        {CODE_CARD_WORDS.heading}
      </h2>
      <div className={styles.codeBox}>
        <div className={styles.codeImage}>{qr}</div>
        <p className={styles.codeAddress}>{code.address}</p>
      </div>
      {!code.active && <p className={styles.warn}>{CODE_CARD_WORDS.switchedOff}</p>}
      <div className={styles.cardActions}>
        <a
          href={`/api/links/${encodeURIComponent(code.slug)}/qr?format=png&download=1`}
          download={`naisi-q-${code.slug}.png`}
          className={codeActions.action}
        >
          {CODE_CARD_WORDS.download}
        </a>
        <button type="button" className={fullScreen.fullButton} disabled={!hydrated} onClick={() => setFull(true)}>
          {CODE_CARD_WORDS.fullScreen}
        </button>
      </div>
      {full && <QrFullScreen slug={code.slug} address={code.address} onClose={() => setFull(false)} />}
    </section>
  );
}
