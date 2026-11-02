"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { EXPLAINER_WORDS, REVIEW_EXPLAINER_WORDS } from "@/lib/courses/explainers/words";
import styles from "./explainers.module.css";

/**
 * "Cancel explainer", for an admin on a week's review: asked once more
 * before it goes, with what it does (its tasks close, it comes off the
 * session tickets, nobody is emailed), then the route, then the page drawn
 * again. Handed ids and words only.
 */

type Props = {
  roundId: string;
  programmeId: string;
  explainerId: string;
  /** Who explains, as the page names them, or null. */
  by: string | null;
  /** How many sessions, so how many tasks close. */
  tasks: number;
  /** The topic, for the press's own name. */
  topic: string;
};

export default function CancelExplainer({ roundId, programmeId, explainerId, by, tasks, topic }: Props) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function onCancel() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/explainers/${encodeURIComponent(explainerId)}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProblem(body?.error ?? EXPLAINER_WORDS.failed);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setProblem(EXPLAINER_WORDS.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className={styles.done} role="status">
        {REVIEW_EXPLAINER_WORDS.cancelled}
      </p>
    );
  }
  return (
    <div className={styles.itemActions}>
      {asking ? (
        <>
          <p className={styles.confirm}>{REVIEW_EXPLAINER_WORDS.confirm(by, tasks)}</p>
          <div className={styles.row}>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
              {REVIEW_EXPLAINER_WORDS.keep}
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => void onCancel()}>
              {REVIEW_EXPLAINER_WORDS.confirmYes}
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAsking(true)} aria-label={`${REVIEW_EXPLAINER_WORDS.cancel}: ${topic}`}>
          {REVIEW_EXPLAINER_WORDS.cancel}
        </Button>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
