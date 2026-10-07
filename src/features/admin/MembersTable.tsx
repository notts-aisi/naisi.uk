"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import type { Role } from "@/lib/firebase/session";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { TRACK_LABELS, type AffiliationStatus, type UserDoc } from "@/lib/firestore/users";
import { AdminTable } from "./adminList";
import styles from "./MembersTable.module.css";

export type MemberSort = "joined-newest" | "joined-oldest" | "name";

export const ROLE_WORDS: Record<Role, string> = {
  pending: "Waiting",
  member: "Member",
  committee: "Committee",
  admin: "Admin",
  rejected: "Turned down",
};

export function roleTone(role: Role): ChipTone {
  switch (role) {
    case "admin":
    case "committee":
      return "accent";
    case "rejected":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}

const STATUS_WORDS: Record<AffiliationStatus, string> = {
  undergraduate: "Undergrad",
  masters: "Masters",
  phd: "PhD",
  postdoc: "Postdoc",
  foundation: "Foundation",
  employee: "Staff",
  other: "Other",
};

/** The name an account goes by on the admin pages. */
export function accountName(user: UserDoc): string {
  return user.displayName ?? user.profile?.preferredName ?? user.email ?? "Unnamed";
}

/** "13 Oct", with the year once it is not this one. London time. */
export function joinedDay(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "";
  const sameYear =
    formatSiteDate(date, { year: "numeric" }) === formatSiteDate(now, { year: "numeric" });
  return formatSiteDate(
    date,
    sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" },
  );
}

type Props = {
  users: UserDoc[];
  currentAdminUid: string;
  /** The current membership period's year, or null while none is current. */
  membershipYear: string | null;
  sort: MemberSort;
  onSortChange: (next: MemberSort) => void;
};

/**
 * The Accounts list: one row a person, and the row opens that person's page.
 *
 * Everything in a row comes from the account document the list already
 * holds. What somebody can do to an account (their role, what they can
 * manage, viewing the site as them, deleting them) is on their own page, so
 * no row carries a control that changes anything.
 *
 * The name is the link. The rest of the row follows it on a click, so the
 * row is a large target without a link wrapped round a table row.
 */
export default function MembersTable({
  users,
  currentAdminUid,
  membershipYear,
  sort,
  onSortChange,
}: Props) {
  const router = useRouter();

  return (
    <AdminTable caption="Accounts" minWidth="52rem" stackOnPhone>
      <thead>
        <tr>
          <th scope="col" style={{ width: "32%" }}>
            <button
              type="button"
              aria-pressed={sort === "name"}
              onClick={() => onSortChange("name")}
            >
              Name
              {sort === "name" && <SortMark />}
            </button>
          </th>
          <th scope="col" style={{ width: "14%" }}>
            Account
          </th>
          <th scope="col" style={{ width: "16%" }}>
            SU membership
          </th>
          <th scope="col">Details</th>
          <th scope="col" style={{ width: "10%" }}>
            <button
              type="button"
              aria-pressed={sort !== "name"}
              onClick={() =>
                onSortChange(sort === "joined-newest" ? "joined-oldest" : "joined-newest")
              }
            >
              Joined
              {sort !== "name" && <SortMark up={sort === "joined-oldest"} />}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const href = `/admin/members/${encodeURIComponent(user.uid)}`;
          const name = accountName(user);
          const status = user.profile?.status;
          const uniEmailUnverified =
            Boolean(user.profile?.universityEmail) && !user.profile?.uniEmailVerifiedAt;
          const isStaffRole = user.role === "committee" || user.role === "admin";
          const recorded =
            membershipYear !== null && (user.paidMembershipYears ?? []).includes(membershipYear);
          return (
            <tr
              key={user.uid}
              className={styles.row}
              onClick={(e) => {
                // A click on the link, or with a key held to open it elsewhere,
                // is the link's own business.
                if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                if ((e.target as HTMLElement).closest("a, button")) return;
                router.push(href);
              }}
            >
              <td data-label="Name" className={styles.nameCell}>
                <div className={styles.person}>
                  <InitialsChip name={name} uid={user.uid} size="lg" />
                  <div className={styles.personText}>
                    <Link href={href} className={styles.name}>
                      {name}
                    </Link>
                    <span className={styles.email}>{user.email ?? "No email on file"}</span>
                  </div>
                </div>
              </td>
              <td data-label="Account">
                <div className={styles.chips}>
                  <Chip tone={roleTone(user.role)}>{ROLE_WORDS[user.role]}</Chip>
                  {user.uid === currentAdminUid && <Chip tone="neutral">You</Chip>}
                </div>
              </td>
              <td data-label="SU membership">
                {membershipYear === null ? (
                  <span className={styles.muted}>No year is current</span>
                ) : recorded ? (
                  <Chip tone="success" title={`Recorded as a member for ${membershipYear}`}>
                    Member {membershipYear}
                  </Chip>
                ) : (
                  <span className={styles.muted}>Not recorded</span>
                )}
              </td>
              <td data-label="Details">
                <div className={styles.chips}>
                  {uniEmailUnverified && (
                    <Chip
                      tone="warning"
                      title="Gave a university email and never clicked the link we sent to it"
                    >
                      Uni email not verified
                    </Chip>
                  )}
                  {status && <Chip tone="neutral">{STATUS_WORDS[status] ?? status}</Chip>}
                  {(user.tracks ?? []).map((track) => (
                    <Chip key={track} tone="neutral">
                      {TRACK_LABELS[track]}
                    </Chip>
                  ))}
                  {user.role === "committee" && user.suRecognised && (
                    <Chip tone="neutral">SU-recognised</Chip>
                  )}
                  {user.showOnMembers && user.role !== "rejected" && (
                    <Chip tone="neutral" title="Shown on the public members page">
                      Public
                    </Chip>
                  )}
                  {isStaffRole && user.title && <span className={styles.title}>{user.title}</span>}
                </div>
              </td>
              <td data-label="Joined">
                <span className={`meta ${styles.joined}`}>{joinedDay(user.createdAt)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </AdminTable>
  );
}

function SortMark({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
