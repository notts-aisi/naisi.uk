"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import { getClientDb } from "@/lib/firebase/client";
import { useSiteNoticeState } from "./useSiteNotice";
import { formatEta } from "./SurfacePausedNotice";
import {
  MAINTENANCE_LOG_LIMIT,
  MAINTENANCE_LOG_PATH,
  SITE_NOTICE_SURFACES,
  SITE_NOTICE_SURFACE_NAMES,
  normaliseLogEntry,
  type MaintenanceLogEntry,
  type SiteNoticeLevel,
  type SiteNoticeSurface,
} from "@/lib/siteNotice";
import styles from "./StatusPage.module.css";

/**
 * Public availability dashboard + maintenance log at /status. The states
 * derive from the SAME live notice doc the banner streams (truthful even for
 * break-glass console flips); the log lists the episodes the admin route has
 * recorded, each expandable into a popup (the banner's Details link arrives
 * with ?open=current, which opens the ongoing episode's popup directly).
 *
 * Honesty rules: nothing reads as working before the feed has answered (the
 * summary says it is checking and no service carries a state), an erroring
 * feed shows a grey "Unknown", and all log content is PLAIN TEXT: the docs
 * are world-readable, so no HTML or markdown may ever be rendered from them.
 */

/** One plain line under each service's name: what a visitor does there. */
const SURFACE_NOTES: Record<SiteNoticeSurface, string> = {
  newRegistrations: "Making an account",
  collaboratorApplications: "Offering to collaborate with us on a project",
  eventSignups: "Requesting a place at an event",
  courseApplications: "Applying for a fellowship or the incubator",
  courseEnrolments: "Taking up a place on a course",
};

/** A notice's level decides a colour and nothing else. The word beside it
    always says what is going on. */
const LEVEL_TONE: Record<SiteNoticeLevel, ChipTone> = {
  info: "accent",
  warn: "warning",
  critical: "danger",
};

const LEVEL_CLASS: Record<SiteNoticeLevel, string> = {
  info: styles.toneInfo,
  warn: styles.toneWarn,
  critical: styles.toneCritical,
};

/** Text longer than this is cut short in the list and gets a "More info" popup. */
const CLAMP_THRESHOLD = 180;

/*
  Dates are written out by hand, in the reader's own time zone, so they read
  the same in every browser: a locale's own short month differs between
  engines ("Sep" in one, "Sept" in another).
*/
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (n: number) => String(n).padStart(2, "0");

/** "14:05" */
function formatTime(date: Date): string {
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "5 Oct, 14:05" */
function formatStamp(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${formatTime(date)}`;
}

/** "Mon 5 Oct" */
function formatDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** When something ended, said as briefly as the start allows: the time
    alone when it is the same day, the day as well when it is not. */
function formatEnd(start: Date, end: Date): string {
  return start.toDateString() === end.toDateString() ? formatTime(end) : formatStamp(end);
}

/**
 * Whether the list cuts this entry short, so it needs the popup to be read
 * in full. Short details are shown whole in the list and need no popup; the
 * list flattens line breaks, so details with any are always worth opening.
 */
function entryNeedsPopup(entry: MaintenanceLogEntry): boolean {
  return (
    entry.message.length > CLAMP_THRESHOLD ||
    entry.details.length > CLAMP_THRESHOLD ||
    entry.details.includes("\n")
  );
}

function EntryStatusChip({ entry, ongoing }: { entry: MaintenanceLogEntry; ongoing: boolean }) {
  return ongoing ? (
    <Chip tone={LEVEL_TONE[entry.level]} dot>
      In progress
    </Chip>
  ) : (
    <Chip>Resolved</Chip>
  );
}

function EntryModal({
  entry,
  ongoing,
  onClose,
}: {
  entry: MaintenanceLogEntry;
  ongoing: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const endedAt = entry.clearedAt ?? entry.endsAt;
  const affected = SITE_NOTICE_SURFACES.filter((s) => entry.paused[s]);

  // Portalled to <body>. The public layout's <main> carries a transform, and
  // a fixed box inside a transformed element is pinned to that element and
  // not to the window: left where it is, this would sit in the middle of the
  // page's whole height. It only ever mounts in the browser, after a press
  // or a snapshot, so the document is there.
  return createPortal(
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Maintenance notice details"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Back to the status page"
          autoFocus
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className={styles.modalHead}>
          <EntryStatusChip entry={entry} ongoing={ongoing} />
        </div>
        <p className={styles.modalWhen}>
          Started {formatStamp(entry.startedAt)}
          {ongoing
            ? entry.endsAt !== null
              ? ` · provisional ETA ${formatEta(entry.endsAt)}`
              : " · no ETA yet"
            : endedAt !== null
              ? ` · resolved ${formatStamp(endedAt)}`
              : ""}
        </p>
        <p className={styles.modalMessage}>{entry.message || "Maintenance notice."}</p>
        {entry.details !== "" && (
          <p className={styles.modalDetails}>{entry.details}</p>
        )}
        {affected.length > 0 && (
          <p className={styles.entryMeta}>
            Paused during this work:{" "}
            {affected.map((s) => SITE_NOTICE_SURFACE_NAMES[s]).join(", ")}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function StatusPage() {
  const { notice: live, connection } = useSiteNoticeState();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<MaintenanceLogEntry[]>([]);
  const [logState, setLogState] = useState<"loading" | "ready" | "error">("loading");
  // null = closed; "pending-auto" = waiting for the log to answer a
  // ?open=current deep link (resolved render-phase, per the Dropdown pattern).
  const [openEntryId, setOpenEntryId] = useState<string | null | "pending-auto">(
    searchParams.get("open") === "current" ? "pending-auto" : null,
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    // Same honesty rule as the notice feed: cache-only data never claims
    // "ready", and a quiet offline client degrades to error after 4s.
    const staleTimer = setTimeout(() => {
      setLogState((current) => (current === "ready" ? current : "error"));
    }, 4000);
    try {
      const db = getClientDb();
      const q = query(
        collection(db, MAINTENANCE_LOG_PATH.collection),
        orderBy("startedAt", "desc"),
        limit(MAINTENANCE_LOG_LIMIT),
      );
      unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const now = new Date();
          setEntries(
            snap.docs
              .map((doc) => normaliseLogEntry(doc.id, doc.data(), now))
              .filter((entry): entry is MaintenanceLogEntry => entry !== null),
          );
          if (!snap.metadata.fromCache) setLogState("ready");
        },
        () => {
          // Fail open: no history beats fabricated history.
          setEntries([]);
          setLogState("error");
        },
      );
    } catch {
      queueMicrotask(() => setLogState("error"));
    }
    return () => {
      clearTimeout(staleTimer);
      unsubscribe?.();
    };
  }, []);

  // Live chips/countdowns: the current episode is identified POSITIVELY by
  // the live doc's logId, never positionally, and only while the notice
  // actually shows. A break-glass notice with no entry means no entry claims
  // ongoing (the log's own caveat covers that); a log entry must never claim
  // an outage the banner doesn't.
  const ongoingId =
    connection === "live" &&
    live.bannerVisible &&
    live.logId !== null &&
    entries.some((entry) => entry.id === live.logId && entry.ongoing)
      ? live.logId
      : null;

  // Resolve a ?open=current deep link once the log has answered.
  if (openEntryId === "pending-auto" && logState !== "loading") {
    setOpenEntryId(logState === "ready" && ongoingId !== null ? ongoingId : null);
  }

  const openEntry =
    typeof openEntryId === "string" && openEntryId !== "pending-auto"
      ? entries.find((entry) => entry.id === openEntryId) ?? null
      : null;

  function closeModal() {
    setOpenEntryId(null);
    // Drop the ?open=current param so a refresh doesn't re-open the popup.
    if (searchParams.get("open") !== null) {
      window.history.replaceState(null, "", "/status#log");
    }
  }

  const eta = live.endsAt ?? live.expiresAt;
  const noticeShowing = connection === "live" && live.bannerVisible;

  return (
    <div className={styles.page}>
      <header>
        <p className="meta">naisi.uk</p>
        <h1 className={styles.title}>Service status</h1>
        <p className={styles.lede}>
          Whether each part of naisi.uk is working right now.
        </p>
      </header>

      {/* The summary. One of four things, and never "working" before the
          feed has answered: a premature green is a claim nobody has made. */}
      {connection === "loading" ? (
        <div className={`${styles.overall} ${styles.toneQuiet}`} role="status">
          <span className={styles.spinner} aria-hidden />
          <p className={styles.overallNote}>Checking current status…</p>
        </div>
      ) : connection === "error" ? (
        <section className={`${styles.overall} ${styles.toneQuiet}`} aria-labelledby="status-overall">
          <span className={styles.overallDot} aria-hidden />
          <div className={styles.overallText}>
            <h2 id="status-overall" className={styles.overallTitle}>
              Status unknown
            </h2>
            <p className={styles.overallNote}>
              We can’t reach the status feed right now. Check your connection
              and try again.
            </p>
          </div>
        </section>
      ) : noticeShowing ? (
        <section
          className={`${styles.overall} ${LEVEL_CLASS[live.level]}`}
          aria-labelledby="status-overall"
        >
          <span className={styles.overallDot} aria-hidden />
          <div className={styles.overallText}>
            <h2 id="status-overall" className={`${styles.overallTitle} ${styles.overallMessage}`}>
              {live.bannerMessage}
            </h2>
            <p className={styles.overallNote}>
              {eta !== null
                ? `Estimated resolution by ${formatEta(eta)}.`
                : "No estimated resolution time yet."}
            </p>
          </div>
        </section>
      ) : (
        <section className={`${styles.overall} ${styles.toneOk}`} aria-labelledby="status-overall">
          <span className={styles.overallDot} aria-hidden />
          <div className={styles.overallText}>
            <h2 id="status-overall" className={styles.overallTitle}>
              All systems working
            </h2>
            <p className={styles.overallNote}>Everything on naisi.uk is up.</p>
          </div>
        </section>
      )}

      <section className={styles.block} aria-labelledby="services-heading">
        <h2 id="services-heading" className={styles.sectionTitle}>
          Services
        </h2>
        <ul className={styles.serviceList}>
          {SITE_NOTICE_SURFACES.map((surface) => {
            const paused = live.paused[surface];
            return (
              <li key={surface} className={styles.serviceRow}>
                <div className={styles.serviceText}>
                  <p className={styles.serviceName}>{SITE_NOTICE_SURFACE_NAMES[surface]}</p>
                  <p className={styles.serviceNote}>{SURFACE_NOTES[surface]}</p>
                </div>
                {/* No state at all while the feed is still answering. */}
                {connection === "loading" ? null : connection === "error" ? (
                  <Chip>Unknown</Chip>
                ) : paused ? (
                  <Chip tone={live.level === "critical" ? "danger" : "warning"} dot>
                    Paused
                  </Chip>
                ) : (
                  <Chip tone="success" dot>
                    Working
                  </Chip>
                )}
              </li>
            );
          })}
        </ul>
        <p className={styles.smallPrint}>
          Signing in and resetting a password stay available during
          maintenance.
        </p>
      </section>

      <section id="log" className={styles.block} aria-labelledby="log-heading">
        <h2 id="log-heading" className={styles.sectionTitle}>
          Maintenance log
        </h2>

        {logState === "loading" ? (
          <div className={styles.loadingRow} role="status">
            <span className={styles.spinner} aria-hidden />
            Loading history…
          </div>
        ) : logState === "error" ? (
          <p className={styles.smallPrint}>
            Couldn’t load the maintenance log right now.
          </p>
        ) : entries.length === 0 ? (
          <p className={styles.smallPrint}>
            No maintenance events on record. If a banner is showing with no
            entry here, the banner is the one to trust.
          </p>
        ) : (
          <ul className={styles.entryList}>
            {entries.map((entry) => {
              const isOngoing = entry.id === ongoingId;
              const endedAt = entry.clearedAt ?? entry.endsAt;
              const affected = SITE_NOTICE_SURFACES.filter((s) => entry.paused[s]);
              const needsPopup = entryNeedsPopup(entry);
              return (
                <li key={entry.id} id={`log-${entry.id}`} className={styles.entry}>
                  <time className={styles.entryDay} dateTime={entry.startedAt.toISOString()}>
                    {formatDay(entry.startedAt)}
                  </time>
                  <div className={styles.entryMain}>
                    <div className={styles.entryHead}>
                      {/* Neutral fallback: "scheduled" would misdescribe an
                          unplanned incident logged without copy. */}
                      <h3
                        className={
                          needsPopup ? `${styles.entryMessage} ${styles.clamped}` : styles.entryMessage
                        }
                      >
                        {entry.message || "Maintenance notice."}
                      </h3>
                      <EntryStatusChip entry={entry} ongoing={isOngoing} />
                    </div>
                    {/* A long entry is cut to a few lines here; the popup
                        has the rest. A short one is shown whole, at any
                        width, because nothing else would show it. */}
                    {entry.details !== "" && (
                      <p
                        className={
                          needsPopup
                            ? `${styles.entryDetailsPreview} ${styles.clamped}`
                            : styles.entryDetailsPreview
                        }
                      >
                        {entry.details}
                      </p>
                    )}
                    <p className={styles.entryMeta}>
                      {formatStamp(entry.startedAt)}
                      {isOngoing
                        ? entry.endsAt !== null && ` · ETA ${formatEta(entry.endsAt)}`
                        : endedAt !== null && ` to ${formatEnd(entry.startedAt, endedAt)}`}
                      {affected.length > 0 &&
                        ` · Paused: ${affected.map((s) => SITE_NOTICE_SURFACE_NAMES[s]).join(", ")}`}
                    </p>
                    {needsPopup && (
                      <button
                        type="button"
                        className={styles.moreButton}
                        onClick={() => setOpenEntryId(entry.id)}
                      >
                        More info
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {openEntry !== null && (
        <EntryModal
          entry={openEntry}
          ongoing={openEntry.id === ongoingId}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
