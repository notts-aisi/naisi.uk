"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { SEND_WORDS } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * Close a survey before its closing day, after a second press that says what
 * it does. Nobody is emailed.
 */
export default function CloseButton({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function close() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setError(result.error ?? "It couldn’t be closed. Try again in a minute.");
      else router.refresh();
    } catch {
      setError("It couldn’t be closed. Check your connection and try again.");
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <div className={styles.section}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {asking ? (
        <>
          <p className={styles.muted}>{SEND_WORDS.closeSure}</p>
          <div className={styles.buttons}>
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
              {SEND_WORDS.closeKeep}
            </Button>
            <Button variant="danger" onClick={close} disabled={busy}>
              {SEND_WORDS.closeConfirm}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setAsking(true)} disabled={!hydrated}>
          {SEND_WORDS.close}
        </Button>
      )}
    </div>
  );
}
