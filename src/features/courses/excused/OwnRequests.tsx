"use client";

import type { OwnExcusedRequest } from "@/lib/courses/excused/own";
import * as O from "@/lib/courses/excused/ownWords";
import type { OwnVisitRow } from "@/lib/courses/visitRequest/own";
import { ROW_CHIP, type OwnVisitRowState } from "@/lib/courses/visitRequest/words";
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

const VISIT_TONE: Record<OwnVisitRowState, string> = {
  waiting: styles.chipWaiting,
  approved: styles.chipExcused,
  declined: styles.chipPlain,
  withdrawn: styles.chipPlain,
  closed: styles.chipPlain,
};

/**
 * "YOUR REQUESTS": the person's own requests on this programme, one list,
 * newest first: to be excused, one row per week with where it stands and who
 * decided it and when (by first name), and to go to another group's session
 * for a week, one row each ("Group I for week 2"), and to change group for
 * good, one row each ("Move to Group I"), with a reply under it when there is
 * one. Their own records only (`excusedFor`, `anotherSessionFor`),
 * and never a count of how often they have been excused. Drawn nothing with
 * none.
 */
export default function OwnRequests({
  requests,
  visitRequests = [],
  moveRequests = [],
  className,
}: {
  requests: readonly OwnExcusedRequest[];
  visitRequests?: readonly OwnVisitRow[];
  /** Their requests to change group for good, in the same shape (`ownMoveRowsOf`). */
  moveRequests?: readonly OwnVisitRow[];
  className?: string;
}) {
  const excusedRows = requests.flatMap((request) =>
    request.weeks
      .filter((week): week is typeof week & { state: O.OwnWeekState } => week.state in O.OWN_STATE_WORDS)
      .map((week) => ({ kind: "excused" as const, at: request.askedAt ?? "", request, week })),
  );
  const visitRows = visitRequests.map((row) => ({ kind: "visit" as const, at: row.askedAt ?? "", row }));
  const moveRows = moveRequests.map((row) => ({ kind: "move" as const, at: row.askedAt ?? "", row }));
  // Newest first across every kind; a request's own weeks keep their order.
  const rows = [...excusedRows, ...visitRows, ...moveRows].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return null;
  const now = new Date();
  return (
    <section className={[styles.card, className ?? ""].filter(Boolean).join(" ")} aria-labelledby="own-requests" data-testid="excuse-own-requests">
      <h2 id="own-requests" className={styles.cardTitle}>
        {O.YOUR_REQUESTS}
      </h2>
      <ul className={styles.ownRows} role="list">
        {rows.map((each) =>
          each.kind === "visit" || each.kind === "move" ? (
            <li key={each.row.id} className={styles.ownRow} data-kind={each.kind}>
              <div className={styles.ownBody}>
                <p className={styles.ownTitle}>{each.row.title}</p>
                <p className={styles.small}>{each.row.line}</p>
                {each.row.reply && <p className={styles.small}>{each.row.reply}</p>}
              </div>
              <span className={`${styles.chip} ${VISIT_TONE[each.row.state]}`}>{ROW_CHIP[each.row.state]}</span>
            </li>
          ) : (
            <li key={`${each.request.id}-${each.week.sessionKey}`} className={styles.ownRow}>
              <div className={styles.ownBody}>
                <p className={styles.ownTitle}>{O.excusedForWords(each.week.weekNumber, each.week.occurrence)}</p>
                <p className={styles.small}>
                  {O.ownRowLineWords({ state: each.week.state, by: each.week.by?.firstName ?? "", at: date(each.week.at), askedAt: date(each.request.askedAt), now })}
                </p>
              </div>
              <span className={`${styles.chip} ${TONE[each.week.state]}`}>{O.OWN_STATE_WORDS[each.week.state]}</span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
