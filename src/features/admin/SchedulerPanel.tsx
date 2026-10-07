"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Notice from "@/components/ui/Notice";
import Switch from "@/components/ui/Switch";
import { AdminTable } from "./adminList";
import { AdminPanel, AdminProblem, AdminSection } from "./adminPanels";
// Type-only imports of firebase-admin inside that module are erased at build
// time, so pulling the one bucket formatter into a client component is safe
// and keeps the panel and the receipt id speaking the same language.
import { formatBucketKey } from "@/lib/firestore/schedulerRuns";
import styles from "./SchedulerPanel.module.css";

/**
 * Admin view of the scheduler tick (`POST /api/scheduler/tick`).
 *
 * The observability bar this panel exists to clear: before the application
 * window opens, an admin must be able to answer "is the scheduler running",
 * "which jobs are on", "did anything throw" and "is a send stuck" from a
 * SURFACE rather than from server logs. Everything below is one of those four
 * questions.
 *
 * `schedulerRuns` and `schedulerMarkers` are shut to every client in
 * firestore.rules, so this reads through GET /api/admin/scheduler rather than
 * streaming Firestore the way the other admin tabs do. That also means no
 * live updates: there is a Refresh button, and the tick only fires every 15
 * minutes, so a listener would be showing a still frame anyway.
 */

type JobRow = {
  id: string;
  label: string;
  description: string;
  maxPerTick: number;
  maxLateHours: number;
  reclaimAfterMinutes: number;
  enabled: boolean;
  /** What no stored switch means for this job. False = it ships dark. */
  enabledByDefault: boolean;
  lastRunAt: string | null;
  lastProcessed: number;
  lastError: string | null;
  lastErrorAt: string | null;
};

type ReceiptJob = {
  id: string;
  processed: number;
  hasMore: boolean;
  durationMs: number;
  error: string | null;
  skipped: string | null;
};

type ReceiptRow = {
  id: string;
  bucket: string;
  depth: number;
  trigger: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  hasMore: boolean;
  rearmed: boolean;
  rearmNote: string | null;
  skipped: string | null;
  receiptCollision: boolean;
  jobs: ReceiptJob[];
};

type MarkerRow = {
  id: string;
  job: string;
  family: string | null;
  attempts: number;
  claimedAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  components: Record<string, string>;
};

type ServerState = {
  enabled: boolean;
  updatedAt: string | null;
  jobs: JobRow[];
  receipts: ReceiptRow[];
  failedMarkers: MarkerRow[];
};

/**
 * Every instant on this panel, in UTC and labelled UTC.
 *
 * The receipt bucket is floored in UTC and rendered as a UTC label by
 * `formatBucketKey`, and the external scheduler is armed on `Etc/UTC`. An
 * unlabelled local time next to those is not a smaller inconsistency than it
 * looks: for half the year London is an hour ahead, so a job that last ran in
 * the 08:45 bucket would read "09:47" beside it, and the obvious reading of
 * that pair is that the tick fired an hour late.
 *
 * So the whole panel speaks one clock. It is an admin debugging surface read
 * next to Cloud Logging and gcloud, both of which default to UTC too; the
 * places that show a member a time are elsewhere and keep local time.
 */
function formatWhen(iso: string | null): string {
  if (iso === null) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const rendered = date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${rendered} UTC`;
}

function receiptSummary(receipt: ReceiptRow): string {
  if (receipt.skipped === "disabled") return "scheduler off";
  if (receipt.skipped === "no-jobs") return "no jobs ran";
  if (receipt.jobs.length === 0) return "no jobs";
  return receipt.jobs
    .map((job) => {
      if (job.error !== null) return `${job.id}: error`;
      if (job.skipped !== null) return `${job.id}: ${job.skipped}`;
      return `${job.id}: ${job.processed}`;
    })
    .join(", ");
}

export default function SchedulerPanel() {
  const [state, setState] = useState<ServerState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  // The job whose Run now has been pressed once and not yet confirmed.
  const [asking, setAsking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scheduler", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        | (ServerState & { error?: string })
        | null;
      if (!res.ok || !body || !Array.isArray(body.jobs)) {
        setLoadError(body?.error ?? "Couldn't load the scheduler state.");
        return;
      }
      setState(body);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load the scheduler state.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // The async IIFE is not decoration: calling `load()` directly here trips
    // the cascading-render lint, because the effect would then own a
    // synchronous path into setState.
    void (async () => {
      await load();
    })();
  }, [load]);

  async function post(
    path: string,
    body: Record<string, unknown>,
    busyKey: string,
  ) {
    setBusy(busyKey);
    setActionError(null);
    setActionNote(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      if (!res.ok || data?.ok !== true) {
        setActionError(
          typeof data?.error === "string"
            ? data.error
            : "That didn't go through.",
        );
        return;
      }
      if (typeof data.note === "string") setActionNote(data.note);
      else if (typeof data.processed === "number") {
        setActionNote(`Ran ${busyKey}: ${data.processed} handled.`);
      }
      await load();
    } catch {
      setActionError("That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return (
      <AdminPanel title="Scheduled jobs">
        <p className={styles.empty}>Loading the scheduler state.</p>
      </AdminPanel>
    );
  }

  if (state === null) {
    return (
      <AdminPanel title="Scheduled jobs">
        <AdminProblem>{loadError ?? "Couldn't load the scheduler state."}</AdminProblem>
      </AdminPanel>
    );
  }

  const lastReceipt = state.receipts[0] ?? null;

  return (
    <div className={styles.stack}>
      <AdminPanel
        id="scheduled-jobs"
        title="Scheduled jobs"
        description="Reminders and announcements that run on their own. Every time here is UTC, the clock the timer and its receipts keep."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busy !== null}>
            Refresh
          </Button>
        }
      >
        {/* The one switch over every job. Stored as "enabled"; drawn as its
            opposite, a pause, so that off is the ordinary state of the
            control and on is the thing somebody did. */}
        <div className={styles.pause}>
          <Switch
            checked={!state.enabled}
            disabled={busy !== null}
            label="Pause all jobs"
            description="Stops every job until you switch it back."
            onChange={(paused) =>
              void post("/api/admin/scheduler/config", { enabled: !paused }, "global")
            }
          />
        </div>
        {!state.enabled && (
          <Notice tone="warning">
            Every job is paused. The timer still calls and still leaves a receipt, but no job
            runs. Nothing time-based is being sent.
          </Notice>
        )}

        <p className={styles.lastRun}>
          <span className="meta">Last tick</span>
          <span>
            {lastReceipt === null
              ? "none recorded yet"
              : `${formatBucketKey(lastReceipt.bucket)} (depth ${lastReceipt.depth}, ${lastReceipt.durationMs}ms)`}
          </span>
        </p>

        {actionError !== null && <AdminProblem>{actionError}</AdminProblem>}
        {actionNote !== null && (
          <p className={styles.note} role="status">
            {actionNote}
          </p>
        )}
        {loadError !== null && <AdminProblem>{loadError}</AdminProblem>}

        <ul className={styles.jobList}>
          {state.jobs.map((job) => (
            <li key={job.id} className={styles.jobRow}>
              <div className={styles.jobHead}>
                <div className={styles.jobMain}>
                  <h3 className={styles.jobName}>{job.label}</h3>
                  <p className={styles.jobDescription}>{job.description}</p>
                </div>
                <div className={styles.jobActions}>
                  <div className={styles.jobSwitch}>
                    <Switch
                      checked={job.enabled}
                      disabled={busy !== null}
                      label={
                        <>
                          <span className={styles.srOnly}>{job.label} is on</span>
                          <span
                            aria-hidden="true"
                            className={job.enabled ? `${styles.onWord} ${styles.onWordOn}` : styles.onWord}
                          >
                            {job.enabled ? "On" : "Off"}
                          </span>
                        </>
                      }
                      onChange={(next) =>
                        void post(
                          "/api/admin/scheduler/config",
                          { jobs: { [job.id]: { enabled: next } } },
                          job.id,
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={asking === job.id}
                    disabled={busy !== null || !state.enabled}
                    onClick={() => setAsking(asking === job.id ? null : job.id)}
                  >
                    Run now…
                  </Button>
                </div>
              </div>

              <p className={styles.lastRun}>
                <span className="meta">Last run</span>
                <span>{job.lastRunAt === null ? "Never" : formatWhen(job.lastRunAt)}</span>
                {job.lastError !== null ? (
                  <Chip tone="danger">Threw</Chip>
                ) : job.lastRunAt !== null ? (
                  <Chip tone="success">OK</Chip>
                ) : null}
              </p>
              <div className={styles.jobMeta}>
                <span className={styles.mono}>{job.id}</span>
                <span>Last handled: {job.lastProcessed}</span>
                <span>Cap: {job.maxPerTick} per tick</span>
                {job.maxLateHours > 0 && <span>Skips work over {job.maxLateHours}h late</span>}
              </div>

              {!job.enabled && !job.enabledByDefault && (
                <p className={styles.jobDescription}>
                  This job emails people, so it does not switch itself on when it deploys. Turn it
                  on here once you have watched a run on dev.
                </p>
              )}
              {job.lastError !== null && (
                <p className={styles.jobError}>
                  Threw at {formatWhen(job.lastErrorAt)}: {job.lastError}
                </p>
              )}

              {asking === job.id && (
                <div className={styles.ask}>
                  <p className={styles.askText}>
                    {job.enabled
                      ? "This runs the job once now, on top of the timer. It does what it says above, to whoever is due."
                      : "This job is off, but running it now still runs it once. It does what it says above, to whoever is due."}
                  </p>
                  <div className={styles.askActions}>
                    <Button variant="ghost" size="sm" onClick={() => setAsking(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy !== null || !state.enabled}
                      onClick={() => {
                        setAsking(null);
                        void post("/api/admin/scheduler/run", { jobId: job.id }, job.id);
                      }}
                    >
                      Run it now
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </AdminPanel>

      <p className={styles.footnote}>
        The site checks for jobs every 15 minutes. An outside timer makes the call, and each call
        runs the jobs above in order within one time budget; anything it does not finish is
        picked up by the next call, because every job works out what is due from live data and
        not from a queue. A send is marked before it goes, so a repeated call sends nothing twice.
      </p>

      <AdminPanel
        title="Stuck sends"
        description="A marker is claimed just before a send and stamped just after. One that never got its stamp is retried automatically a couple of times; after that it lands here and waits for you. Retry clears it so the next tick works the send out again from scratch."
      >
        {state.failedMarkers.length === 0 ? (
          <p className={styles.empty}>Nothing stuck. Every claimed send has been stamped.</p>
        ) : (
          <ul className={styles.markerList}>
            {state.failedMarkers.map((marker) => (
              <li key={marker.id} className={styles.markerRow}>
                <div className={styles.jobMain}>
                  <div className={styles.markerId}>{marker.id}</div>
                  <div className={styles.markerMeta}>
                    {marker.job || "unknown job"} &middot; {marker.attempts}{" "}
                    attempt{marker.attempts === 1 ? "" : "s"} &middot; gave up{" "}
                    {formatWhen(marker.failedAt)}
                    {marker.lastError !== null && <> &middot; {marker.lastError}</>}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void post(
                      "/api/admin/scheduler/run",
                      { markerId: marker.id },
                      marker.id,
                    )
                  }
                >
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminSection
        title="Recent ticks"
        description="One row for each call. A depth above 0 is the tick calling itself to carry on with work it ran out of time for."
      >
        {state.receipts.length === 0 ? (
          <p className={styles.empty}>
            No ticks recorded. If the external scheduler is armed, check that
            its key matches and that it is pointed at /api/scheduler/tick.
          </p>
        ) : (
          <AdminTable caption="Recent ticks" minWidth="44rem">
            <thead>
              <tr>
                <th scope="col">Bucket</th>
                <th scope="col">Depth</th>
                <th scope="col">Trigger</th>
                <th scope="col">Took</th>
                <th scope="col">Jobs</th>
                <th scope="col">More</th>
              </tr>
            </thead>
            <tbody>
              {state.receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className={styles.bucket}>{formatBucketKey(receipt.bucket)}</td>
                  <td>{receipt.depth}</td>
                  <td className={styles.nowrap}>{receipt.trigger}</td>
                  <td className={styles.nowrap}>
                    {receipt.finishedAt === null ? "did not finish" : `${receipt.durationMs}ms`}
                  </td>
                  <td>{receiptSummary(receipt)}</td>
                  <td>{receipt.hasMore ? (receipt.rearmNote ?? "yes") : "no"}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminSection>
    </div>
  );
}
