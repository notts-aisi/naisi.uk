"use client";

import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { AdminProblem, AdminStat, AdminStats } from "@/features/admin/adminPanels";
import { STATS_RANGES, type StatsRange } from "./useLinkStats";
import styles from "./links.module.css";

type Totals = { scans: number; signupsStarted: number; signupsConfirmed: number };

type Props = {
  range: StatsRange;
  onRange: (next: StatsRange) => void;
  totals: Totals;
  /** The same three numbers for each kind of link that has any. */
  byType: { label: string; totals: Totals }[];
  loading: boolean;
  error: Error | null;
  onExportTotals: () => void;
  onExportDaily: () => void;
};

/** What the scans card counts, and the period every number is for. */
const SCANS_LABEL: Record<StatsRange, string> = {
  "7": "scans this week",
  "30": "scans in 30 days",
  all: "scans so far",
};

export const PERIOD_WORDS: Record<StatsRange, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  all: "All time",
};

/**
 * The headline numbers for the chosen period, above the list.
 *
 * Cards and not a chart: three numbers are read faster as numbers. The split
 * by kind is a line of text under them for the same reason, since two values
 * do not need a picture.
 *
 * Two sign-up numbers and never one: somebody who types their address at the
 * stall is not subscribed until they press the button in an email, so the
 * second card is the people who started and the third the people who
 * finished.
 */
export function LinkStatsSummary({
  range,
  onRange,
  totals,
  byType,
  loading,
  error,
  onExportTotals,
  onExportDaily,
}: Props) {
  const shown = (n: number) => (loading ? "…" : n);
  return (
    <section className={styles.summary} aria-label="Scans and sign-ups">
      <div className={styles.summaryHead}>
        <SegmentedControl
          value={range}
          onChange={onRange}
          options={STATS_RANGES}
          ariaLabel="Period"
        />
        <div className={styles.summaryActions}>
          <Button size="sm" variant="secondary" onClick={onExportTotals} disabled={loading || !!error}>
            Export totals
          </Button>
          <Button size="sm" variant="secondary" onClick={onExportDaily} disabled={loading || !!error}>
            Export by day
          </Button>
        </div>
      </div>

      {error ? (
        <AdminProblem>Couldn&apos;t load the numbers: {error.message}</AdminProblem>
      ) : (
        <>
          <AdminStats label="Scans and sign-ups">
            <AdminStat
              value={shown(totals.scans)}
              label={SCANS_LABEL[range]}
              note={`${PERIOD_WORDS[range]}, every short link`}
            />
            <AdminStat
              value={shown(totals.signupsStarted)}
              label="sign-ups from short links"
              note={PERIOD_WORDS[range]}
            />
            <AdminStat
              value={shown(totals.signupsConfirmed)}
              label="of them confirmed"
              note="They clicked the link in our email"
            />
          </AdminStats>

          {!loading && byType.length > 1 && (
            <p className={styles.split}>
              {byType.map((kind, i) => (
                <span key={kind.label}>
                  {i > 0 && <span className={styles.gap}>·</span>}
                  {kind.label}: <strong>{kind.totals.scans}</strong>{" "}
                  {kind.totals.scans === 1 ? "scan" : "scans"}, <strong>{kind.totals.signupsStarted}</strong>{" "}
                  signed up
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}
