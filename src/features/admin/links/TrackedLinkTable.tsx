"use client";

import { AdminTable } from "@/features/admin/adminList";
import type { LinkStats } from "@/lib/campaign/linkStats";
import type { TrackedLinkDoc, TrackedLinkType } from "@/lib/firestore/trackedLinks";
import { TrackedLinkRow } from "./TrackedLinkRow";
import styles from "./links.module.css";

type Totals = { scans: number; signupsStarted: number; signupsConfirmed: number };

export type LinkKindGroup = {
  kind: TrackedLinkType;
  rows: TrackedLinkDoc[];
  totals: Totals;
};

/** "QR codes" and "Links": the kinds, as the rows that head them. */
export const KIND_HEADINGS: Record<TrackedLinkType, string> = { qr: "QR codes", link: "Links" };

type Props = {
  /** Names the table for a screen reader: the campaign and the period. */
  caption: string;
  /** The words on the line that adds the campaign up. */
  totalLabel: string;
  kinds: LinkKindGroup[];
  totals: Totals;
  origin: string;
  statsOf: (link: TrackedLinkDoc) => LinkStats;
  loadingNumbers: boolean;
  /** The slug whose details are open, or null. */
  selected: string | null;
  panelId: string;
  /** A switch pressed and not yet read back: slug to the value being saved. */
  pendingLive: ReadonlyMap<string, boolean>;
  onSelect: (slug: string) => void;
  onLive: (link: TrackedLinkDoc, next: boolean) => void;
};

/**
 * One campaign's links: split by kind, the busiest first, with scans beside
 * the sign-ups that were started and the ones that were confirmed, and the
 * campaign added up on the last line.
 */
export function TrackedLinkTable({
  caption,
  totalLabel,
  kinds,
  totals,
  origin,
  statsOf,
  loadingNumbers,
  selected,
  panelId,
  pendingLive,
  onSelect,
  onLive,
}: Props) {
  const shown = (n: number) => (loadingNumbers ? "…" : n);
  return (
    <AdminTable caption={caption} minWidth="56rem" stackOnPhone>
      <thead>
        <tr>
          {/* Every column is given its share, so the tables of two campaigns
              line up under each other whatever is in them. */}
          <th scope="col" style={{ width: "30%" }}>
            Short address
          </th>
          <th scope="col" style={{ width: "21%" }}>
            Goes to
          </th>
          <th scope="col" style={{ width: "8%" }}>
            Scans
          </th>
          <th scope="col" style={{ width: "10%" }}>
            Signed up
          </th>
          <th scope="col" style={{ width: "11%" }}>
            Confirmed
          </th>
          <th scope="col" style={{ width: "11%" }}>
            Live
          </th>
          <th scope="col" style={{ width: "9%" }}>
            <span className={styles.srOnly}>Copy the address</span>
          </th>
        </tr>
      </thead>
      {kinds.map((kind) => (
        <tbody key={kind.kind} className={styles.kindBody}>
          <tr className={styles.kindRow}>
            <th scope="rowgroup" colSpan={2}>
              {KIND_HEADINGS[kind.kind]}
            </th>
            <td className={styles.number}>{shown(kind.totals.scans)}</td>
            <td className={styles.number}>{shown(kind.totals.signupsStarted)}</td>
            <td className={styles.number}>{shown(kind.totals.signupsConfirmed)}</td>
            <td colSpan={2} />
          </tr>
          {kind.rows.map((link) => (
            <TrackedLinkRow
              key={link.slug}
              link={link}
              origin={origin}
              stats={statsOf(link)}
              loadingNumbers={loadingNumbers}
              selected={selected === link.slug}
              panelId={panelId}
              live={pendingLive.get(link.slug) ?? link.active}
              busy={pendingLive.has(link.slug)}
              onSelect={() => onSelect(link.slug)}
              onLive={(next) => onLive(link, next)}
            />
          ))}
        </tbody>
      ))}
      <tfoot className={styles.foot}>
        <tr className={styles.totalRow}>
          <td colSpan={2} className={styles.totalLabel}>
            {totalLabel}
          </td>
          <td data-label="Scans" className={styles.number}>
            {shown(totals.scans)}
          </td>
          <td data-label="Signed up" className={styles.number}>
            {shown(totals.signupsStarted)}
          </td>
          <td data-label="Confirmed" className={styles.number}>
            {shown(totals.signupsConfirmed)}
          </td>
          <td colSpan={2} />
        </tr>
      </tfoot>
    </AdminTable>
  );
}
