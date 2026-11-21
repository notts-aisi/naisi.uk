"use client";

import Button from "@/components/ui/Button";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import styles from "./Requests.module.css";

/**
 * TWO BLOCKS ONE REQUEST'S PAGE DRAWS FOR ANY KIND THAT HAS THEM: who is
 * dealing with it, with "Take it", and its history, newest last. Each kind
 * hands its own words for a history line; the handling words are the
 * Requests page's own (`handlingWords`, `TAKE_IT`).
 */

export function HandlingBlock({
  title,
  handling,
  mine,
  canTake,
  busy,
  onTake,
}: {
  title: string;
  handling: { name: string } | null;
  mine: boolean;
  canTake: boolean;
  busy: boolean;
  onTake: () => void;
}) {
  return (
    <section className={styles.card} aria-labelledby="request-handling">
      <h2 id="request-handling" className={styles.cardTitle}>
        {title}
      </h2>
      <p className={styles.line}>{`${P.handlingWords(handling, mine)}.`}</p>
      {canTake && (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onTake} disabled={busy}>
            {P.TAKE_IT}
          </Button>
        </div>
      )}
    </section>
  );
}

export function HistoryBlock({ title, rows }: { title: string; rows: readonly { key: string; when: string; words: string }[] }) {
  return (
    <section className={styles.card} aria-labelledby="request-history">
      <h2 id="request-history" className={styles.cardTitle}>
        {title}
      </h2>
      <ol className={styles.history}>
        {rows.map((row) => (
          <li key={row.key} className={styles.historyRow}>
            <span className={styles.historyWhen}>{row.when}</span>
            <span>{row.words}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
