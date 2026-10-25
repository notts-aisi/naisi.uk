"use client";

import { useState } from "react";
import styles from "./ProgrammeAttendance.module.css";

/**
 * "Download CSV" on a programme's Attendance tab: every register of the run
 * the programme names, as a spreadsheet.
 *
 * A POST, not a link, for the reason the worksheet export gives: the route
 * writes the export log's row before it hands the file over, and a GET is
 * prefetched, retried and unfurled, which would write rows for downloads
 * nobody asked for. The body arrives as a blob and this makes the download.
 * The file's name is the server's (the one written in the log), read out of
 * `Content-Disposition`; the one built here is for a proxy that dropped it.
 */

function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // A malformed escape is not worth failing a download over.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

function fallbackName(programmeName: string): string {
  const slug = programmeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `attendance-${slug || "programme"}.csv`;
}

export default function AttendanceCsvButton({
  roundId,
  programmeId,
  programmeName,
}: {
  roundId: string;
  programmeId: string;
  programmeName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/attendance/export`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "The CSV couldn’t be made. Try again.");
      }
      const filename = filenameFrom(res.headers.get("Content-Disposition")) ?? fallbackName(programmeName);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The CSV couldn’t be made. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.download}>
      <button type="button" className={styles.downloadButton} onClick={() => void download()} disabled={busy}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v11M7 10l5 5 5-5M5 19h14" />
        </svg>
        {busy ? "Downloading…" : "Download CSV"}
      </button>
      {error && (
        <span className={styles.problem} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
