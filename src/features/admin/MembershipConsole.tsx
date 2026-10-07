"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import CountedTextarea from "@/components/ui/CountedTextarea";
import { Input } from "@/components/ui/Input";
import PageHead from "@/components/ui/PageHead";
import {
  ALL_MEMBERSHIP_TIERS,
  MEMBERSHIP_FIELD_LIMITS,
  MEMBERSHIP_TIER_LABELS,
  type MembershipTier,
} from "@/lib/firestore/memberships";
import { currentAcademicYear } from "@/lib/firestore/users";
import { AdminPage } from "./adminList";
import { resetCurrentPeriodCache } from "./currentPeriodCache";
import ImportPanel from "./ImportPanel";
import MembershipTable from "./MembershipTable";
import PeriodSwitcher from "./PeriodSwitcher";
import {
  MEMBERSHIP_LIST_MAX_PAGES,
  type MembershipListRow,
} from "./membershipList";
import styles from "./MembershipConsole.module.css";

/**
 * The membership console: the periods, their dates, their per-tier totals, and
 * which one is CURRENT.
 *
 * Four things, in the order somebody works through them: the year being
 * LOOKED AT with its counts, the SU list import, the table of every account
 * against that year, and last the periods themselves and which one is CURRENT,
 * which is set once a year.
 *
 * ## Looking at a period is not making it current
 *
 * The switcher changes what this page shows. `config/membership` decides what
 * every badge on the site reads, is moved by a separate button, and is full
 * admins only. Conflating the two is how somebody re-badges the society while
 * meaning to check last year, so they are two controls that look different.
 *
 * ## Where the counts come from
 *
 * The per-tier counts are the CACHE on the period document, maintained by the
 * grant and commit routes. They are not counted from the table: a headcount
 * that scanned two periods of memberships plus every account on each page load
 * would be slow in exactly the term it matters. "Nothing recorded" and
 * "lapsed" come from the rows the table has loaded, and the table says so.
 *
 * Every read and write is a route call. `membershipPeriods` is
 * `allow read, write: if false`, so there is no client-direct path to fall
 * back on and no snapshot to listen to; the list is refetched after each
 * write.
 */

type Period = {
  id: string;
  year: string;
  label: string;
  startsOn: string;
  endsOn: string;
  note: string;
  totals: Record<MembershipTier, number>;
  createdAt: string | null;
};

type ListPayload = {
  periods: Period[];
  currentPeriodId: string | null;
  canSetCurrent: boolean;
};

export default function MembershipConsole({ isAdmin }: { isAdmin: boolean }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [currentPeriodId, setCurrentPeriodId] = useState<string | null>(null);
  const [canSetCurrent, setCanSetCurrent] = useState(isAdmin);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The period being LOOKED AT. Empty until the periods land, then the current
  // one, because that is what somebody opening this page came to see.
  const [viewingId, setViewingId] = useState("");
  const [rows, setRows] = useState<MembershipListRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recounting, setRecounting] = useState(false);
  const [recountNote, setRecountNote] = useState<string | null>(null);

  /**
   * ONE load, called by the mount effect and again after every write. State
   * moves only from the async callbacks, never synchronously in the effect
   * body: the shape `RoundList` uses, and the reason this is a promise chain
   * rather than an awaited call. `isCancelled` is how the effect's cleanup
   * reaches in.
   */
  const load = useCallback(
    (isCancelled: () => boolean = () => false) =>
      fetch("/api/admin/membership/periods")
        .then(async (res) => {
          const data = (await res.json()) as ListPayload & { error?: string };
          if (!res.ok) {
            throw new Error(data.error ?? "Could not load the membership periods.");
          }
          return data;
        })
        .then((data) => {
          if (isCancelled()) return;
          setPeriods(data.periods);
          setCurrentPeriodId(data.currentPeriodId);
          setCanSetCurrent(data.canSetCurrent);
          // Only ever a DEFAULT: an admin who has switched to another period
          // stays where they are when this reloads after a write.
          setViewingId((current) => {
            if (current && data.periods.some((p) => p.id === current)) return current;
            return data.currentPeriodId ?? data.periods[0]?.id ?? "";
          });
          setError(null);
        })
        .catch((err: unknown) => {
          if (isCancelled()) return;
          setError(
            err instanceof Error ? err.message : "Could not load the membership periods.",
          );
        })
        .finally(() => {
          if (!isCancelled()) setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That did not save.");
      // Creating a period, and above all making one current, changes the
      // answer every membership chip on the Members list is drawn from. That
      // answer is shared and memoised, so it has to be dropped here or the
      // rows keep reporting the state from before this write until a reload.
      resetCurrentPeriodCache();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function patch(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That did not save.");
      // An edit can move the label the chips render, so it drops the shared
      // answer for the same reason a create does.
      resetCurrentPeriodCache();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Every account for the period being viewed, following the cursor to the
   * end. One request per page rather than one per row, and a bounded number of
   * them: a society that grew past the cap is told the table is partial rather
   * than being shown a number that quietly is not the whole list.
   */
  const loadRows = useCallback(
    (periodId: string, isCancelled: () => boolean = () => false) =>
      // Every state change happens in a callback rather than in the body, the
      // shape `load` above uses: state moved synchronously from an effect is
      // a cascading render, and this is called from one.
      Promise.resolve().then(async () => {
        if (!periodId) {
          setRows([]);
          return;
        }
        setRowsLoading(true);
        setRowsTruncated(false);
        const collected: MembershipListRow[] = [];
        let cursor: string | null = null;
        try {
          for (let page = 0; page < MEMBERSHIP_LIST_MAX_PAGES; page += 1) {
            const params = new URLSearchParams({ periodId });
            if (cursor) params.set("cursor", cursor);
            const res = await fetch(`/api/admin/membership/list?${params.toString()}`);
            const data = (await res.json()) as {
              rows: MembershipListRow[];
              nextCursor: string | null;
              error?: string;
            };
            if (!res.ok) throw new Error(data.error ?? "Could not load the accounts.");
            if (isCancelled()) return;
            collected.push(...data.rows);
            cursor = data.nextCursor;
            if (!cursor) break;
            if (page === MEMBERSHIP_LIST_MAX_PAGES - 1) setRowsTruncated(true);
          }
          if (isCancelled()) return;
          setRows(collected);
        } catch (err) {
          if (isCancelled()) return;
          setError(err instanceof Error ? err.message : "Could not load the accounts.");
        } finally {
          if (!isCancelled()) setRowsLoading(false);
        }
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void loadRows(viewingId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadRows, viewingId]);

  /**
   * The export. A POST, because it writes the `dataExports` row that records
   * the download, and a GET would be prefetched and retried. The file is
   * handed over as a blob the browser saves, so the request carries the
   * session cookie the way every other call here does.
   */
  async function exportCsv() {
    if (!viewingId) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/membership/export?periodId=${encodeURIComponent(viewingId)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "That export did not run.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `naisi-membership-${viewingId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That export did not run.");
    } finally {
      setExporting(false);
    }
  }

  /**
   * Rebuild the four cached tier counts for the period being viewed.
   *
   * The counts are maintained by `increment` from the grant route and each
   * chunk of an import commit, and the commit deliberately does not fail when
   * that update fails. This is the repair for the drift that leaves: it counts
   * the membership rows themselves and writes the answer. Pressing it on a
   * period that was already right writes nothing and says so.
   */
  async function recount() {
    if (!viewingId) return;
    setRecounting(true);
    setRecountNote(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/membership/periods/${encodeURIComponent(viewingId)}/recount`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        corrected?: { tier: MembershipTier; was: number; now: number }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Those totals did not recount.");
      const corrected = data.corrected ?? [];
      setRecountNote(
        corrected.length === 0
          ? "Counted. The totals already agreed with the rows."
          : `Corrected ${corrected
              .map(
                (c) => `${MEMBERSHIP_TIER_LABELS[c.tier]} ${c.was} to ${c.now}`,
              )
              .join(", ")}.`,
      );
      resetCurrentPeriodCache();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those totals did not recount.");
    } finally {
      setRecounting(false);
    }
  }

  const viewing = periods.find((p) => p.id === viewingId) ?? null;
  const viewingCurrent = viewing !== null && viewing.id === currentPeriodId;
  const inAll = viewing
    ? ALL_MEMBERSHIP_TIERS.reduce((sum, tier) => sum + (viewing.totals[tier] ?? 0), 0)
    : 0;
  // Who an import's name match landed on, by account id, from the accounts the
  // table below has already loaded.
  const accountByUid = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.uid,
          { name: row.displayName || row.preferredName || "No name", email: row.email },
        ]),
      ),
    [rows],
  );

  return (
    <AdminPage wide>
      <PageHead
        crumb="People"
        title="SU membership"
        description="Who’s paid the £6 SU membership this year. It doesn’t change what anyone can do on the site."
        meta={<span>Admins can edit this page, and so can anyone an admin has given it to.</span>}
        actions={
          viewing ? (
            <Button
              variant="secondary"
              disabled={exporting || rowsLoading}
              onClick={exportCsv}
              title="The download is recorded: who took it, which year, and how many people were in it"
              leading={<DownloadMark />}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          ) : undefined
        }
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {viewing && (
        <section className={styles.card} aria-labelledby="membership-year">
          <div className={styles.yearHead}>
            <div>
              <p className="meta">Academic year</p>
              <div className={styles.yearTitle}>
                <h2 id="membership-year" className={styles.year}>
                  {viewing.year}
                </h2>
                {viewingCurrent ? (
                  <Chip
                    tone="success"
                    dot
                    title="Every membership badge on the site is about this year"
                    data-testid="membership-viewing-current"
                  >
                    Current
                  </Chip>
                ) : (
                  <Chip tone="neutral">Not the current year</Chip>
                )}
              </div>
              {(viewing.startsOn || viewing.endsOn) && (
                <p className={styles.muted}>
                  {civilDay(viewing.startsOn) || "No start date"} to{" "}
                  {civilDay(viewing.endsOn) || "no end date"}
                </p>
              )}
            </div>
            <PeriodSwitcher
              periods={periods}
              value={viewingId}
              currentPeriodId={currentPeriodId}
              onChange={setViewingId}
              disabled={rowsLoading}
            />
          </div>

          {/* One count a tile. Each tile is one run of text, "Paid: 41", which
              is how the page states a count; the stylesheet draws the number
              over its label. */}
          <div className={styles.totals} data-testid="membership-period-totals">
            {ALL_MEMBERSHIP_TIERS.map((tier) => (
              <div key={tier} className={styles.stat}>
                <span className={styles.statLabel}>
                  {MEMBERSHIP_TIER_LABELS[tier]}
                  <span className={styles.statColon}>:</span>
                </span>{" "}
                <span className={styles.statValue}>{viewing.totals[tier] ?? 0}</span>
              </div>
            ))}
            <div className={styles.stat}>
              <span className={styles.statLabel}>
                In all<span className={styles.statColon}>:</span>
              </span>{" "}
              <span className={styles.statValue}>{inAll}</span>
            </div>
          </div>

          <div className={styles.yearFoot}>
            <p className={styles.muted}>
              These counts are kept by every change and every import. If an import ever says it
              could not move them, Recount rebuilds them from the membership records.
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={recounting || rowsLoading}
              onClick={recount}
              title="Rebuild the counts above from the membership records"
            >
              {recounting ? "Recounting…" : "Recount"}
            </Button>
          </div>
          {recountNote && <p className={styles.muted}>{recountNote}</p>}
          {!viewingCurrent && (
            <p className={styles.muted}>
              You are looking at a year that is not the current one. Badges across the site still
              read the current year.
            </p>
          )}
        </section>
      )}

      {viewing && (
        <section className={styles.card} aria-labelledby="membership-import">
          <div>
            <h2 id="membership-import" className={styles.cardTitle}>
              Import the SU list
            </h2>
            <p className={styles.muted}>
              Download the members list from the SU website and upload it here.
            </p>
          </div>
          <ImportPanel
            periodId={viewing.id}
            periodLabel={viewing.label || viewing.year}
            accountByUid={accountByUid}
            onCommitted={() => {
              resetCurrentPeriodCache();
              void load();
              void loadRows(viewing.id);
            }}
          />
        </section>
      )}

      {viewing && (
        <section className={styles.card} aria-labelledby="membership-members">
          <h2 id="membership-members" className={styles.cardTitle}>
            Members {viewing.year}
          </h2>
          <MembershipTable
            rows={rows}
            periodId={viewingId}
            loading={rowsLoading}
            truncated={rowsTruncated}
            onRowChanged={(uid, tier) => {
              // The row settles locally rather than re-paging every account to
              // move one of them. The year's totals move server-side, so the
              // periods list is refetched for the counts above.
              setRows((current) =>
                current.map((row) =>
                  row.uid === uid
                    ? {
                        ...row,
                        tier,
                        source: tier ? "manual" : null,
                        matchedOn: tier ? "manual" : null,
                        recordedAt: tier ? new Date().toISOString() : null,
                      }
                    : row,
                ),
              );
              resetCurrentPeriodCache();
              void load();
            }}
          />
        </section>
      )}

      <section className={styles.card} aria-labelledby="membership-periods">
        <div className={styles.sectionHead}>
          <h2 id="membership-periods" className={styles.cardTitle}>
            Membership periods
          </h2>
          <Button
            size="sm"
            variant="secondary"
            data-testid="membership-new-period"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? "Cancel" : "New period"}
          </Button>
        </div>
        <p className={styles.muted}>
          One period for each academic year. Recording somebody as a member adds them to a period,
          from the table above or from their own page under Accounts.
        </p>
        {!canSetCurrent && (
          <p className={styles.muted}>
            Choosing which period is current is an admin’s job, because it changes every
            member’s badge at once.
          </p>
        )}

        {creating && (
          <PeriodForm
            busy={busy}
            submitLabel="Create period"
            initial={{
              year: currentAcademicYear(),
              label: "",
              startsOn: "",
              endsOn: "",
              note: "",
            }}
            withYear
            onSubmit={async (values) => {
              const ok = await post("/api/admin/membership/periods", values);
              if (ok) setCreating(false);
            }}
          />
        )}

        {loading ? (
          <p className={styles.muted}>Loading…</p>
        ) : periods.length === 0 ? (
          <p className={styles.muted}>
            No membership periods yet. Create {currentAcademicYear()} and make it current, or every
            badge on the site reads &ldquo;not recorded&rdquo;.
          </p>
        ) : (
          <ul className={styles.list}>
            {periods.map((period) => (
              <li key={period.id} className={styles.row} data-testid="membership-period-row">
                <div className={styles.rowHead}>
                  <div className={styles.rowTitle}>
                    <strong>{period.label || period.year}</strong>
                    <Chip tone="neutral">{period.year}</Chip>
                    {period.id === currentPeriodId && (
                      <Chip
                        tone="success"
                        dot
                        title="Every badge on the site is about this period"
                        data-testid="membership-period-current"
                      >
                        Current
                      </Chip>
                    )}
                  </div>
                  <div className={styles.rowActions}>
                    {canSetCurrent && period.id !== currentPeriodId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        data-testid="membership-make-current"
                        onClick={() =>
                          post("/api/admin/membership/current", { periodId: period.id })
                        }
                      >
                        Make current
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        setEditingId((id) => (id === period.id ? null : period.id))
                      }
                    >
                      {editingId === period.id ? "Close" : "Edit"}
                    </Button>
                  </div>
                </div>

                <div className={styles.facts}>
                  <span className={styles.fact}>
                    {civilDay(period.startsOn) || "no start date"} to{" "}
                    {civilDay(period.endsOn) || "no end date"}
                  </span>
                  {ALL_MEMBERSHIP_TIERS.map((tier) => (
                    <span key={tier} className={styles.fact}>
                      {MEMBERSHIP_TIER_LABELS[tier]}: {period.totals[tier] ?? 0}
                    </span>
                  ))}
                </div>

                {period.note && <p className={styles.note}>{period.note}</p>}

                {editingId === period.id && (
                  <PeriodForm
                    busy={busy}
                    submitLabel="Save changes"
                    initial={{
                      year: period.year,
                      label: period.label,
                      startsOn: period.startsOn,
                      endsOn: period.endsOn,
                      note: period.note,
                    }}
                    onSubmit={async (values) => {
                      const ok = await patch(
                        `/api/admin/membership/periods/${encodeURIComponent(period.id)}`,
                        {
                          label: values.label,
                          startsOn: values.startsOn,
                          endsOn: values.endsOn,
                          note: values.note,
                        },
                      );
                      if (ok) setEditingId(null);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  );
}

/** "1 Sept 2026" from a stored civil date (`YYYY-MM-DD`). No instant is
 *  involved, so the date is read and written in UTC and no time zone can move it. */
function civilDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  );
}

function DownloadMark() {
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
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

type FormValues = {
  year: string;
  label: string;
  startsOn: string;
  endsOn: string;
  note: string;
};

/**
 * Create and edit share one form. The year is editable only on create: it IS
 * the doc id and the string every cached membership year is written against,
 * so changing it later would mean renaming a document and rewriting every
 * badge that points at it.
 */
function PeriodForm({
  initial,
  submitLabel,
  busy,
  withYear = false,
  onSubmit,
}: {
  initial: FormValues;
  submitLabel: string;
  busy: boolean;
  withYear?: boolean;
  onSubmit: (values: FormValues) => void | Promise<void>;
}) {
  const [values, setValues] = useState<FormValues>(initial);

  function set(key: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(values);
      }}
    >
      {withYear && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Academic year</span>
          <Input
            value={values.year}
            onChange={(e) => set("year", e.target.value)}
            placeholder="2026/27"
            maxLength={7}
            data-testid="membership-period-year"
          />
        </label>
      )}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Label</span>
        <Input
          value={values.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder="Membership 2026/27"
          maxLength={MEMBERSHIP_FIELD_LIMITS.label}
          data-testid="membership-period-label"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Starts on</span>
        <Input
          type="date"
          value={values.startsOn}
          onChange={(e) => set("startsOn", e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Ends on</span>
        <Input
          type="date"
          value={values.endsOn}
          onChange={(e) => set("endsOn", e.target.value)}
        />
      </label>
      <label className={`${styles.field} ${styles.fieldWide}`}>
        <span className={styles.fieldLabel}>Note (internal)</span>
        {/* Two hundred characters is a sentence or three, not a line, and the
            cap is silent: a single-line input just stops accepting keystrokes.
            The counter is how an admin sees the limit coming. */}
        <CountedTextarea
          value={values.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Anything the next admin should know about this year"
          max={MEMBERSHIP_FIELD_LIMITS.note}
          rows={3}
        />
      </label>
      <div className={styles.formActions}>
        <Button type="submit" size="sm" disabled={busy} data-testid="membership-period-submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
