"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import styles from "./weekReview.module.css";

/**
 * "Review with Claude" (or one part again), for an admin on a week's review
 * page. It sends what the page says would be sent and nothing else: the
 * press carries the hash of the messages the page was drawn from (`seen`),
 * and the route refuses it if they have changed since. Then the page is drawn
 * again on the server, with what came back.
 *
 * Data only from the page: the programme's ids, the week's id, the hash and
 * which part. Nothing about anybody.
 */

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  seen: string;
  /** One part again, or every part with something to send. */
  part?: "grades" | "themes" | "hands";
  label: string;
  primary?: boolean;
};

export default function ReviewPress({ roundId, programmeId, weekId, seen, part, label, primary = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function onPress() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/weeks/${encodeURIComponent(weekId)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(part ? { seen, part } : { seen }),
        },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProblem(body?.error ?? REVIEW_WORDS.failed);
        if (res.status === 409) router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setProblem(REVIEW_WORDS.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.press}>
      <Button type="button" variant={primary ? "primary" : "secondary"} disabled={busy} onClick={() => void onPress()}>
        {busy ? REVIEW_WORDS.asking : label}
      </Button>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
