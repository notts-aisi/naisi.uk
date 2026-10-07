"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import MemberText from "@/components/ui/MemberText";
import ResponsiveSelect, {
  type ResponsiveSelectOption,
} from "@/components/ui/ResponsiveSelect";
import SegmentedControl, { type SegmentedOption } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Input";
import {
  ALL_MEMBERSHIP_TIERS,
  MEMBERSHIP_TIER_LABELS,
  type MembershipTier,
} from "@/lib/firestore/memberships";
import type {
  ImportBatchPayload,
  ImportRowPayload,
} from "@/lib/firestore/membershipImports";
import styles from "./ImportPanel.module.css";

/**
 * The SU list, in three steps: upload it, check the matches, confirm.
 *
 * ## Reading the file records nothing
 *
 * The upload is a DRY RUN. It writes the batch and its rows and reports what
 * matched, and grants nothing. Recording is a later, explicit press, on the
 * last step. A mis-read column then costs an abandoned batch instead of
 * hundreds of wrong memberships, and an admin can see the shape of the file
 * before believing it.
 *
 * The three steps are this panel's own way of showing that: the server knows
 * a dry run and a commit, and which step is on screen is decided here.
 *
 * ## Name matches are confirmed one at a time
 *
 * A row matched on name alone will not commit until its tick is on. Two
 * students share a name often enough that this is a real risk, not a
 * hypothetical one, and the server refuses an unconfirmed name row whatever
 * this panel sends. The confirmation is recorded on the row with the name of
 * whoever gave it.
 *
 * ## An import outlives the tab it was started in
 *
 * The batch id used to live only in this component's state, so a reload
 * between the dry run and the commit orphaned the import: the rows were in
 * Firestore and nothing on the site could find them again. The panel now asks
 * the server on mount which imports on this period are unfinished and offers
 * to resume any of them, or to abandon one. Abandoning is a label: it deletes
 * no rows and takes back no membership already committed.
 *
 * ## The confirm list is every page, not the first one
 *
 * The rows GET is paged. Reading one page and stopping meant that on a file
 * with more than two hundred pending rows the name matches past the first page
 * were invisible, so nobody could tick them and the import could never finish.
 * `refresh` follows the cursor to the end.
 *
 * ## The commit is chunked, and the panel keeps pressing
 *
 * Each call commits up to two hundred people and reports what is left, so a
 * six hundred row list is three calls. The loop stops when the server says
 * nothing is remaining, when nothing moved (which means every remaining row is
 * waiting on a confirmation), or when a call fails.
 */

type CommitResponse = {
  committed: number;
  skipped: number;
  failed: number;
  remaining: number;
  awaitingConfirm: number;
  status: string;
  totalsMoved?: boolean;
  results?: { rowId: string; action: string; reason: string }[];
  error?: string;
};

type Receipt = {
  total: number;
  uniEmail: number;
  personalEmail: number;
  needsConfirm: number;
  duplicate: number;
  unmatched: number;
  autoCommittable: number;
  byTier: Record<MembershipTier, number>;
};

type UploadResponse = {
  batchId: string;
  receipt: Receipt;
  accountsScanned: number;
  rows: ImportRowPayload[];
  rowsTruncated: boolean;
  error?: string;
};

/** What an admin has said about one name match: the same person, or not them.
 *  Nothing yet is "". Only "same" is sent to the server, as a confirmation. */
type NameChoice = "same" | "not" | "";

const NAME_CHOICES: readonly SegmentedOption<NameChoice>[] = [
  { value: "same", label: "Same person" },
  { value: "not", label: "Not them" },
];

/** Pages of rows followed while the confirm list is rebuilt. Two hundred rows
 *  a page against a five thousand row cap, so this reaches the end of the
 *  longest file the upload will accept. */
const ROW_PAGES = 30;

export default function ImportPanel({
  periodId,
  periodLabel,
  accountByUid,
  onCommitted,
}: {
  periodId: string;
  periodLabel: string;
  /** The accounts the page has already loaded, to say who a name match landed on. */
  accountByUid: ReadonlyMap<string, { name: string; email: string }>;
  onCommitted: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [defaultTier, setDefaultTier] = useState<MembershipTier>("paid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  /** Name matches somebody has looked at and said are NOT the same person.
   *  Kept only so the panel can say how many are left to look at. */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  /** True once "Next: Confirm" is pressed: the last step is on screen. */
  const [confirming, setConfirming] = useState(false);
  /** True once this panel has recorded the matches that need nobody to look
   *  at them, so a second pass counts only the name matches ticked since. */
  const [autoRecorded, setAutoRecorded] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [totalsStale, setTotalsStale] = useState(false);
  const [batch, setBatch] = useState<ImportBatchPayload | null>(null);
  const [rows, setRows] = useState<ImportRowPayload[]>([]);
  /** The import being worked on, from a dry run or from a resume. */
  const [batchId, setBatchId] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<ImportBatchPayload[]>([]);

  function reset() {
    setUpload(null);
    setBatch(null);
    setBatchId(null);
    setRows([]);
    setConfirmed(new Set());
    setDismissed(new Set());
    setConfirming(false);
    setAutoRecorded(false);
    setProgress(null);
    setTotalsStale(false);
    setError(null);
  }

  /**
   * The imports on this period that are still open. Called on mount and after
   * anything that could close one, because this list is the only route back to
   * an import once the tab that started it is gone.
   */
  const loadUnfinished = useCallback(
    (isCancelled: () => boolean = () => false) =>
      fetch(
        `/api/admin/membership/import?periodId=${encodeURIComponent(periodId)}`,
      )
        .then(async (res) => {
          const data = (await res.json()) as {
            batches?: ImportBatchPayload[];
            error?: string;
          };
          if (!res.ok) throw new Error(data.error ?? "Could not list the imports.");
          return data.batches ?? [];
        })
        .then((batches) => {
          if (!isCancelled()) setUnfinished(batches);
        })
        .catch(() => {
          // A resume list that would not load is not a reason to block the
          // upload underneath it, which is the common path. The panel simply
          // offers nothing to resume.
          if (!isCancelled()) setUnfinished([]);
        }),
    [periodId],
  );

  useEffect(() => {
    let cancelled = false;
    void loadUnfinished(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadUnfinished]);

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setProgress(null);
    setTotalsStale(false);
    try {
      const res = await fetch("/api/admin/membership/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, csv, filename, defaultTier }),
      });
      const data = (await res.json()) as UploadResponse;
      if (!res.ok) throw new Error(data.error ?? "That file could not be read.");
      setUpload(data);
      setBatchId(data.batchId);
      setBatch(null);
      setRows(data.rows);
      setConfirmed(new Set());
      setDismissed(new Set());
      setConfirming(false);
      setAutoRecorded(false);
      await loadUnfinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Read the batch and EVERY page of its still-pending rows back from the
   * server. The cursor is followed to the end: a name match on page three is
   * one an admin has to be able to tick, and one page was the difference
   * between an import that finishes and one that cannot.
   */
  const refresh = useCallback(async (id: string) => {
    const collected: ImportRowPayload[] = [];
    let cursor: string | null = null;
    let loaded: ImportBatchPayload | null = null;

    for (let page = 0; page < ROW_PAGES; page += 1) {
      const params = new URLSearchParams({ batchId: id });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/admin/membership/import?${params.toString()}`);
      const data = (await res.json()) as {
        batch: ImportBatchPayload;
        rows: ImportRowPayload[];
        nextCursor: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not read that import.");
      loaded = data.batch;
      collected.push(...data.rows.filter((row) => row.matchKind === "name"));
      cursor = data.nextCursor;
      if (!cursor) break;
    }

    setBatch(loaded);
    setRows(collected);
    return loaded;
  }, []);

  /** Pick up an import started in another tab, or before a reload. */
  async function resume(id: string) {
    setBusy(true);
    setError(null);
    setProgress(null);
    setTotalsStale(false);
    setUpload(null);
    setConfirmed(new Set());
    setDismissed(new Set());
    setConfirming(false);
    setAutoRecorded(false);
    try {
      await refresh(id);
      setBatchId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that import.");
    } finally {
      setBusy(false);
    }
  }

  /** Close an import nobody is going back to. Rows and memberships are kept. */
  async function abandon(id: string) {
    const sure = window.confirm(
      "Abandon this import? Nothing is deleted and no membership is taken "
        + "back. It just stops appearing as unfinished.",
    );
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/membership/import/${encodeURIComponent(id)}/abandon`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That import was not abandoned.");
      if (batchId === id) reset();
      await loadUnfinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That import was not abandoned.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!batchId) return;
    setBusy(true);
    setError(null);
    setTotalsStale(false);
    let totalCommitted = 0;
    let totalSkipped = 0;
    let stale = false;
    try {
      // Up to twenty calls: two hundred people each, so four thousand, which
      // is past the row cap on a single file.
      for (let call = 0; call < 20; call += 1) {
        const res = await fetch(
          `/api/admin/membership/import/${encodeURIComponent(batchId)}/commit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmedRowIds: [...confirmed] }),
          },
        );
        const data = (await res.json()) as CommitResponse;
        if (!res.ok) throw new Error(data.error ?? "That import did not commit.");
        totalCommitted += data.committed;
        totalSkipped += data.skipped;
        if (data.totalsMoved === false) stale = true;
        setProgress(
          `${totalCommitted} recorded, ${totalSkipped} skipped, `
          + `${data.remaining} left to walk.`,
        );
        const moved = data.committed + data.skipped + data.failed;
        if (data.remaining === 0 || moved === 0) break;
      }
      setTotalsStale(stale);
      await refresh(batchId);
      setConfirmed(new Set());
      setDismissed(new Set());
      setAutoRecorded(true);
      await loadUnfinished();
      onCommitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That import did not commit.");
    } finally {
      setBusy(false);
    }
  }

  // From the dry run when there is one, otherwise from the batch document, so
  // a resumed import shows the same shape of receipt as a fresh upload.
  const receipt: Receipt | null =
    upload?.receipt
    ?? (batch
      ? {
          total: batch.totalRows,
          uniEmail: batch.counts.uniEmail,
          personalEmail: batch.counts.personalEmail,
          needsConfirm: batch.counts.needsConfirm,
          duplicate: batch.counts.duplicate,
          unmatched: batch.counts.unmatched,
          autoCommittable: batch.counts.uniEmail + batch.counts.personalEmail,
          byTier: { paid: 0, comped: 0, alumni: 0, staff: 0 },
        }
      : null);

  const nameRows = rows.filter(
    (row) => row.matchKind === "name" && row.state === "pending",
  );
  const stuck = batch?.status === "writing";
  const leftToCheck = nameRows.filter(
    (row) => !confirmed.has(row.rowId) && !dismissed.has(row.rowId),
  ).length;
  const toRecord = receipt
    ? (autoRecorded ? 0 : receipt.autoCommittable) + confirmed.size
    : 0;
  /** A recording pass has finished and nothing has been ticked since. */
  const recorded = progress !== null && !busy;
  /** 1 upload, 2 check the matches, 3 confirm. */
  const step = !receipt ? 1 : confirming ? 3 : 2;
  const sourceName = filename || batch?.filename || (receipt ? "The list you pasted" : "");

  function choose(rowId: string, choice: NameChoice) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (choice === "same") next.add(rowId);
      else next.delete(rowId);
      return next;
    });
    setDismissed((prev) => {
      const next = new Set(prev);
      if (choice === "not") next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  return (
    <div className={styles.wrap}>
      <ol className={styles.steps}>
        <Step number={1} current={step} label="Upload the SU’s list" />
        <Step number={2} current={step} label="Check the matches" />
        <Step number={3} current={step} label="Confirm" />
      </ol>

      {unfinished.length > 0 && step === 1 && (
        <div className={styles.group}>
          <div className={styles.groupText}>
            <h3 className={styles.groupTitle}>Imports that were started and not finished</h3>
            <p className={styles.blurb}>
              Pick one up where it stopped, or close it. Abandoning deletes nothing and takes back
              no membership already recorded.
            </p>
          </div>
          {unfinished.map((item) => (
            <div key={item.id} className={styles.resumeRow}>
              <span className={styles.confirmBody}>
                <MemberText
                  text={item.filename || "an unnamed file"}
                  className={styles.confirmName}
                />
                <span className={styles.sub}>
                  {item.totalRows} rows, {item.committedRows} recorded,{" "}
                  {item.awaitingConfirm} waiting on a confirmation, uploaded by{" "}
                  {item.uploadedByName || "somebody"}
                </span>
              </span>
              <Chip tone={item.status === "writing" ? "warning" : "neutral"}>
                {item.status === "writing" ? "Did not finish writing" : item.status}
              </Chip>
              <span className={styles.resumeActions}>
                {item.status !== "writing" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => resume(item.id)}
                  >
                    Resume
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => abandon(item.id)}
                >
                  Abandon
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <>
          <p className={styles.blurb}>
            Choose the file, or paste the list, for {periodLabel}. It is read and matched first
            and records nothing until you confirm on the last step.
          </p>
          <div className={styles.controls}>
            <label className={styles.field} htmlFor="import-file">
              <span className={styles.fieldLabel}>The SU’s list, as a CSV file</span>
              <input
                id="import-file"
                className={styles.file}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setFilename(file.name);
                  setCsv(await file.text());
                  reset();
                }}
              />
            </label>
            <label className={styles.field} htmlFor="import-tier">
              <span className={styles.fieldLabel}>Type for rows that don’t say one</span>
              <ResponsiveSelect<MembershipTier>
                id="import-tier"
                value={defaultTier}
                onChange={setDefaultTier}
                disabled={busy}
                ariaLabel="Type for rows that don’t say one"
                options={ALL_MEMBERSHIP_TIERS.map<ResponsiveSelectOption<MembershipTier>>(
                  (t) => ({ value: t, label: MEMBERSHIP_TIER_LABELS[t] }),
                )}
              />
            </label>
          </div>

          <label className={styles.field} htmlFor="import-csv">
            <span className={styles.fieldLabel}>Or paste the list</span>
            <Textarea
              id="import-csv"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                if (batchId) reset();
              }}
              rows={5}
              disabled={busy}
              placeholder="name,email,university email,membership type"
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.foot}>
            <span className={styles.footNote}>Nothing changes until you confirm.</span>
            <Button disabled={busy || csv.trim() === ""} onClick={runDryRun} trailing={<Arrow />}>
              {busy ? "Reading…" : "Next: Check the matches"}
            </Button>
          </div>
        </>
      )}

      {receipt && step !== 1 && (
        <>
          <div className={styles.fileRow}>
            <span className={styles.fileName}>
              <Tick />
              <MemberText text={sourceName} className={styles.confirmName} />
              <span className={styles.sub}>
                {receipt.total} {receipt.total === 1 ? "person" : "people"}
                {upload ? `, read against ${upload.accountsScanned} accounts` : ""}
              </span>
            </span>
            <button type="button" className={styles.textButton} disabled={busy} onClick={reset}>
              Use a different file
            </button>
          </div>

          {stuck ? (
            <>
              <p className={styles.error} role="alert">
                This upload did not finish writing its rows, so it cannot be recorded. Abandon it
                and read the file again.
              </p>
              {batchId && (
                <div className={styles.foot}>
                  <Button variant="secondary" disabled={busy} onClick={() => abandon(batchId)}>
                    Abandon this import
                  </Button>
                </div>
              )}
            </>
          ) : step === 2 ? (
            <>
              <Group
                count={receipt.uniEmail}
                tone="ok"
                title="Matched by university email"
                note="These are certain."
              />
              {receipt.personalEmail > 0 && (
                <Group
                  count={receipt.personalEmail}
                  tone="ok"
                  title="Matched by sign-in email"
                  note="The address on the SU’s list is the one they sign in with here."
                />
              )}
              <Group
                count={receipt.needsConfirm}
                tone="warn"
                title="Matched by name only"
                note="Check these. Two students share a name more often than you would think, and anyone you don’t confirm is left unrecorded."
              >
                {nameRows.length > 0 && (
                  <ul className={styles.matchList}>
                    {nameRows.map((row) => {
                      const account = row.matchedUid ? accountByUid.get(row.matchedUid) : undefined;
                      const choice: NameChoice = confirmed.has(row.rowId)
                        ? "same"
                        : dismissed.has(row.rowId)
                          ? "not"
                          : "";
                      return (
                        <li key={row.rowId} className={styles.match}>
                          <div className={styles.matchSide}>
                            <span className="meta">On the SU list</span>
                            {/* Straight off an uploaded file: rendered as a text
                                node, never as markup. */}
                            <MemberText text={row.name} className={styles.confirmName} />
                            <span className={styles.sub}>
                              line {row.line}
                              {row.email ? `, ${row.email}` : ""}
                            </span>
                          </div>
                          <span className={styles.matchArrow} aria-hidden="true">
                            <Arrow />
                          </span>
                          <div className={styles.matchSide}>
                            <span className="meta">Account here</span>
                            <span className={styles.matchAccount}>
                              {row.matchedUid && (
                                <InitialsChip
                                  name={account?.name ?? "?"}
                                  uid={row.matchedUid}
                                  size="md"
                                />
                              )}
                              <span className={styles.matchAccountText}>
                                <span className={styles.confirmName}>
                                  {account?.name ?? "An account this page has not loaded"}
                                </span>
                                {account?.email && <span className={styles.sub}>{account.email}</span>}
                              </span>
                            </span>
                          </div>
                          <SegmentedControl<NameChoice>
                            ariaLabel={`Is ${row.name} the same person?`}
                            value={choice}
                            onChange={(next) => choose(row.rowId, next)}
                            options={NAME_CHOICES}
                            size="sm"
                            disabled={busy}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Group>
              {receipt.duplicate > 0 && (
                <Group
                  count={receipt.duplicate}
                  tone="plain"
                  title="On the list twice"
                  note="The same person as an earlier line. They are counted once."
                />
              )}
              <Group
                count={receipt.unmatched}
                tone="plain"
                title="No account here"
                note="They’ve paid the SU but haven’t made an account, so there is nothing here to record them against. Import the list again once they have."
              />

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.foot}>
                <Button variant="secondary" disabled={busy} onClick={reset} leading={<Arrow back />}>
                  Back
                </Button>
                <span className={styles.footNote}>
                  {leftToCheck > 0 ? `${leftToCheck} left to check. ` : ""}
                  Nothing changes until you confirm.
                </span>
                <Button disabled={busy} onClick={() => setConfirming(true)} trailing={<Arrow />}>
                  Next: Confirm
                </Button>
              </div>
            </>
          ) : recorded ? (
            <>
              <div className={styles.group}>
                <span className={`${styles.groupCount} ${styles.countOk}`}>
                  <Tick />
                </span>
                <div className={styles.groupText}>
                  <h3 className={styles.groupTitle}>Recorded for {periodLabel}</h3>
                  <p className={styles.blurb}>{progress}</p>
                  {batch && (
                    <p className={styles.blurb}>
                      This import: {batch.committedRows} recorded, {batch.skippedRows} skipped,{" "}
                      {batch.awaitingConfirm} still waiting on a confirmation. Status{" "}
                      {batch.status}.
                    </p>
                  )}
                </div>
              </div>
              {totalsStale && (
                <p className={styles.error} role="alert">
                  The memberships were written, but this year’s counts could not be moved, so the
                  numbers at the top of the page are now behind. Press Recount beside them to
                  rebuild them from the records.
                </p>
              )}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.foot}>
                {nameRows.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // Back to the name matches still waiting. The pass that
                      // has just finished is no longer the news.
                      setProgress(null);
                      setConfirming(false);
                    }}
                    leading={<Arrow back />}
                  >
                    {nameRows.length} name {nameRows.length === 1 ? "match" : "matches"} still to
                    check
                  </Button>
                )}
                <span className={styles.footNote} />
                <Button variant="secondary" onClick={reset}>
                  Import another list
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.group}>
                <div className={styles.groupText}>
                  <h3 className={styles.groupTitle}>
                    Record {toRecord} {toRecord === 1 ? "membership" : "memberships"} for{" "}
                    {periodLabel}
                  </h3>
                  <ul className={styles.facts}>
                    {!autoRecorded && <li>{receipt.uniEmail} matched by university email</li>}
                    {!autoRecorded && receipt.personalEmail > 0 && (
                      <li>{receipt.personalEmail} matched by sign-in email</li>
                    )}
                    <li>
                      {confirmed.size} of {nameRows.length} name{" "}
                      {nameRows.length === 1 ? "match" : "matches"} you confirmed
                    </li>
                    {nameRows.length - confirmed.size > 0 && (
                      <li>
                        {nameRows.length - confirmed.size} name{" "}
                        {nameRows.length - confirmed.size === 1 ? "match is" : "matches are"} left
                        unrecorded
                      </li>
                    )}
                    <li>{receipt.unmatched} have no account here and are not recorded</li>
                  </ul>
                </div>
              </div>

              {progress && <p className={styles.blurb}>{progress}</p>}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.foot}>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  leading={<Arrow back />}
                >
                  Back
                </Button>
                {batchId && (
                  <Button variant="ghost" disabled={busy} onClick={() => abandon(batchId)}>
                    Abandon this import
                  </Button>
                )}
                <span className={styles.footNote} />
                <Button disabled={busy} onClick={commit}>
                  {busy
                    ? "Recording…"
                    : `Record ${toRecord} ${toRecord === 1 ? "membership" : "memberships"}`}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** One step of the three, as a numbered dot and its name. */
function Step({ number, current, label }: { number: number; current: number; label: string }) {
  const done = number < current;
  const on = number === current;
  return (
    <li
      className={`${styles.step} ${done ? styles.stepDone : ""} ${on ? styles.stepOn : ""}`}
      aria-current={on ? "step" : undefined}
    >
      <span className={styles.stepDot} aria-hidden="true">
        {done ? <Tick /> : number}
      </span>
      <span className={styles.stepLabel}>
        <span className={styles.srOnly}>
          Step {number}
          {done ? ", done" : on ? ", current step" : ""}:{" "}
        </span>
        {label}
      </span>
    </li>
  );
}

/** One kind of match: how many, what it means, and (for name matches) the rows. */
function Group({
  count,
  tone,
  title,
  note,
  children,
}: {
  count: number;
  tone: "ok" | "warn" | "plain";
  title: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.group}>
      <span
        className={`${styles.groupCount} ${tone === "ok" ? styles.countOk : tone === "warn" ? styles.countWarn : ""}`}
      >
        {count}
      </span>
      <div className={styles.groupText}>
        <h3 className={styles.groupTitle}>{title}</h3>
        <p className={styles.blurb}>{note}</p>
        {children}
      </div>
    </div>
  );
}

function Tick() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={back ? "M19 12H5M11 6l-6 6 6 6" : "M5 12h14M13 6l6 6-6 6"} />
    </svg>
  );
}
