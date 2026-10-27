"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import {
  ADD_TO_CALENDAR,
  APPLE_CALENDAR,
  CALENDAR_NOTE,
  CALENDAR_TITLE,
  CLOSE,
  COPY_BY_HAND,
  COPY_THE_LINK,
  GETTING_LINK,
  GETTING_NEW_LINK,
  GOOGLE_CALENDAR,
  KEEP_THIS_LINK,
  LINK_COPIED,
  LINK_FAILED,
  NEW_LINK,
  NEW_LINK_DONE,
  NEW_LINK_WARNING,
  OUTLOOK,
  TRY_AGAIN,
  YOUR_LINK,
} from "@/lib/courses/calendarWords";
import styles from "./weekly.module.css";

/**
 * "ADD TO CALENDAR" AND ITS DIALOG (board st-calendar-phone; the button on
 * the session tickets of st-programme, wk-programme and wk-home-phone).
 *
 * The button opens a real dialog (the house Modal, as a sheet at phone
 * width): focus moves into it, Escape and Close shut it, focus goes back to
 * the button, and every target in it is at least 44px. Opening it asks the
 * link route for the person's own link (`POST /api/courses/calendar`), which
 * is made the first time and the same every time after, and for the line
 * counting their sessions, worked out from the calendar the link fills.
 *
 * Each of the four buttons SUBSCRIBES, never imports: Apple Calendar opens the
 * link's `webcal:` address, Google Calendar and Outlook their own ways to add
 * a calendar from a link, and Copy the link copies it (or, where the browser
 * will not copy, shows it to copy by hand). "Get a new link" replaces it, after
 * a warning that the old one stops working; the board does not draw that
 * control, and its words are listed for the boards' designers.
 *
 * Disabled until the page has hydrated, as every control that needs its
 * script is.
 */

/** What the link route answers: where the four buttons go, and the line. */
export type CalendarLinkAnswer = { url: string; apple: string; google: string; outlook: string; line: string };

/** What the dialog is showing. */
export type CalendarDialogView =
  | { kind: "idle" }
  | { kind: "loading"; action: "open" | "replace" }
  | { kind: "ready"; link: CalendarLinkAnswer; renewed: boolean }
  | { kind: "failed"; message: string; action: "open" | "replace" };

function isLinkAnswer(value: unknown): value is CalendarLinkAnswer {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["url", "apple", "google", "outlook", "line"].every((key) => typeof v[key] === "string" && v[key] !== "");
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

type BodyProps = {
  view: CalendarDialogView;
  /** "Get a new link" pressed, and its warning showing. */
  confirming: boolean;
  /** Whether Copy the link copied, or the link is shown to copy by hand. */
  copied: "no" | "yes" | "by-hand";
  onClose: () => void;
  onRetry: (action: "open" | "replace") => void;
  onCopy: (url: string) => void;
  onStartReplacing: () => void;
  onKeep: () => void;
  onReplace: () => void;
  /** Where focus is put back after the dialog's own content changes: "Keep this one". */
  keepRef?: RefObject<HTMLButtonElement | null>;
  /** "Get a new link". */
  newLinkRef?: RefObject<HTMLButtonElement | null>;
  /** The line that says a new link was made. */
  renewedRef?: RefObject<HTMLParagraphElement | null>;
  /** The box the link is shown in to copy by hand. */
  byHandRef?: RefObject<HTMLInputElement | null>;
};

/**
 * THE DIALOG'S CONTENT, from what it is showing: the board's heading and
 * Close, the line counting the sessions (from the link route, so from
 * records), the four buttons, the board's note, and "Get a new link". Pure, so
 * a suite can read every state of it.
 */
export function CalendarDialogBody({
  view,
  confirming,
  copied,
  onClose,
  onRetry,
  onCopy,
  onStartReplacing,
  onKeep,
  onReplace,
  keepRef,
  newLinkRef,
  renewedRef,
  byHandRef,
}: BodyProps) {
  return (
    <div className={styles.calendarDialog}>
      <div className={styles.calendarGrabber} aria-hidden="true" />
      <div className={styles.calendarHead}>
        <h2 className={styles.calendarTitle}>{CALENDAR_TITLE}</h2>
        <button type="button" className={styles.calendarClose} aria-label={CLOSE} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {(view.kind === "idle" || view.kind === "loading") && (
        <p className={styles.calendarLine} role="status">
          {view.kind === "loading" && view.action === "replace" ? GETTING_NEW_LINK : GETTING_LINK}
        </p>
      )}

      {view.kind === "failed" && (
        <>
          <p className={styles.calendarLine} role="alert">
            {view.message}
          </p>
          <div className={styles.calendarActions}>
            <button type="button" className={styles.calendarAction} onClick={() => onRetry(view.action)}>
              {TRY_AGAIN}
            </button>
          </div>
        </>
      )}

      {view.kind === "ready" && (
        <>
          <p className={styles.calendarLine}>{view.link.line}</p>
          {view.renewed && (
            <p ref={renewedRef} className={styles.calendarRenewed} role="status" tabIndex={-1}>
              {NEW_LINK_DONE}
            </p>
          )}
          <div className={styles.calendarActions}>
            <a className={styles.calendarAction} href={view.link.apple}>
              {APPLE_CALENDAR}
            </a>
            <a className={styles.calendarAction} href={view.link.google} target="_blank" rel="noopener noreferrer">
              {GOOGLE_CALENDAR}
            </a>
            <a className={styles.calendarAction} href={view.link.outlook} target="_blank" rel="noopener noreferrer">
              {OUTLOOK}
            </a>
            <button type="button" className={styles.calendarCopy} onClick={() => onCopy(view.link.url)}>
              <LinkIcon />
              <span>{copied === "yes" ? LINK_COPIED : COPY_THE_LINK}</span>
            </button>
          </div>
          {copied === "by-hand" && (
            <label className={styles.calendarByHand}>
              <span>{COPY_BY_HAND}</span>
              <input
                ref={byHandRef}
                className={styles.calendarByHandInput}
                type="text"
                readOnly
                value={view.link.url}
                aria-label={YOUR_LINK}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
          <p className={styles.calendarNote}>{CALENDAR_NOTE}</p>
          {confirming ? (
            <div className={styles.calendarConfirm}>
              <p className={styles.calendarConfirmLine}>{NEW_LINK_WARNING}</p>
              <div className={styles.calendarConfirmButtons}>
                <button type="button" className={styles.calendarAction} onClick={onReplace}>
                  {NEW_LINK}
                </button>
                <button ref={keepRef} type="button" className={styles.calendarCopy} onClick={onKeep}>
                  {KEEP_THIS_LINK}
                </button>
              </div>
            </div>
          ) : (
            <button ref={newLinkRef} type="button" className={styles.calendarQuiet} onClick={onStartReplacing}>
              {NEW_LINK}
            </button>
          )}
        </>
      )}

      <p className={styles.srOnly} aria-live="polite">
        {copied === "yes" ? LINK_COPIED : ""}
      </p>
    </div>
  );
}

type Props = {
  /** Home's ticket: the button fills the row under the card, with no icon, as wk-home-phone draws it. */
  home?: boolean;
};

export default function AddToCalendar({ home = false }: Props) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CalendarDialogView>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<"no" | "yes" | "by-hand">("no");
  // Only the latest request may change what the dialog says.
  const latest = useRef(0);
  const keepRef = useRef<HTMLButtonElement>(null);
  const newLinkRef = useRef<HTMLButtonElement>(null);
  const renewedRef = useRef<HTMLParagraphElement>(null);
  const byHandRef = useRef<HTMLInputElement>(null);
  // Where focus goes once the dialog's own content has changed under it.
  const focusNext = useRef<"keep" | "new-link" | "renewed" | "by-hand" | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const element =
      target === "keep"
        ? keepRef.current
        : target === "new-link"
          ? newLinkRef.current
          : target === "renewed"
            ? renewedRef.current
            : byHandRef.current;
    element?.focus();
    if (target === "by-hand") byHandRef.current?.select();
  });

  async function ask(action: "open" | "replace") {
    latest.current += 1;
    const mine = latest.current;
    setView({ kind: "loading", action });
    setCopied("no");
    try {
      const res = await fetch("/api/courses/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (mine !== latest.current) return;
      if (res.ok && isLinkAnswer(body)) {
        if (action === "replace") focusNext.current = "renewed";
        setView({ kind: "ready", link: body, renewed: action === "replace" });
        return;
      }
      const said = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
      setView({ kind: "failed", message: typeof said === "string" && said ? said : LINK_FAILED, action });
    } catch {
      if (mine !== latest.current) return;
      setView({ kind: "failed", message: LINK_FAILED, action });
    }
  }

  function openDialog() {
    setOpen(true);
    setConfirming(false);
    void ask("open");
  }

  function close() {
    latest.current += 1;
    setOpen(false);
    setConfirming(false);
  }

  async function copy(url: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("No clipboard");
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      focusNext.current = "by-hand";
      setCopied("by-hand");
    }
  }

  return (
    <>
      <button
        type="button"
        className={home ? `${styles.calendarButton} ${styles.calendarButtonHome}` : styles.calendarButton}
        onClick={openDialog}
        disabled={!hydrated}
        aria-haspopup="dialog"
      >
        {!home && <CalendarIcon />}
        <span>{ADD_TO_CALENDAR}</span>
      </button>
      <Modal open={open} onClose={close} ariaLabel={CALENDAR_TITLE} width="sm" sheet>
        {(dismiss) => (
          <CalendarDialogBody
            view={view}
            confirming={confirming}
            copied={copied}
            onClose={dismiss}
            onRetry={(action) => void ask(action)}
            onCopy={(url) => void copy(url)}
            onStartReplacing={() => {
              focusNext.current = "keep";
              setConfirming(true);
            }}
            onKeep={() => {
              focusNext.current = "new-link";
              setConfirming(false);
            }}
            onReplace={() => {
              setConfirming(false);
              void ask("replace");
            }}
            keepRef={keepRef}
            newLinkRef={newLinkRef}
            renewedRef={renewedRef}
            byHandRef={byHandRef}
          />
        )}
      </Modal>
    </>
  );
}
