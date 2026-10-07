"use client";

import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import type { AffiliationStatus } from "@/lib/firestore/users";
import { AdminFilterPill, AdminSearch } from "./adminList";
import styles from "./MembersToolbar.module.css";

export type RoleFilter = "all" | "member" | "committee" | "admin" | "rejected";
export type StatusFilter = "all" | AffiliationStatus;
export type TrackFilter = "all" | "technical" | "governance" | "both" | "none";
export type NewsletterFilter = "all" | "draft" | "approve" | "none";

const ROLE_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Any" },
  { value: "member", label: "Members" },
  { value: "committee", label: "Committee" },
  { value: "admin", label: "Admins" },
  { value: "rejected", label: "Turned down" },
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Any" },
  { value: "foundation", label: "Foundation" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "masters", label: "Masters" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
  { value: "employee", label: "Staff" },
  { value: "other", label: "Other" },
];

const TRACK_OPTIONS: Array<{ value: TrackFilter; label: string }> = [
  { value: "all", label: "Any" },
  { value: "technical", label: "Technical" },
  { value: "governance", label: "Governance" },
  { value: "both", label: "Both tracks" },
  { value: "none", label: "No track" },
];

const NEWSLETTER_OPTIONS: Array<{ value: NewsletterFilter; label: string }> = [
  { value: "all", label: "Any" },
  { value: "draft", label: "Can draft" },
  { value: "approve", label: "Can approve and send" },
  { value: "none", label: "No access" },
];

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (next: RoleFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  trackFilter: TrackFilter;
  onTrackFilterChange: (next: TrackFilter) => void;
  newsletterFilter: NewsletterFilter;
  onNewsletterFilterChange: (next: NewsletterFilter) => void;
  /**
   * The academic year the SU membership filter is about, or null while no
   * membership period is current: the pill is not drawn without a year to name.
   */
  membershipYear: string | null;
  membersOnly: boolean;
  onMembersOnlyChange: (next: boolean) => void;
};

/**
 * Finding somebody on the Accounts list: a search box, one pill for this
 * year's SU members, and four choices that narrow the list.
 */
export default function MembersToolbar({
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  trackFilter,
  onTrackFilterChange,
  newsletterFilter,
  onNewsletterFilterChange,
  membershipYear,
  membersOnly,
  onMembersOnlyChange,
}: Props) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchRow}>
        <AdminSearch
          label="Search by name or email"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {membershipYear && (
          <AdminFilterPill
            pressed={membersOnly}
            onToggle={() => onMembersOnlyChange(!membersOnly)}
          >
            SU member {membershipYear}
          </AdminFilterPill>
        )}
      </div>
      <div className={styles.selectRow}>
        <label className={styles.selectLabel}>
          <span>Account</span>
          <ResponsiveSelect<RoleFilter>
            className={styles.select}
            value={roleFilter}
            onChange={onRoleFilterChange}
            options={ROLE_OPTIONS}
            ariaLabel="Account"
          />
        </label>
        <label className={styles.selectLabel}>
          <span>Level of study</span>
          <ResponsiveSelect<StatusFilter>
            className={styles.select}
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={STATUS_OPTIONS}
            ariaLabel="Level of study"
          />
        </label>
        <label className={styles.selectLabel}>
          <span>Track</span>
          <ResponsiveSelect<TrackFilter>
            className={styles.select}
            value={trackFilter}
            onChange={onTrackFilterChange}
            options={TRACK_OPTIONS}
            ariaLabel="Track"
          />
        </label>
        <label className={styles.selectLabel}>
          <span>Newsletter access</span>
          <ResponsiveSelect<NewsletterFilter>
            className={styles.select}
            value={newsletterFilter}
            onChange={onNewsletterFilterChange}
            options={NEWSLETTER_OPTIONS}
            ariaLabel="Newsletter access"
          />
        </label>
      </div>
    </div>
  );
}
