"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import styles from "./weekReview.module.css";

/**
 * "Ask Rahul to have a word with Grace", for an admin on a week's review
 * page: one task for the person's group's facilitators, with fixed words and
 * no reason, and an email to each of them whose task emails are on. The
 * request names the person alone; who it reaches is the server's to read.
 */

type Props = {
  roundId: string;
  programmeId: string;
  weekId: string;
  uid: string;
  label: string;
};

export default function FollowUpButton({ roundId, programmeId, weekId, uid, label }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function onAsk() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/weeks/${encodeURIComponent(weekId)}/review/follow-up`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid }) },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProblem(body?.error ?? REVIEW_WORDS.failed);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setProblem(REVIEW_WORDS.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className={styles.asked} role="status">
        {REVIEW_WORDS.askedNow}
      </p>
    );
  }
  return (
    <div className={styles.press}>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void onAsk()}>
        {label}
      </Button>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
