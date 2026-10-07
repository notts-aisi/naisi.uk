"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import DateTile from "@/components/ui/DateTile";
import EmptyState from "@/components/ui/EmptyState";
import InitialsChip from "@/components/ui/InitialsChip";
import MemberName from "@/components/ui/MemberName";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import ProgressBar from "@/components/ui/ProgressBar";
import SectionTabs, { type SectionTab } from "@/components/ui/SectionTabs";
import { useAuth } from "@/auth/AuthProvider";
import { useEvents } from "@/features/events/useEvents";
import {
  STATUS_WORDS,
  clockWords,
  isOver,
  statusTone,
  tileParts,
  yearOf,
} from "@/features/events/manageWords";
import type { EventDoc } from "@/lib/firestore/events";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";
import styles from "./events.module.css";

type TabKey = "upcoming" | "drafts" | "past" | "cancelled" | "archived";

/** What the person looking has to do with an event. It decides words, never access. */
type Relation = "mine" | "helping" | "other";

/** How many rows a tab shows before "Show all". Past events only ever grow. */
const ROWS_AT_FIRST = 20;

const byStartSoonest = (a: EventDoc, b: EventDoc) =>
  (a.startAt?.getTime() ?? Number.POSITIVE_INFINITY) -
  (b.startAt?.getTime() ?? Number.POSITIVE_INFINITY);
const byStartLatest = (a: EventDoc, b: EventDoc) =>
  (b.startAt?.getTime() ?? 0) - (a.startAt?.getTime() ?? 0);

export default function EventsListPage() {
  const { user, role, permissions, suRecognised } = useAuth();
  const { events, loading, error } = useEvents();
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [showAll, setShowAll] = useState(false);
  // Read once, when the page opens: which side of "now" an event falls on
  // should not change under somebody halfway down the list.
  const [now] = useState(() => new Date());

  const viewer =
    role && (role === "admin" || role === "committee" || role === "member")
      ? { role, permissions }
      : null;
  const canDraft = viewer ? canDraftEvent(viewer) : false;
  const canApprove = viewer ? canApproveEvent(viewer) : false;
  // The same people the attendee list is for. A count of sign-ups that the
  // public event page does not print is shown to them and to nobody else.
  const canSeeAttendees = role === "admin" || (role === "committee" && suRecognised);

  // Three list filters over the events this person can already read: theirs,
  // the ones they were added to, and everyone else's. They choose words (whose
  // event a row is, "Manage" or "View") and the order of the drafts. What may
  // be read or changed is decided by the rules and the routes, not here.
  const mine = useMemo(
    () => events.filter((e) => e.authorUid === user?.uid),
    [events, user],
  );
  const iCollaborate = useMemo(
    () =>
      events.filter(
        (e) =>
          !!user &&
          e.authorUid !== user.uid &&
          e.collaboratorUids.includes(user.uid),
      ),
    [events, user],
  );
  const others = useMemo(
    () =>
      events.filter(
        (e) =>
          e.authorUid !== user?.uid &&
          !(user && e.collaboratorUids.includes(user.uid)),
      ),
    [events, user],
  );
  const relationOf = useMemo(() => {
    const map = new Map<string, Relation>();
    for (const e of others) map.set(e.id, "other");
    for (const e of iCollaborate) map.set(e.id, "helping");
    for (const e of mine) map.set(e.id, "mine");
    return (e: EventDoc): Relation => map.get(e.id) ?? "other";
  }, [mine, iCollaborate, others]);

  // An archived event leaves every other tab and collects under Archived.
  // Of the rest: a draft or one sent back is a draft; anything submitted,
  // approved or published is upcoming until it is over, then past.
  const groups = useMemo(() => {
    const active = events.filter((e) => !e.archived);
    const rank: Record<Relation, number> = { mine: 0, helping: 1, other: 2 };
    const submitted = active.filter(
      (e) => e.status === "pending" || e.status === "approved" || e.status === "published",
    );
    return {
      upcoming: submitted.filter((e) => !isOver(e, now)).sort(byStartSoonest),
      // Yours first, then the ones you help plan, then everybody else's. The
      // hook hands them over newest change first, and the sort keeps that.
      drafts: active
        .filter((e) => e.status === "draft" || e.status === "rejected")
        .sort((a, b) => rank[relationOf(a)] - rank[relationOf(b)]),
      past: submitted.filter((e) => isOver(e, now)).sort(byStartLatest),
      cancelled: active.filter((e) => e.status === "cancelled").sort(byStartLatest),
      archived: events.filter((e) => e.archived).sort(byStartLatest),
    } satisfies Record<TabKey, EventDoc[]>;
  }, [events, now, relationOf]);

  // What an approver has to act on, wherever its date puts it.
  const waiting = useMemo(
    () => events.filter((e) => !e.archived && e.status === "pending"),
    [events],
  );

  const tabs: SectionTab[] = [
    { key: "upcoming", label: "Upcoming", count: groups.upcoming.length },
    { key: "drafts", label: "Drafts", count: groups.drafts.length },
    { key: "past", label: "Past", count: groups.past.length },
    // These two are here only while they hold something, as their sections were.
    ...(groups.cancelled.length > 0
      ? [{ key: "cancelled", label: "Cancelled", count: groups.cancelled.length }]
      : []),
    ...(groups.archived.length > 0
      ? [{ key: "archived", label: "Archived", count: groups.archived.length }]
      : []),
  ];
  // A tab that has just emptied (the last cancelled event was archived, say)
  // is gone from the strip, so the page falls back to the first one.
  const current: TabKey = tabs.some((t) => t.key === tab) ? tab : "upcoming";
  const all = groups[current];
  const rows = showAll ? all : all.slice(0, ROWS_AT_FIRST);

  return (
    <div className={styles.page}>
      <PageHead
        title="Manage events"
        description="Every NAISI event, including drafts."
        actions={
          canDraft ? (
            <Link href="/events/manage/new" className={styles.buttonLink}>
              <Button tabIndex={-1} leading={<PlusIcon />}>
                New event
              </Button>
            </Link>
          ) : undefined
        }
      />

      {error && (
        <Notice tone="warning" role="alert" title="The events didn’t load.">
          {error.message}
        </Notice>
      )}

      {canApprove && waiting.length > 0 && (
        <Notice
          tone="warning"
          title={
            waiting.length === 1
              ? "1 event is waiting for your approval."
              : `${waiting.length} events are waiting for your approval.`
          }
        >
          <ul className={styles.waitingList}>
            {waiting.map((e) => (
              <li key={e.id}>
                <Link href={`/events/manage/${e.id}`}>{e.title || "Untitled event"}</Link>
                {e.authorDisplayName ? `, from ${e.authorDisplayName}` : ""}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <SectionTabs
        tabs={tabs}
        current={current}
        onSelect={(key) => {
          setTab(key as TabKey);
          setShowAll(false);
        }}
        ariaLabel="Sections"
      />

      {loading ? (
        <p className={styles.quiet} aria-busy="true">
          Loading events…
        </p>
      ) : all.length === 0 ? (
        <EmptyTab tab={current} canDraft={canDraft} />
      ) : (
        <>
          <div className={styles.tableCard}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.colEvent}>
                      Event
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Sign-ups</th>
                    <th scope="col">Running it</th>
                    <th scope="col">
                      <span className="visually-hidden">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      relation={relationOf(e)}
                      canApprove={canApprove}
                      canSeeAttendees={canSeeAttendees}
                      thisYear={yearOf(now)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {all.length > rows.length && (
            <div>
              <Button variant="secondary" onClick={() => setShowAll(true)}>
                Show all {all.length}
              </Button>
            </div>
          )}
        </>
      )}

      <Notice tone="neutral" role="note">
        {canApprove
          ? "An event goes public once you or another approver approves it and publishes it."
          : canDraft
            ? "An approver checks each event before it goes public."
            : "You can open every event here, and edit the ones you’ve been added to."}
      </Notice>
    </div>
  );
}

function EventRow({
  event: e,
  relation,
  canApprove,
  canSeeAttendees,
  thisYear,
}: {
  event: EventDoc;
  relation: Relation;
  canApprove: boolean;
  canSeeAttendees: boolean;
  thisYear: string;
}) {
  const href = `/events/manage/${e.id}`;
  const title = e.title || "Untitled event";
  const tile = e.startAt ? tileParts(e.startAt) : null;
  const year = e.startAt && yearOf(e.startAt) !== thisYear ? yearOf(e.startAt) : null;
  // "Manage" where this person runs the event or approves events; "View"
  // where they can only look. Both open the same page, which decides again
  // what they may change.
  const manages = relation !== "other" || canApprove;

  return (
    <tr>
      <td className={styles.cellEvent}>
        <div className={styles.event}>
          {tile ? (
            <DateTile
              weekday={tile.weekday}
              day={tile.day}
              month={tile.month}
              dateTime={tile.dateTime}
            />
          ) : (
            <span className={styles.noDate} aria-hidden="true">
              <span>No</span>
              <span>date</span>
            </span>
          )}
          <div className={styles.eventWords}>
            <Link href={href} className={styles.eventTitle}>
              {title}
            </Link>
            <div className={styles.eventWhen}>
              {e.startAt ? (
                <>
                  {clockWords(e.startAt)}
                  {year ? `, ${year}` : ""}
                </>
              ) : (
                "No date yet"
              )}
            </div>
            {e.status === "rejected" && e.reviewerNotes && (
              <p className={styles.sentBack}>
                <span className={styles.sentBackLabel}>Why it came back: </span>
                {e.reviewerNotes}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className={styles.cellStatus}>
        <span className={styles.chips}>
          <Chip tone={statusTone(e.status)} dot className={styles.state}>
            {STATUS_WORDS[e.status]}
          </Chip>
          {e.archived && (
            <Chip tone="neutral" className={styles.state}>
              Archived
            </Chip>
          )}
        </span>
      </td>
      <td className={styles.cellSignups}>
        <SignUps event={e} canSeeAttendees={canSeeAttendees} />
      </td>
      <td className={styles.cellRunning}>
        <div className={styles.person}>
          <InitialsChip name={e.authorDisplayName?.trim() || "NAISI member"} uid={e.authorUid} />
          <div className={styles.personWords}>
            <span className={styles.personName}>
              <MemberName name={e.authorDisplayName} />
            </span>
            {relation !== "other" && (
              <span className={styles.personNote}>
                {relation === "mine" ? "You" : "You help plan it"}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className={styles.cellOpen}>
        <Link href={href} className={styles.open} aria-label={`${manages ? "Manage" : "View"} ${title}`}>
          <span>{manages ? "Manage" : "View"}</span>
          <ChevronIcon />
        </Link>
      </td>
    </tr>
  );
}

/**
 * What the Sign-ups column says for one event.
 *
 * A count is shown only where this person is already shown it: "22 of 60" is
 * what the public event page prints for an event with a number of places, and
 * a count with no number of places is on the attendee list alone, so it is
 * here for the people that list is for.
 */
function SignUps({
  event: e,
  canSeeAttendees,
}: {
  event: EventDoc;
  canSeeAttendees: boolean;
}) {
  if (e.noSignup) return <span className={styles.quietCell}>No sign-up needed</span>;
  if (e.status === "cancelled") return <span className={styles.quietCell}>Closed</span>;
  if (e.status !== "published") return <span className={styles.quietCell}>Not open yet</span>;

  const confirmed = e.rsvpCountConfirmed ?? 0;
  const account = e.visibility === "members" && (
    <div className={styles.signupsNote}>Account needed</div>
  );
  if (e.capacity !== null) {
    return (
      <div className={styles.signups}>
        <div>
          {confirmed} of {e.capacity}
        </div>
        <ProgressBar
          value={confirmed}
          max={e.capacity}
          size="sm"
          ariaLabel={`${confirmed} of ${e.capacity} places taken`}
        />
        {account}
      </div>
    );
  }
  return (
    <div className={styles.signups}>
      <div>{canSeeAttendees ? `${confirmed} signed up` : "No limit on places"}</div>
      {account}
    </div>
  );
}

function EmptyTab({ tab, canDraft }: { tab: TabKey; canDraft: boolean }) {
  const words: Record<TabKey, { title: string; body?: string }> = {
    upcoming: {
      title: "Nothing coming up.",
      body: "An event shows here once it has been sent for approval.",
    },
    drafts: {
      title: "No drafts.",
      body: canDraft
        ? "Start one with New event. Nothing is public until it has been approved and published."
        : "Starting an event needs the permission to draft events, which an admin gives.",
    },
    past: { title: "No past events yet.", body: "An event moves here once it is over." },
    cancelled: { title: "No cancelled events." },
    archived: { title: "Nothing archived." },
  };
  return <EmptyState title={words[tab].title} body={words[tab].body} />;
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
