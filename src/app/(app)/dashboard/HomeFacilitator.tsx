"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import PageHead from "@/components/ui/PageHead";
import Skeleton from "@/components/ui/Skeleton";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { useGroupRoster } from "@/features/courses/useGroupRoster";
import { useRunOverview } from "@/features/courses/useRunOverview";
import { ArrowRight } from "./icons";
import { firstName } from "./homeWords";
import NextSession, { sessionFacts } from "./NextSession";
import styles from "./home.module.css";

/**
 * Home for a facilitator: their group's next session, the way to its
 * register, and who is in the group.
 *
 * Read through the group page's own reads: the run's overview for the group
 * and its next session, and the group's roster for the names. The register
 * itself is on the group's page, and "Take the register" goes there.
 *
 * SOMEBODY WITH TWO GROUPS sees the one that meets next, and a line saying
 * there are more with the way to all of them. The programme's own page draws
 * a card for each.
 */

/** A facilitator's groups on this run, the one that meets soonest first. */
function bySoonest(groups: OverviewGroup[]): OverviewGroup[] {
  const key = (group: OverviewGroup) => {
    const next = group.calendar.nextSession;
    return next ? `${next.dateKey} ${next.startTimeLocal}` : "9999";
  };
  return [...groups].sort((a, b) => key(a).localeCompare(key(b)));
}

type Slots = {
  given: string;
  entry: MyRunEntry;
  /** Server-rendered: the next events, as two small cards. */
  comingUp: ReactNode;
  /** The cards every form of Home ends with. */
  more: ReactNode;
};

export default function HomeFacilitator({ given, entry, comingUp, more }: Slots) {
  const { data, error } = useRunOverview(entry.runId);
  const groups = data ? bySoonest(data.groups) : [];
  const group = groups[0] ?? null;
  const roster = useGroupRoster(group?.id ?? "");
  const facts = group ? sessionFacts(group) : null;

  const runHref = `/learn/${encodeURIComponent(entry.runId)}`;
  const groupHref = group ? `${runHref}/group/${encodeURIComponent(group.id)}` : runHref;
  const headLine = [group?.name ?? entry.groupName, entry.courseTitle].filter(Boolean).join(" · ");
  // The roster lists everybody with a seat in the group. The facilitators are
  // named apart, so "8 in the group" is the people they are there for.
  const staff = new Set(roster.facilitators.map((person) => person.uid));
  const members = roster.members.filter((person) => !staff.has(person.uid));

  return (
    <>
      {headLine && <p className={`meta ${styles.phoneEyebrow}`}>{headLine}</p>}
      <PageHead
        title={given ? `Hi ${given}.` : "Hi."}
        description={<span className={styles.headLine}>{headLine}</span>}
      />

      {!data && !error && <Skeleton height="14rem" />}

      {error && (
        <section className={styles.card}>
          <p className={styles.quiet}>We couldn’t load your group just now.</p>
          <div>
            <Link href={runHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      {data && group && facts && (
        <NextSession
          eyebrow={`Next session · week ${facts.weekNumber}`}
          facts={facts}
          people={
            !roster.loading && !roster.error ? (
              <span className={styles.sessionPeople}>{members.length} in the group</span>
            ) : null
          }
          actions={
            <Link href={groupHref} className={styles.primaryLarge}>
              Take the register
            </Link>
          }
        />
      )}

      {data && !(group && facts) && (
        <section className={styles.card}>
          <p className={styles.quiet}>
            {group ? "No more sessions are planned for your group." : "You don’t have a group yet."}
          </p>
          <div>
            <Link href={groupHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      {groups.length > 1 && (
        <p className={styles.quiet}>
          You facilitate {groups.length} groups. This is the one that meets next.{" "}
          <Link href={runHref} className={styles.inlineLink}>
            See them all
          </Link>
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          {group && members.length > 0 && (
            <section className={styles.plain} aria-labelledby="home-group">
              <div className={styles.cardHead}>
                <h2 id="home-group" className={styles.cardTitle}>
                  Your group
                </h2>
                <Link href={groupHref} className={styles.headLink}>
                  See all
                </Link>
              </div>
              <ul className={styles.people} role="list">
                {members.map((person) => (
                  <li key={person.uid} className={styles.person}>
                    <InitialsChip name={person.displayName} uid={person.uid} size="lg" />
                    <span className={styles.personName}>{firstName(person.displayName)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {comingUp}
        </div>
        <div className={styles.stack}>{more}</div>
      </div>
    </>
  );
}
