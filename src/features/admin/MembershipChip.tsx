"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ResponsiveSelect, {
  type ResponsiveSelectOption,
} from "@/components/ui/ResponsiveSelect";
import {
  ALL_MEMBERSHIP_TIERS,
  MEMBERSHIP_TIER_LABELS,
  type MembershipTier,
} from "@/lib/firestore/memberships";
import { loadCurrentPeriod, type CurrentPeriod } from "./currentPeriodCache";
import styles from "./MembershipChip.module.css";

/**
 * Membership for ONE member, on their page in the admin area.
 *
 * ## What it shows, and what it cannot
 *
 * The chip reads `users.paidMembershipYears`, the cache the account document
 * already carries, so it answers "is this person recorded as a member for the
 * current period" with no extra read. It cannot show WHICH tier: the cache is
 * one bit per year by design, and the tier lives on the `memberships` row,
 * which is `allow read, write: if false` and would cost a route call per
 * member to fetch. So the chip says recorded or not recorded, the popover
 * grants a tier, and the tier breakdown per period is on the console.
 * `alumni` is the tier that reads as "not recorded" here, correctly: an
 * alumni row is deliberately not a membership for the year.
 *
 * ## One answer, shared
 *
 * Which period is current is the same answer for everybody, so the request is
 * shared with the Accounts list through `currentPeriodCache`. That module also
 * owns when the shared answer stops being trusted, which matters most in the
 * one state an admin is likely to be halfway through changing: see its header.
 *
 * The write is `POST /api/admin/membership/grant`, which owns the row, the
 * cache and the period totals together. Nothing here writes Firestore.
 */

/**
 * The current period, as state, for a component that only wants to render off
 * it. `resolved` is separate from the value because "still asking" and "no
 * period is current" are different things and only one of them is worth
 * saying out loud.
 */
function useCurrentPeriod(): { period: CurrentPeriod; resolved: boolean } {
  const [period, setPeriod] = useState<CurrentPeriod>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let live = true;
    void loadCurrentPeriod().then(
      (p) => {
        if (!live) return;
        setPeriod(p);
        setResolved(true);
      },
      // The fetcher swallows its own failures, so this is belt and braces:
      // whatever happens, the chip stops saying "checking".
      () => {
        if (live) setResolved(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return { period, resolved };
}

export default function MembershipChip({
  uid,
  recordedYears,
}: {
  uid: string;
  recordedYears: string[] | undefined;
}) {
  const { period, resolved } = useCurrentPeriod();
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<MembershipTier>("paid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The roster is a one-shot fetch, so the page does not refresh after a
  // write. Remember just this member's state locally (null = no local change
  // yet, read the cache) so the chip settles straight away.
  const [override, setOverride] = useState<boolean | null>(null);

  const recorded =
    override ?? (period ? (recordedYears ?? []).includes(period.year) : false);

  async function send(body: Record<string, unknown>, next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/membership/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That did not save.");
      setOverride(next);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!resolved) {
    return <span className={styles.muted}>Checking membership…</span>;
  }

  if (!period) {
    return (
      <span className={styles.muted}>
        No membership year is current.{" "}
        <Link href="/admin/membership" className={styles.link}>
          Set one up
        </Link>
      </span>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.chipRow}>
        <Badge
          tone={recorded ? "success" : "neutral"}
          title={
            recorded
              ? `Recorded as a member for ${period.year}`
              : `No membership recorded for ${period.year}`
          }
        >
          {recorded ? `Member ${period.year}` : `Not recorded ${period.year}`}
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} disabled={busy}>
          {open ? "Close" : "Change"}
        </Button>
        <Link href="/admin/membership" className={styles.link}>
          Open SU membership
        </Link>
      </div>

      {open && (
        <div className={styles.popover}>
          <span className={styles.hint}>
            Recorded against {period.label || period.year}. Alumni is a record,
            not a membership, so it clears the badge.
          </span>
          <div className={styles.controls}>
            <ResponsiveSelect<MembershipTier>
              value={tier}
              onChange={setTier}
              options={ALL_MEMBERSHIP_TIERS.map<ResponsiveSelectOption<MembershipTier>>(
                (t) => ({ value: t, label: MEMBERSHIP_TIER_LABELS[t] }),
              )}
              disabled={busy}
              ariaLabel="Membership tier"
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                send(
                  { uid, periodId: period.id, tier, source: "manual", matchedOn: "manual" },
                  tier !== "alumni",
                )
              }
            >
              Record
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => send({ uid, periodId: period.id, revoke: true }, false)}
            >
              Remove
            </Button>
          </div>
          {error && <span className={styles.error}>{error}</span>}
        </div>
      )}
    </div>
  );
}
