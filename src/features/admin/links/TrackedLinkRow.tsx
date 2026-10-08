"use client";

import { useState, type MouseEvent } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Switch from "@/components/ui/Switch";
import type { LinkStats } from "@/lib/campaign/linkStats";
import { isPrintedSlug } from "@/lib/campaign/printedLinks";
import { parseDestination, type TrackedLinkDoc } from "@/lib/firestore/trackedLinks";
import styles from "./links.module.css";

type Props = {
  link: TrackedLinkDoc;
  origin: string;
  /** This link's numbers for the chosen period. */
  stats: LinkStats;
  /** The numbers are still being read, so none is shown yet. */
  loadingNumbers: boolean;
  /** This link's details are open under the table. */
  selected: boolean;
  /** The id of the details card, which the address button opens. */
  panelId: string;
  /** What the switch shows: the stored value, or the one being saved. */
  live: boolean;
  /** A change to this link is being saved. */
  busy: boolean;
  onSelect: () => void;
  onLive: (next: boolean) => void;
};

/**
 * One short link, as a row of its campaign's table.
 *
 * The address opens the link's details under the table, where it is changed.
 * The rest of the row follows it on a click, so the row is a large target
 * without a button wrapped round a table row. Two things are done in the row
 * itself: switching the link on or off, and copying its address.
 */
export function TrackedLinkRow({
  link,
  origin,
  stats,
  loadingNumbers,
  selected,
  panelId,
  live,
  busy,
  onSelect,
  onLive,
}: Props) {
  const [copied, setCopied] = useState(false);

  const host = new URL(origin).host;
  const address = `${host}/q/${link.slug}`;
  const parsed = parseDestination(link.destination, [origin]);
  const counted = parsed.ok && (parsed.kind === "internal" || link.countOffsite);
  const shown = (n: number) => (loadingNumbers ? "…" : n);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}/q/${link.slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard permission: the address is on screen to be selected.
    }
  }

  function onRowClick(e: MouseEvent<HTMLTableRowElement>) {
    // A press on a control in the row is that control's own business.
    if (e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest("a, button, label, input")) return;
    onSelect();
  }

  return (
    <tr
      className={selected ? `${styles.row} ${styles.rowSelected}` : styles.row}
      onClick={onRowClick}
    >
      <td className={styles.addressCell}>
        <div className={styles.addressLine}>
          <button
            type="button"
            className={styles.address}
            aria-expanded={selected}
            aria-controls={selected ? panelId : undefined}
            onClick={onSelect}
          >
            <span className={styles.host}>{host}/q/</span>
            <span className={styles.slug}>{link.slug}</span>
          </button>
          {isPrintedSlug(link.slug) && <Chip tone="neutral">On paper</Chip>}
          {!counted && <Chip tone="neutral">Not counted</Chip>}
        </div>
        {link.label && <span className={styles.what}>{link.label}</span>}
      </td>
      <td data-label="Goes to" className={styles.goesCell}>
        <span
          className={
            link.active ? styles.destination : `${styles.destination} ${styles.destinationOff}`
          }
        >
          {link.destination}
        </span>
        {!link.active && <span className={styles.cellNote}>Lands on /links while it is off</span>}
        {link.active && !parsed.ok && (
          <span className={styles.cellProblem}>
            This address is not one the site will follow ({parsed.error.replace(/\.$/, "")}), so
            the link is landing on the links page. Change where it goes to fix that.
          </span>
        )}
      </td>
      {counted ? (
        <>
          <td data-label="Scans" className={styles.number}>
            {shown(stats.scans)}
          </td>
          <td data-label="Signed up" className={styles.number}>
            {shown(stats.signupsStarted)}
          </td>
          <td data-label="Confirmed" className={styles.number}>
            {shown(stats.signupsConfirmed)}
          </td>
        </>
      ) : (
        <td colSpan={3} className={styles.uncounted}>
          <span className={styles.cellNote}>
            Goes straight to another site, so scans are not counted. Sign-ups cannot be traced to
            it either, because there is no page of ours in between.
          </span>
        </td>
      )}
      <td data-label="Live" className={styles.live}>
        <Switch
          checked={live}
          disabled={busy}
          onChange={onLive}
          label={
            <>
              <span className={styles.srOnly}>{address} is live</span>
              <span
                aria-hidden="true"
                className={live ? `${styles.liveWord} ${styles.liveWordOn}` : styles.liveWord}
              >
                {live ? "On" : "Off"}
              </span>
            </>
          }
        />
      </td>
      <td className={styles.copyCell}>
        <Button
          size="sm"
          variant="secondary"
          onClick={copy}
          aria-label={copied ? `Copied ${address}` : `Copy ${address}`}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </td>
    </tr>
  );
}
