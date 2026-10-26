"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import codeActions from "@/features/qr/codeActions.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { DOOR_CODE_LINE } from "@/lib/events/checkInView";
import styles from "./CheckInTab.module.css";

type Props = {
  eventId: string;
  /** The event's door code, or null when nobody has made one. */
  code: { slug: string; address: string; active: boolean } | null;
  /** The code itself, drawn by the server. */
  qr: ReactNode;
};

/**
 * The door QR code (ev-manage): the code, its address, who it is for, and the
 * sign and the PNG. Until the event has one, a button makes it: a short link
 * that is never deleted, so it is made once and on purpose.
 */
export default function DoorCodeCard({ eventId, code, qr }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/door-code`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn’t work. Try again.");
      router.refresh();
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? "There’s no connection. Try again."
          : err instanceof Error
            ? err.message
            : "That didn’t work. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="door-code-heading">
      <h2 id="door-code-heading" className={styles.cardHeading}>
        The door QR code
      </h2>
      {code ? (
        <>
          <div className={styles.codeBox}>
            <div className={styles.codeImage}>{qr}</div>
            <p className={styles.codeAddress}>{code.address}</p>
          </div>
          {!code.active && (
            <p className={styles.warn}>This code is switched off in Short links, so a scan lands on /links.</p>
          )}
          <p className={styles.cardText}>{DOOR_CODE_LINE}</p>
          <div className={styles.cardActions}>
            <a
              href={`/signs/${encodeURIComponent(code.slug)}`}
              target="_blank"
              rel="noopener"
              className={codeActions.action}
            >
              Print an A4 sign
            </a>
            <a
              href={`/api/links/${encodeURIComponent(code.slug)}/qr?format=png&download=1`}
              download={`naisi-q-${code.slug}.png`}
              className={codeActions.action}
            >
              <DownloadMark />
              Download PNG
            </a>
          </div>
        </>
      ) : (
        <>
          <p className={styles.cardText}>
            No door code yet. Make one, then print it for the door. {DOOR_CODE_LINE}
          </p>
          <div className={styles.cardActions}>
            <Button variant="secondary" disabled={!hydrated || busy} onClick={() => void make()}>
              {busy ? "Making it…" : "Make the door code"}
            </Button>
          </div>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function DownloadMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M12 4v11M7 10l5 5 5-5M5 20h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
