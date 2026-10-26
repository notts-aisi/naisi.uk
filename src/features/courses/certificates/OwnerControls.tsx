"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import {
  ADD_TO_LINKEDIN,
  COPY_FAILED,
  COPY_LINK,
  DOWNLOAD_PDF,
  LINK_COPIED,
  LINK_SWITCH,
  ONLY_YOU,
  SWITCH_FAILED,
  SWITCH_OFFLINE,
} from "@/lib/courses/certificates/words";
import styles from "./OwnerControls.module.css";

/**
 * WHAT ONLY A CERTIFICATE'S OWNER SEES UNDER IT (board en-cert): "Only you
 * see this", Download PDF, Add to LinkedIn, the switch that says whether
 * anyone with the link can see it, and Copy link.
 *
 * Takes the fields it draws and nothing else: a page anybody can open
 * renders it, and every prop is written into that page's HTML.
 *
 * The switch saves through the certificate's own route, which asks again
 * whether the caller is the owner, and then the page is drawn again from the
 * server, so the line that says where to check it comes and goes with the
 * link. The page keys this component on the stored link, so a fresh drawing
 * starts it from what is stored. Until the page's script has arrived the
 * switch and Copy link are shown but cannot be pressed: nothing is listening
 * to them yet.
 */
export default function OwnerControls({
  code,
  url,
  linkOn: initial,
  pdfHref,
  linkedInHref,
}: {
  code: string;
  /** The certificate's whole address, for Copy link. */
  url: string;
  linkOn: boolean;
  pdfHref: string;
  linkedInHref: string | null;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [linkOn, setLinkOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (copied !== "copied") return;
    const timer = window.setTimeout(() => setCopied(null), 4000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function turn(next: boolean) {
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/courses/certificates/${encodeURIComponent(code)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkOn: next }),
      });
      const body = (await response.json().catch(() => null)) as { linkOn?: unknown; error?: unknown } | null;
      if (!response.ok || typeof body?.linkOn !== "boolean") {
        setProblem(typeof body?.error === "string" ? body.error : SWITCH_FAILED);
        return;
      }
      setLinkOn(body.linkOn);
      router.refresh();
    } catch {
      setProblem(SWITCH_OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section className={styles.panel} aria-label={ONLY_YOU}>
      <div className={styles.top}>
        <span className={styles.onlyYou}>
          <Icon d={EYE_OFF} />
          {ONLY_YOU}
        </span>
        <div className={styles.actions}>
          <a className={`${styles.button} ${styles.filled}`} href={pdfHref} download>
            <Icon d={DOWNLOAD} size={18} />
            <span>{DOWNLOAD_PDF}</span>
          </a>
          {linkedInHref && (
            <a className={`${styles.button} ${styles.outlined}`} href={linkedInHref} target="_blank" rel="noopener noreferrer">
              <Icon d={OUT} size={18} />
              <span>{ADD_TO_LINKEDIN}</span>
            </a>
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        <label className={styles.switchRow}>
          <span className={styles.switchLabel}>{LINK_SWITCH}</span>
          <input
            type="checkbox"
            role="switch"
            className={styles.switchInput}
            checked={linkOn}
            disabled={!hydrated || saving}
            onChange={(event) => void turn(event.target.checked)}
          />
          <span aria-hidden="true" className={`${styles.track} ${linkOn ? styles.trackOn : ""}`}>
            <span className={styles.knob} />
          </span>
        </label>
        <div className={styles.copyWrap}>
          <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={() => void copy()} disabled={!hydrated}>
            <Icon d={LINK} size={18} />
            <span>{COPY_LINK}</span>
          </button>
        </div>
      </div>
      <p className={styles.status} role="status">
        {problem ?? (copied === "copied" ? LINK_COPIED : copied === "failed" ? COPY_FAILED : "")}
      </p>
    </section>
  );
}

const EYE_OFF =
  "M4 4l16 16M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1-.9 2.3-2 3.6M6.3 6.6C4.2 8 3.2 10 3 12c.5 2.5 4 7 9 7 1.6 0 3-.4 4.2-1";
const DOWNLOAD = "M12 4v12M6 11l6 6 6-6M5 20h14";
const OUT = "M7 17L17 7M9 7h8v8";
const LINK = "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={styles.icon}
    >
      <path d={d} />
    </svg>
  );
}
