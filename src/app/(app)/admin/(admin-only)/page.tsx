"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import PageHead from "@/components/ui/PageHead";
import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import {
  AdminPage,
  AdminLoadingBar,
  AdminListFooter,
  useClientPagination,
} from "@/features/admin/adminList";
import ApprovalCard from "@/features/admin/ApprovalCard";
import { useApprovals } from "@/features/admin/useApprovals";
import { useUniEmailIndex } from "@/features/admin/useUniEmailIndex";

type Order = "newest" | "oldest";

const ORDER_OPTIONS: Array<{ value: Order; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

/**
 * Join requests: the new accounts waiting for an admin to approve them.
 */
export default function ApprovalsPage() {
  const { users, loading, refreshing, error, reload } = useApprovals();
  const [order, setOrder] = useState<Order>("newest");

  // The hook hands the queue back newest first. The other order is the same
  // list turned round, on a copy.
  const ordered = useMemo(
    () => (order === "newest" ? users : [...users].reverse()),
    [users, order],
  );

  const { shown, hasMore, loadMore, total, shownCount } = useClientPagination(ordered, 20);

  // Only check the uni emails actually on screen: the hook queries just these,
  // instead of scanning the whole users collection.
  const uniEmails = useMemo(
    () => users.map((u) => u.profile?.universityEmail ?? "").filter(Boolean),
    [users],
  );
  const uniEmailIndex = useUniEmailIndex(uniEmails);

  return (
    <AdminPage wide>
      <PageHead
        crumb="People"
        title="Join requests"
        description="New accounts wait here until an admin approves them. Approving sends a welcome email."
        meta={<span>Accepting someone onto a programme approves their account too.</span>}
        actions={
          users.length > 1 ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                Sort
              </span>
              <ResponsiveSelect<Order>
                value={order}
                onChange={setOrder}
                options={ORDER_OPTIONS}
                ariaLabel="Sort"
              />
            </label>
          ) : undefined
        }
      />

      {error && (
        <Card padding="md">
          <p style={{ color: "var(--color-danger-text)" }}>
            Couldn&apos;t load the join requests: {error.message}
          </p>
        </Card>
      )}

      {loading && (
        <Card padding="md">
          <AdminLoadingBar label="Loading join requests…" />
        </Card>
      )}

      {!loading && !error && users.length === 0 && (
        <Card padding="lg">
          <h2 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-2)" }}>
            Nobody is waiting
          </h2>
          <p style={{ color: "var(--color-text-muted)" }}>
            When someone makes an account, their join request shows up here for an admin to
            approve.
          </p>
        </Card>
      )}

      {!loading && !error && users.length > 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          {users.length} {users.length === 1 ? "join request" : "join requests"} waiting.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {shown.map((u) => {
          const uniEmail = u.profile?.universityEmail?.trim().toLowerCase();
          const conflicts = uniEmail
            ? (uniEmailIndex.get(uniEmail) ?? []).filter((h) => h.uid !== u.uid)
            : [];
          return (
            <ApprovalCard
              key={u.uid}
              user={u}
              uniEmailConflicts={conflicts}
              // The list is one-shot, so it only drops a decided request when
              // it is asked to read again.
              onResolved={reload}
            />
          );
        })}
      </div>

      {!loading && !error && total > 0 && (
        <AdminListFooter
          shownCount={shownCount}
          total={total}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onRefresh={reload}
          refreshing={refreshing}
          noun="join requests"
        />
      )}
    </AdminPage>
  );
}
