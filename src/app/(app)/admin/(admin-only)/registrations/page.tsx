"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import SegmentedControl, { type SegmentedOption } from "@/components/ui/SegmentedControl";
import { AdminLoadingBar, AdminPage, AdminTable } from "@/features/admin/adminList";
import { AdminProblem } from "@/features/admin/adminPanels";
import RegistrationFlags from "@/features/admin/RegistrationFlags";
import RegistrationRow from "@/features/admin/RegistrationRow";
import {
  useAllRegistrations,
  type RegistrationFilter,
} from "@/features/admin/useRegistrations";
import { useRegistrationSummary } from "@/features/admin/useRegistrationSummary";
import {
  ORPHAN_STATUSES,
  type RegistrationView,
} from "@/lib/firestore/registrations";
import styles from "@/features/admin/Registrations.module.css";

const FILTERS: { value: RegistrationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "orphans", label: "Unfinished" },
  { value: "pending-verify", label: "Pending verify" },
  { value: "verified-no-password", label: "Verified · no password" },
  { value: "pending-profile", label: "No profile yet" },
  { value: "completed", label: "Completed" },
];

function matchesFilter(reg: RegistrationView, filter: RegistrationFilter): boolean {
  if (filter === "all") return true;
  if (filter === "orphans") return ORPHAN_STATUSES.includes(reg.status);
  return reg.status === filter;
}

/**
 * Sign-up problems: every account made through the email or the Google route,
 * and how far each one got.
 *
 * Under `(admin-only)`, so `requireAdminPage()` in that group's layout is the
 * gate. The rows and the counts both come from routes: the collection is shut
 * to every browser.
 */
export default function AdminRegistrationsPage() {
  const [filter, setFilter] = useState<RegistrationFilter>("all");
  const summary = useRegistrationSummary();
  const list = useAllRegistrations();
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Client-side filtering off the cached rows: instant, no re-query per pill.
  const filtered = useMemo(
    () => list.rows.filter((r) => matchesFilter(r, filter)),
    [list.rows, filter],
  );

  // Per-pill counts, also derived from the cached rows (free, and a useful at-a-
  // glance signal).
  const counts = useMemo(() => {
    const c: Record<RegistrationFilter, number> = {
      all: list.rows.length,
      orphans: 0,
      "pending-verify": 0,
      "verified-no-password": 0,
      "pending-profile": 0,
      completed: 0,
    };
    for (const r of list.rows) {
      c[r.status] += 1;
      if (ORPHAN_STATUSES.includes(r.status)) c.orphans += 1;
    }
    return c;
  }, [list.rows]);

  // Each pill carries how many of the loaded rows it would show.
  const options = useMemo<SegmentedOption<RegistrationFilter>[]>(
    () =>
      FILTERS.map((f) => ({
        value: f.value,
        label: list.loading ? f.label : `${f.label} · ${counts[f.value]}`,
      })),
    [counts, list.loading],
  );

  async function handleDelete(uid: string) {
    setActionError(null);
    setDeletingUid(uid);
    try {
      const res = await fetch(`/api/admin/registrations/${encodeURIComponent(uid)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 207) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't delete that account.");
      }
      list.reload();
      void summary.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete that account.");
    } finally {
      setDeletingUid(null);
    }
  }

  return (
    <AdminPage wide>
      <PageHead
        crumb="Site settings"
        title="Sign-up problems"
        description="Every account made through the email or the Google route, and how far each one got."
        actions={
          <Button
            variant="secondary"
            disabled={list.loading || summary.loading}
            onClick={() => {
              void summary.reload();
              list.reload();
            }}
          >
            {list.loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <Notice role="note">
        <strong>Completed</strong> means a profile was sent, so the person is in Join requests or
        has already been decided. Everything else is unfinished: an address never confirmed, a
        password never set, or an account that can sign in and has sent no profile. Read{" "}
        <strong>No profile yet</strong> before deleting: nothing reaches Join requests until the
        profile is in, and the person may still mean to finish.
      </Notice>

      {/* A thin loading bar so it's obvious the page is fetching (the table is
          empty until the first load resolves). */}
      {(list.loading || summary.loading) && (
        <Card padding="md">
          <AdminLoadingBar label="Loading sign-ups…" />
        </Card>
      )}

      {summary.error ? (
        <AdminProblem>{summary.error}</AdminProblem>
      ) : summary.summary ? (
        <RegistrationFlags summary={summary.summary} />
      ) : null}

      {actionError && <AdminProblem>{actionError}</AdminProblem>}

      <div className={styles.filters}>
        <SegmentedControl<RegistrationFilter>
          ariaLabel="Which sign-ups to show"
          value={filter}
          onChange={setFilter}
          options={options}
          size="sm"
        />
      </div>

      {list.error ? (
        <AdminProblem>{list.error}</AdminProblem>
      ) : list.loading ? null : filtered.length === 0 ? (
        <Card padding="md">
          <p className={styles.muted}>
            No sign-ups{filter === "all" ? " yet" : " match this filter"}.
          </p>
        </Card>
      ) : (
        <>
          <AdminTable caption="Sign-ups" minWidth="46rem" stackOnPhone>
            <thead>
              <tr>
                <th scope="col" style={{ width: "38%" }}>
                  Address
                </th>
                <th scope="col">Route</th>
                <th scope="col">Got as far as</th>
                <th scope="col">Created</th>
                <th scope="col">
                  <span className={styles.srOnly}>Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <RegistrationRow
                  key={r.uid}
                  reg={r}
                  busy={deletingUid === r.uid}
                  onDelete={() => handleDelete(r.uid)}
                />
              ))}
            </tbody>
          </AdminTable>
          <div className={styles.footer}>
            <p className={styles.truncatedNote}>
              Showing {filtered.length} of {list.rows.length} loaded
              {list.hasMore ? " (more available)" : ""}. Filters apply to loaded rows only; the
              card above carries the full counts.
            </p>
            {list.hasMore && (
              <Button
                variant="secondary"
                size="sm"
                disabled={list.loadingMore}
                onClick={() => list.loadMore()}
              >
                {list.loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </>
      )}
    </AdminPage>
  );
}
