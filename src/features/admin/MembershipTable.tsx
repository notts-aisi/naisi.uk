"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import SegmentedControl, { type SegmentedOption } from "@/components/ui/SegmentedControl";
import Switch from "@/components/ui/Switch";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  ALL_MEMBERSHIP_TIERS,
  MEMBERSHIP_TIER_LABELS,
  type MembershipTier,
} from "@/lib/firestore/memberships";
import { AdminSearch, AdminTable } from "./adminList";
import TierControl from "./TierControl";
import {
  deriveCounts,
  filterMembershipRows,
  type MembershipListRow,
} from "./membershipList";
import styles from "./MembershipTable.module.css";

/**
 * Every account, joined to its membership for the period on show.
 *
 * ## Pending accounts are IN, and that is the point
 *
 * The admin Members list cannot show them: it is the roster. Somebody who
 * registered on Monday, paid the Students' Union on Tuesday and is still
 * waiting for approval on Wednesday is exactly who an admin comes here to
 * find, so pending and rejected accounts are rows like any other, with the
 * role as a column and a filter that can put them away rather than a filter
 * that hides them before anybody looks.
 *
 * ## The filtering is local, and honest about it
 *
 * The route pages accounts with a cursor and the console follows the cursor to
 * the end, so every row is here before the filter runs. That keeps the counts
 * and the search consistent with each other; the alternative, filtering
 * server-side, would have a search box that pages and a count that does not.
 *
 * ## Wide content scrolls inside itself
 *
 * The signed-in frame must never scroll sideways, so the table sits in a card
 * that scrolls inside itself. On a phone each row is a small card instead.
 */

/** Which rows the pills above the table show. One choice, because the two
 *  things it replaces could never both narrow the list: an account that has
 *  lapsed has nothing recorded, so "lapsed" and a tier never overlap. */
type Show = MembershipTier | "all" | "untagged" | "lapsed";

/** What the Account column says for each role. A role this build does not
 *  know is shown as it is stored: the table renders it and never branches on
 *  it. */
const ROLE_WORDS: Record<string, string | undefined> = {
  member: "Member",
  committee: "Committee",
  admin: "Admin",
  pending: "Join request pending",
  rejected: "Join request turned down",
};

export default function MembershipTable({
  rows,
  periodId,
  loading,
  truncated,
  onRowChanged,
}: {
  rows: MembershipListRow[];
  periodId: string;
  loading: boolean;
  truncated: boolean;
  onRowChanged: (uid: string, tier: MembershipTier | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  // Named for the switch: it hides every account that is not approved, which
  // is `pending` AND `rejected`. "Include pending" said half of that.
  const [includeUnapproved, setIncludeUnapproved] = useState(true);

  const visible = useMemo(
    () =>
      filterMembershipRows(rows, {
        query,
        tier: show === "lapsed" ? "all" : show,
        onlyLapsed: show === "lapsed",
        includeUnapproved,
      }),
    [rows, query, show, includeUnapproved],
  );

  // What each pill would show, counted from the accounts loaded here and the
  // switch below, and never from the search box: a count that moved as
  // somebody typed would be a count of nothing in particular.
  const options = useMemo(() => {
    const pool = filterMembershipRows(rows, { includeUnapproved });
    const derived = deriveCounts(pool);
    const count = (tier: MembershipTier) => pool.filter((row) => row.tier === tier).length;
    const list: SegmentedOption<Show>[] = [
      { value: "all", label: `All · ${pool.length}` },
      ...ALL_MEMBERSHIP_TIERS.map<SegmentedOption<Show>>((tier) => ({
        value: tier,
        label: `${MEMBERSHIP_TIER_LABELS[tier]} · ${count(tier)}`,
      })),
      { value: "untagged", label: `Not recorded · ${derived.untagged}` },
      {
        value: "lapsed",
        label: `Lapsed · ${derived.lapsed}`,
        title: "Recorded for the year before this one, and not for this one",
      },
    ];
    return list;
  }, [rows, includeUnapproved]);

  return (
    <div className={styles.wrap}>
      <div className={styles.filters}>
        <SegmentedControl<Show>
          ariaLabel="Which members to show"
          value={show}
          onChange={setShow}
          options={options}
          size="sm"
        />
        <AdminSearch
          id="membership-search"
          data-testid="membership-search"
          label="Search members"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Switch
        checked={includeUnapproved}
        onChange={setIncludeUnapproved}
        label="Include accounts that aren’t approved"
        description="People waiting on a join request, and people turned down"
      />

      {truncated && (
        <p className={styles.warning}>
          There are more accounts than this page will load. The counts on the pills describe what
          is loaded, not the whole society.
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className={styles.muted}>Loading accounts…</p>
      ) : visible.length === 0 ? (
        <p className={styles.muted}>No accounts match that.</p>
      ) : (
        <AdminTable caption="Members" minWidth="56rem" stackOnPhone>
          <thead>
            <tr>
              <th scope="col" style={{ width: "23%" }}>
                Name
              </th>
              <th scope="col" style={{ width: "25%" }}>
                Email
              </th>
              <th scope="col" style={{ width: "13%" }}>
                Account
              </th>
              <th scope="col" style={{ width: "10%" }}>
                Type
              </th>
              <th scope="col">Recorded</th>
              <th scope="col">
                <span className={styles.srOnly}>Change</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <Row
                key={row.uid}
                row={row}
                periodId={periodId}
                onChanged={(next) => onRowChanged(row.uid, next)}
              />
            ))}
          </tbody>
        </AdminTable>
      )}

      <p className={styles.counts}>
        Showing {visible.length} of {rows.length} accounts, counted from the accounts loaded here.
        Lapsed means recorded for the year before this one and not for this one.
      </p>
      <p className={styles.counts}>
        Downloading the CSV is recorded: who took it, which year, and how many people were in it.
      </p>
    </div>
  );
}

function Row({
  row,
  periodId,
  onChanged,
}: {
  row: MembershipListRow;
  periodId: string;
  onChanged: (next: MembershipTier | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = row.displayName || "No name";
  return (
    <tr data-testid="membership-row">
      <td>
        <div className={styles.person}>
          <InitialsChip name={name} uid={row.uid} size="lg" />
          <div className={styles.personText}>
            {/* A display name is member-authored text and is rendered as a text
                node, never as markup. */}
            <span className={styles.name}>{name}</span>
            {/* Said only when it tells somebody something: not when it is the
                first word of the name above it. */}
            {row.preferredName && !row.displayName.startsWith(row.preferredName) && (
              <span className={styles.sub}>Goes by {row.preferredName}</span>
            )}
          </div>
        </div>
      </td>
      <td data-label="Email">
        <div className={styles.emails}>
          <span>{row.email || "No sign-in email"}</span>
          {row.universityEmail && row.universityEmail !== row.email && (
            <span className={styles.sub}>
              {row.universityEmail}
              {!row.uniEmailVerified && ", not verified"}
            </span>
          )}
        </div>
      </td>
      <td data-label="Account">
        <span className={styles.cellText}>{ROLE_WORDS[row.role] ?? row.role}</span>
      </td>
      <td data-label="Type" data-testid="membership-row-tier">
        {row.tier ? (
          <Chip tone={row.tier === "alumni" ? "neutral" : "success"}>
            {MEMBERSHIP_TIER_LABELS[row.tier]}
          </Chip>
        ) : row.lapsed ? (
          <Chip tone="warning" title="Recorded for the year before this one">
            Lapsed
          </Chip>
        ) : (
          <Chip tone="neutral">Not recorded</Chip>
        )}
      </td>
      <td data-label="Recorded">
        {/* Nothing at all when nothing is recorded, so the cell is empty and a
            phone's card leaves the line out. */}
        {row.tier && (
          <span className={styles.cellText} title={provenanceTitle(row)}>
            {provenanceLine(row)}
          </span>
        )}
      </td>
      <td className={styles.changeCell}>
        <div className={styles.change}>
          <Button
            size="sm"
            variant="ghost"
            data-testid="membership-row-change"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Change"}
          </Button>
          {open && (
            <TierControl
              uid={row.uid}
              periodId={periodId}
              tier={row.tier}
              onChanged={(next) => {
                onChanged(next);
                setOpen(false);
              }}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

/** The short line beside the membership: where it came from, who recorded it and when. */
function provenanceLine(row: MembershipListRow): string {
  if (!row.tier) return "";
  const when = row.recordedAt
    ? formatSiteDate(new Date(row.recordedAt), { weekday: "short", day: "numeric", month: "short" })
    : "";
  const how =
    row.source === "su-import" ? "SU list" : ["By hand", row.recordedByName].filter(Boolean).join(" · ");
  return when ? `${how} · ${when}` : how;
}

/**
 * The full provenance, on hover and as the accessible name of the same text.
 * `matchedOn` is the part that matters when a record is questioned: a name
 * match somebody confirmed is a different kind of fact from a verified
 * university email.
 */
function provenanceTitle(row: MembershipListRow): string {
  if (!row.tier) return "";
  const parts = [
    `Tier: ${MEMBERSHIP_TIER_LABELS[row.tier]}`,
    `Source: ${row.source === "su-import" ? "SU import" : "manual grant"}`,
    `Matched on: ${matchedOnWords(row.matchedOn)}`,
    row.recordedAt ? `Recorded: ${new Date(row.recordedAt).toLocaleString("en-GB")}` : "",
    `Recorded by: ${row.recordedByName || "not known"}`,
  ];
  return parts.filter(Boolean).join("\n");
}

function matchedOnWords(matchedOn: MembershipListRow["matchedOn"]): string {
  if (matchedOn === "uni-email") return "their verified university email";
  if (matchedOn === "personal-email") return "their sign-in email";
  if (matchedOn === "name-confirmed") return "their name, confirmed by a person";
  if (matchedOn === "manual") return "an admin recording it by hand";
  return "not known";
}
