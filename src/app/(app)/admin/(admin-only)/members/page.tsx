"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import PageHead from "@/components/ui/PageHead";
import { useAuth } from "@/auth/AuthProvider";
import {
  AdminPage,
  AdminLoadingBar,
  AdminListFooter,
  useClientPagination,
} from "@/features/admin/adminList";
import { loadCurrentPeriod } from "@/features/admin/currentPeriodCache";
import MembersTable from "@/features/admin/MembersTable";
import MembersToolbar, {
  type MemberSort,
  type NewsletterFilter,
  type RoleFilter,
  type StatusFilter,
  type TrackFilter,
} from "@/features/admin/MembersToolbar";
import { useMembers } from "@/features/admin/useMembers";
import {
  canApproveNewsletter,
  canDraftNewsletter,
  type UserDoc,
} from "@/lib/firestore/users";

function matchesQuery(u: UserDoc, needle: string): boolean {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const haystacks: Array<string | null | undefined> = [
    u.displayName,
    u.email,
    u.title,
    u.profile?.preferredName,
    u.profile?.universityEmail,
    u.profile?.subject,
  ];
  return haystacks.some((s) => s && s.toLowerCase().includes(q));
}

function matchesNewsletter(u: UserDoc, filter: NewsletterFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return canDraftNewsletter(u);
    case "approve":
      return canApproveNewsletter(u);
    case "none":
      return !canDraftNewsletter(u) && !canApproveNewsletter(u);
  }
}

function matchesTrack(u: UserDoc, filter: TrackFilter): boolean {
  const tracks = u.tracks ?? [];
  switch (filter) {
    case "all":
      return true;
    case "none":
      return tracks.length === 0;
    case "both":
      return tracks.includes("technical") && tracks.includes("governance");
    case "technical":
    case "governance":
      return tracks.includes(filter);
  }
}

const nameOf = (u: UserDoc) => u.displayName ?? u.email ?? "";

/**
 * Accounts: everyone with a naisi.uk account, as a table. A row opens that
 * person's page, which is where an account is changed.
 */
export default function MembersAdminPage() {
  const { user: currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [newsletterFilter, setNewsletterFilter] = useState<NewsletterFilter>("all");
  const [membersOnly, setMembersOnly] = useState(false);
  const [sort, setSort] = useState<MemberSort>("joined-newest");
  // Which academic year the SU membership column is about. One answer for the
  // whole page, shared with every other reader of the current period.
  const [membershipYear, setMembershipYear] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadCurrentPeriod().then(
      (period) => {
        if (live) setMembershipYear(period?.year ?? null);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const { users, loading, refreshing, error, reload } = useMembers({
    includeRejected: roleFilter === "rejected",
  });

  const filtered = useMemo(() => {
    const rows = users.filter((u) => {
      if (roleFilter === "rejected") {
        if (u.role !== "rejected") return false;
      } else if (roleFilter === "all") {
        if (u.role === "rejected") return false;
      } else {
        if (u.role !== roleFilter) return false;
      }
      if (statusFilter !== "all" && u.profile?.status !== statusFilter) return false;
      if (!matchesTrack(u, trackFilter)) return false;
      if (!matchesNewsletter(u, newsletterFilter)) return false;
      if (
        membersOnly &&
        membershipYear !== null &&
        !(u.paidMembershipYears ?? []).includes(membershipYear)
      ) {
        return false;
      }
      return matchesQuery(u, query);
    });
    // The hook hands the list back by name. Sorted again here, on a copy, so
    // an account with no joining date sorts last either way and never jumps
    // the queue.
    const byName = (a: UserDoc, b: UserDoc) => nameOf(a).localeCompare(nameOf(b));
    if (sort === "name") return [...rows].sort(byName);
    const direction = sort === "joined-newest" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const at = a.createdAt?.getTime();
      const bt = b.createdAt?.getTime();
      if (at === undefined && bt === undefined) return byName(a, b);
      if (at === undefined) return 1;
      if (bt === undefined) return -1;
      return at === bt ? byName(a, b) : (at - bt) * direction;
    });
  }, [
    users,
    roleFilter,
    statusFilter,
    trackFilter,
    newsletterFilter,
    membersOnly,
    membershipYear,
    query,
    sort,
  ]);

  const { shown, hasMore, loadMore, total, shownCount } = useClientPagination(filtered, 20);

  const emptyMessage = query
    ? "No accounts match that search."
    : roleFilter === "rejected"
      ? "No join request has been turned down."
      : "No accounts in this view yet.";

  return (
    <AdminPage wide>
      <PageHead
        crumb="People"
        title="Accounts"
        description="Everyone with a naisi.uk account."
        meta={
          !loading && !error ? (
            <span>
              {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
              {sort === "name"
                ? ", by name"
                : sort === "joined-newest"
                  ? ", newest first"
                  : ", oldest first"}
            </span>
          ) : undefined
        }
      />

      <MembersToolbar
        query={query}
        onQueryChange={setQuery}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        trackFilter={trackFilter}
        onTrackFilterChange={setTrackFilter}
        newsletterFilter={newsletterFilter}
        onNewsletterFilterChange={setNewsletterFilter}
        membershipYear={membershipYear}
        membersOnly={membersOnly}
        onMembersOnlyChange={setMembersOnly}
        sort={sort}
        onSortChange={setSort}
      />

      {error && (
        <Card padding="md">
          <p style={{ color: "var(--color-danger-text)" }}>Couldn&apos;t load: {error.message}</p>
        </Card>
      )}

      {loading && (
        <Card padding="md">
          <AdminLoadingBar label="Loading accounts…" />
        </Card>
      )}

      {!loading && filtered.length === 0 && !error && (
        <Card padding="md">
          <p style={{ color: "var(--color-text-muted)" }}>{emptyMessage}</p>
        </Card>
      )}

      {currentUser && shown.length > 0 && (
        <MembersTable
          users={shown}
          currentAdminUid={currentUser.uid}
          membershipYear={membershipYear}
          sort={sort}
          onSortChange={setSort}
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <AdminListFooter
          shownCount={shownCount}
          total={total}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onRefresh={reload}
          refreshing={refreshing}
          noun="accounts"
        />
      )}
    </AdminPage>
  );
}
