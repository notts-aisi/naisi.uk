"use client";

import type { OwnExcusedRequest } from "@/lib/courses/excused/own";
import * as O from "@/lib/courses/excused/ownWords";
import styles from "./Excuse.module.css";

const date = (iso: string | null): Date | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
};

const TONE: Record<O.OwnWeekState, string> = {
  waiting: styles.chipWaiting,
  approved: styles.chipExcused,
  declined: styles.chipPlain,
  withdrawn: styles.chipPlain,
};

/**
 * "YOUR REQUESTS": the person's own requests to be excused on this programme,
 * newest first, one row per week with where it stands and who decided it
 * and when (by first name). Their own records only (`excusedFor`), and never
 * a count of how often they have been excused. Drawn nothing with none.
 */
export default function OwnRequests({ requests, className }: { requests: readonly OwnExcusedRequest[]; className?: string }) {
  const rows = requests.flatMap((request) =>
    request.weeks
      .filter((week): week is typeof week & { state: O.OwnWeekState } => week.state in O.OWN_STATE_WORDS)
      .map((week) => ({ request, week })),
  );
  if (rows.length === 0) return null;
  const now = new Date();
  return (
    <section className={[styles.card, className ?? ""].filter(Boolean).join(" ")} aria-labelledby="own-requests" data-testid="excuse-own-requests">
      <h2 id="own-requests" className={styles.cardTitle}>
        {O.YOUR_REQUESTS}
      </h2>
      <ul className={styles.ownRows} role="list">
        {rows.map(({ request, week }) => (
          <li key={`${request.id}-${week.sessionKey}`} className={styles.ownRow}>
            <div className={styles.ownBody}>
              <p className={styles.ownTitle}>{O.excusedForWords(week.weekNumber, week.occurrence)}</p>
              <p className={styles.small}>
                {O.ownRowLineWords({ state: week.state, by: week.by?.firstName ?? "", at: date(week.at), askedAt: date(request.askedAt), now })}
              </p>
            </div>
            <span className={`${styles.chip} ${TONE[week.state]}`}>{O.OWN_STATE_WORDS[week.state]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
