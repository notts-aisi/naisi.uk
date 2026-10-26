"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { OPEN_WORDS } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * "Open it", a leaving survey's one press (Q46): from then on it reaches each
 * person who leaves the programme. Nobody is emailed by it, so the button
 * names nobody it reaches. Disabled until the page's script has arrived.
 */
export default function OpenButton({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setError(result.error ?? OPEN_WORDS.failed);
      else router.refresh();
    } catch {
      setError(OPEN_WORDS.unreachable);
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
      <div className={styles.buttons}>
        <Button onClick={open} disabled={!hydrated || busy}>
          {busy ? OPEN_WORDS.opening : OPEN_WORDS.open}
        </Button>
      </div>
    </div>
  );
}
