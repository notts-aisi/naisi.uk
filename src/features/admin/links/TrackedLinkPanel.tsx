"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { dayColumns, hourColumns, type LinkStats } from "@/lib/campaign/linkStats";
import { scanBucket } from "@/lib/campaign/scanBuckets";
import { parseDestination, type TrackedLinkDoc } from "@/lib/firestore/trackedLinks";
import { ScanColumns } from "./ScanColumns";
import { TrackedLinkForm } from "./TrackedLinkForm";
import type { TrackedLinkInput } from "./trackedLinkMutations";
import styles from "./links.module.css";

type Props = {
  id: string;
  link: TrackedLinkDoc;
  /** Campaign names already in use, offered as suggestions. */
  campaigns: string[];
  origin: string;
  /** This link's numbers for the chosen period. */
  stats: LinkStats;
  /** First day of the period, or null for all time. */
  fromDate: string | null;
  onSave: (slug: string, input: TrackedLinkInput) => Promise<void>;
  onClose: () => void;
};

/**
 * The selected link, in a card under its campaign's table: what it is, where
 * it goes, and the two things done to one link at a time. Changing it (what it
 * is called, its campaign, where it goes) opens the form here; the scans by
 * day and by hour open here too.
 */
export function TrackedLinkPanel({
  id,
  link,
  campaigns,
  origin,
  stats,
  fromDate,
  onSave,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [detailed, setDetailed] = useState(false);

  const host = new URL(origin).host;
  const address = `${host}/q/${link.slug}`;
  const parsed = parseDestination(link.destination, [origin]);
  // A page on this site is shown as the address somebody would type.
  const goesTo =
    parsed.ok && parsed.kind === "internal" ? `${host}${link.destination}` : link.destination;

  return (
    <section id={id} className={styles.panel} aria-label={`${address}, selected`}>
      <div className={styles.panelHead}>
        <div className={styles.panelText}>
          <span className="meta">{link.type === "qr" ? "Selected code" : "Selected link"}</span>
          <h3 className={styles.panelAddress}>{address}</h3>
          <p className={styles.panelGoes}>
            {link.active ? "Goes to " : "Switched off. Was going to "}
            {goesTo}
          </p>
          {link.label && <p className={styles.panelWhat}>{link.label}</p>}
        </div>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className={styles.panelActions}>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close the form" : "Change where it goes"}
        </Button>
        {stats.scans > 0 && (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={detailed}
            onClick={() => setDetailed((v) => !v)}
          >
            {detailed ? "Hide the days" : "Scans by day"}
          </Button>
        )}
      </div>

      {detailed && stats.scans > 0 && (
        <div className={styles.panelSection}>
          <ScanColumns
            caption="Scans by day"
            columns={dayColumns(stats.byDay, fromDate, scanBucket(new Date()).date)}
          />
          <ScanColumns
            caption="Scans by hour of the day, London time"
            columns={hourColumns(stats.byHour)}
          />
        </div>
      )}

      {editing && (
        <div className={styles.panelSection}>
          <TrackedLinkForm
            link={link}
            campaigns={campaigns}
            origin={origin}
            onSubmit={async (slug, input) => {
              await onSave(slug, input);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </section>
  );
}
