"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { KAIROS_FILE_WORDS } from "@/lib/kairos/words";
import styles from "./kairos.module.css";

/**
 * "Download the Kairos file": a spreadsheet the site records as a download
 * before it hands it over (`dataExports`, kind `kairos`). A POST, so only
 * this press makes one, and every press is recorded.
 */
export default function KairosFileButton({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/kairos/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, programmeId }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setError(result.error ?? KAIROS_FILE_WORDS.failed);
        return;
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "kairos.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(KAIROS_FILE_WORDS.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.fileButton}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button variant="secondary" onClick={download} disabled={!hydrated || busy}>
        {busy ? KAIROS_FILE_WORDS.preparing : KAIROS_FILE_WORDS.download}
      </Button>
      <p className={styles.muted}>{KAIROS_FILE_WORDS.recorded}</p>
    </div>
  );
}
