"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./surveyAdmin.module.css";

/**
 * "Download the answers, with names": a spreadsheet the site records as a
 * download before it hands it over (`dataExports`). A POST, so only this
 * press makes one.
 */
export default function ExportButton({ surveyId }: { surveyId: string }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/export`, { method: "POST" });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setError(result.error ?? "The download couldn’t be made. Try again in a minute.");
        return;
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "survey-answers.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The download couldn’t be made. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.section}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button variant="secondary" onClick={download} disabled={!hydrated || busy}>
        {busy ? "Preparing it…" : "Download the answers, with names"}
      </Button>
      <p className={styles.muted}>Each download is recorded. Delete your copy when you’re done.</p>
    </div>
  );
}
