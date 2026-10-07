"use client";

import { useEffect, useState } from "react";
import Chip from "@/components/ui/Chip";
import { SU_PAGE_URL } from "@/content/socials";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  MEMBERSHIP_TIER_LABELS,
  type MembershipMePayload,
} from "@/lib/firestore/memberships";
import ProfileSection from "./ProfileSection";
import styles from "./MembershipBadge.module.css";

/**
 * The member's own membership, on their profile.
 *
 * Reads `GET /api/membership/me` and nothing else. `memberships` is
 * `allow read, write: if false`, deliberately including the own-row read: a
 * `get` of a MISSING document evaluates `resource.data.uid` against null and
 * denies, so "you have no row" and "you may not look" would arrive here as the
 * same error and this card could not tell them apart. The route answers `null`
 * and means it.
 *
 * Website membership and SU membership are separate words, and the card says
 * so: an account on this site is not a society membership, and the link to buy
 * one is the SU's page rather than anything we can sell.
 *
 * It draws a whole section of the profile page, heading included, or nothing:
 * a section with a heading and no card would promise something and show none.
 */

/** "Fri 2 Oct", from the instant the membership was recorded. */
function recordedOn(since: string | null): string | null {
  if (!since) return null;
  const at = new Date(since);
  if (Number.isNaN(at.getTime())) return null;
  return formatSiteDate(at, { weekday: "short", day: "numeric", month: "short" });
}

/** The glyph for a link that leaves the site. */
function Leaves() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 16L17 7M9 7h8v8" />
    </svg>
  );
}

export default function MembershipBadge() {
  const [data, setData] = useState<MembershipMePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/membership/me")
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        return (await res.json()) as MembershipMePayload;
      })
      .then((payload) => {
        if (live) setData(payload);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // Nothing to say yet, and nothing worth an error box either: a profile that
  // cannot reach this route is still a profile somebody is editing.
  if (failed || !data) return null;

  const { currentPeriod, membership, history } = data;
  const past = history.filter((row) => row.year !== currentPeriod?.year);
  const day = membership ? recordedOn(membership.since) : null;

  return (
    <ProfileSection
      headingId="profile-membership"
      title="SU membership"
      description="£6 a year, paid on the SU website. It’s separate from your account here."
    >
      {currentPeriod && (
        <div className={styles.chips}>
          {membership ? (
            <Chip tone="success" dot>
              {MEMBERSHIP_TIER_LABELS[membership.tier]} · {currentPeriod.year}
            </Chip>
          ) : (
            <Chip tone="neutral" dot>
              Not on our list yet · {currentPeriod.year}
            </Chip>
          )}
        </div>
      )}

      {!currentPeriod ? (
        <p className={styles.body}>We’re not keeping a membership list at the moment.</p>
      ) : membership ? (
        <p className={styles.body}>
          {membership.tier === "paid"
            ? `We matched you to the SU’s list${day ? ` on ${day}` : ""}. Thanks for joining.`
            : `You’re on our list for ${currentPeriod.year}${day ? `, since ${day}` : ""}.`}
        </p>
      ) : (
        <p className={styles.body}>
          We haven’t matched you to the SU’s list for {currentPeriod.year}. If you’ve just joined,
          it can take us a week or two.
        </p>
      )}

      <a href={SU_PAGE_URL} target="_blank" rel="noreferrer noopener" className={styles.link}>
        SU membership on the SU website
        <Leaves />
      </a>

      {past.length > 0 && (
        <p className={styles.history}>
          Earlier years:{" "}
          {past.map((row) => `${row.year} (${MEMBERSHIP_TIER_LABELS[row.tier]})`).join(", ")}
        </p>
      )}
    </ProfileSection>
  );
}
