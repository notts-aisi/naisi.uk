"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import DateTile from "@/components/ui/DateTile";
import PageHead from "@/components/ui/PageHead";
import ProgressBar from "@/components/ui/ProgressBar";
import { usePendingCount } from "@/features/admin/usePendingCount";
import MyCoursesSummary from "@/features/courses/MyCoursesSummary";
import { useMyRuns } from "@/features/courses/useMyRuns";
import { useSiteNoticeState } from "@/features/maintenance/useSiteNotice";
import { useDrafts } from "@/features/newsletter/useDrafts";
import MyWorkSummary from "@/features/tasks/components/MyWorkSummary";
import { useTasks } from "@/features/tasks/hooks/useTasks";
import { formatSiteDate, isSameSiteDay } from "@/lib/datetime/siteTime";
import { ChevronRight } from "./icons";
import type { HomeEvent } from "./homeData";
import { firstName } from "./homeWords";
import styles from "./home.module.css";

/**
 * Home for an admin: what needs them, the state of the site, and this week.
 *
 * Every figure is one an admin's own pages already read, asked for the same
 * way: the count of join requests, the email log, the scheduler's state, the
 * site notice, the newsletter drafts and the committee's tasks. The page
 * checks the role on the server before it draws this, and each of those reads
 * refuses anybody else on its own account.
 *
 * WHERE A FIGURE HAS NO READ A PAGE CAN MAKE, THE ROW HAS NO FIGURE. How many
 * applications are waiting for a lead is worked out on the server for the
 * term's own page, so the applications row here is a sentence and a link.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BOUNCE_WINDOW_DAYS = 7;
/** The most rows the email log hands over in one answer. */
const LOG_ROWS = 200;

type SendRow = { status?: string; sentAt?: string | null };

type Bounces = { count: number; atLeast: boolean } | null;

/**
 * Emails that bounced in the last week, counted from the newest rows of the
 * email log. When the log's answer does not reach back a whole week (a big
 * send filled it), the count is a floor and says so.
 */
function useBounces(): Bounces {
  const [bounces, setBounces] = useState<Bounces>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/admin/deliverability/sends?limit=${LOG_ROWS}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        return (await res.json()) as { items?: SendRow[] };
      })
      .then((body) => {
        if (!live) return;
        const items = Array.isArray(body.items) ? body.items : [];
        const since = Date.now() - BOUNCE_WINDOW_DAYS * DAY_MS;
        const sentAt = (row: SendRow) => (row.sentAt ? Date.parse(row.sentAt) : Number.NaN);
        const recent = items.filter((row) => sentAt(row) >= since);
        setBounces({
          count: recent.filter((row) => row.status === "bounced").length,
          atLeast: items.length >= LOG_ROWS && recent.length === items.length,
        });
      })
      .catch(() => {
        if (live) setBounces(null);
      });
    return () => {
      live = false;
    };
  }, []);
  return bounces;
}

type SchedulerState = {
  enabled: boolean;
  receipts: {
    startedAt: string | null;
    finishedAt: string | null;
    skipped: string | null;
    jobs: { error: string | null }[];
  }[];
  failedMarkers: unknown[];
};

type Jobs =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "off" }
  | { kind: "none" }
  | { kind: "failed"; count: number; at: Date | null }
  | { kind: "ran"; at: Date | null };

/** What the scheduler's own page would say first, in one phrase. */
function useScheduledJobs(): Jobs {
  const [jobs, setJobs] = useState<Jobs>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/scheduler", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        return (await res.json()) as Partial<SchedulerState>;
      })
      .then((state) => {
        if (!live) return;
        if (state.enabled !== true) return setJobs({ kind: "off" });
        const latest = Array.isArray(state.receipts) ? state.receipts[0] : undefined;
        if (!latest) return setJobs({ kind: "none" });
        const stamp = latest.finishedAt ?? latest.startedAt;
        const at = stamp ? new Date(stamp) : null;
        const failed =
          latest.jobs.filter((job) => job.error !== null).length +
          (Array.isArray(state.failedMarkers) ? state.failedMarkers.length : 0);
        setJobs(failed > 0 ? { kind: "failed", count: failed, at } : { kind: "ran", at });
      })
      .catch(() => {
        if (live) setJobs({ kind: "unknown" });
      });
    return () => {
      live = false;
    };
  }, []);
  return jobs;
}

/** "Today 09:00", or "Tue 6 Oct, 09:00" for another day. */
function whenRan(at: Date | null, now: number): string {
  if (!at || Number.isNaN(at.getTime())) return "";
  const clock = formatSiteDate(at, { hour: "2-digit", minute: "2-digit" });
  return isSameSiteDay(at, new Date(now))
    ? `Today ${clock}`
    : `${formatSiteDate(at, { weekday: "short", day: "numeric", month: "short" })}, ${clock}`;
}

function lateBy(due: Date, now: number): string {
  const days = Math.max(1, Math.round((now - due.getTime()) / DAY_MS));
  return days === 1 ? "a day late" : `${days} days late`;
}

type ToDo = {
  key: string;
  figure: string | null;
  title: string;
  line: string;
  action: string;
  href: string;
};

type Facts = {
  /** The admin's first name, for the greeting. */
  given: string;
  /** "Morning", "Afternoon" or "Evening", by the site's clock. */
  greeting: string;
  /** Whether the term's form has applications to read: open, or closed and undecided. */
  applicationsInHand: boolean;
  /** "Fri 23 Oct", when the term's form names a decisions day. */
  decisionsBy: string | null;
  weekRange: string;
  weekEvents: HomeEvent[];
  /** The instants this London week starts and ends, as ISO strings. */
  weekStartsAt: string;
  weekEndsAt: string;
  /** Server-rendered: the admin's own applications, when they have any. */
  applications: ReactNode;
};

export default function HomeAdmin({
  given,
  greeting,
  applicationsInHand,
  decisionsBy,
  weekRange,
  weekEvents,
  weekStartsAt,
  weekEndsAt,
  applications,
}: Facts) {
  const pending = usePendingCount();
  const bounces = useBounces();
  const jobs = useScheduledJobs();
  const { notice, connection } = useSiteNoticeState();
  const { drafts } = useDrafts();
  const { tasks } = useTasks({ visibility: "committee", includeArchived: false });
  const myRuns = useMyRuns();
  // The clock as this page was opened. Read once, so a render is the same
  // however many times it runs.
  const [now] = useState(() => Date.now());

  const todo: ToDo[] = [];
  if (pending > 0) {
    todo.push({
      key: "join",
      figure: String(pending),
      title: pending === 1 ? "Join request" : "Join requests",
      line: "People waiting for the committee to approve their account.",
      action: "Review",
      href: "/admin",
    });
  }
  if (applicationsInHand) {
    todo.push({
      key: "applications",
      figure: null,
      title: "Applications to read",
      line: decisionsBy ? `Decisions are due ${decisionsBy}.` : "This term’s form has applications in.",
      action: "Open",
      href: "/admin/admissions/forms",
    });
  }
  if (bounces && bounces.count > 0) {
    todo.push({
      key: "bounces",
      figure: `${bounces.count}${bounces.atLeast ? "+" : ""}`,
      title: bounces.count === 1 ? "Bounced email" : "Bounced emails",
      line:
        bounces.count === 1
          ? `1 email didn’t arrive in the last ${BOUNCE_WINDOW_DAYS} days.`
          : `${bounces.count} emails didn’t arrive in the last ${BOUNCE_WINDOW_DAYS} days.`,
      action: "See which",
      href: "/admin/deliverability",
    });
  }

  // The newsletter that is waiting on somebody: approved and not sent comes
  // before one still waiting to be checked.
  const draft = useMemo(
    () =>
      drafts.find((d) => d.status === "approved" && !d.sentAt) ??
      drafts.find((d) => d.status === "pending") ??
      null,
    [drafts],
  );

  const week = useMemo(() => {
    const from = Date.parse(weekStartsAt);
    const to = Date.parse(weekEndsAt);
    const open = tasks.filter((t) => t.status !== "done" && !t.archived);
    const due = open.filter((t) => {
      const at = t.dueDate?.getTime();
      return at !== undefined && at >= from && at < to;
    });
    const late = open
      .filter((t) => t.dueDate && t.dueDate.getTime() < now)
      .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
    return { due: due.length, late };
  }, [tasks, weekStartsAt, weekEndsAt, now]);

  const needs =
    todo.length === 0
      ? "Nothing needs you today."
      : todo.length === 1
        ? "1 thing needs you today."
        : `${todo.length} things need you today.`;

  return (
    <>
      <PageHead title={given ? `${greeting}, ${given}.` : `${greeting}.`} description={needs} />

      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="home-todo">
            <div className={styles.cardHead}>
              <h2 id="home-todo" className={styles.cardTitle}>
                To do
                {todo.length > 0 && <Chip tone="neutral">{todo.length}</Chip>}
              </h2>
            </div>
            {todo.length === 0 ? (
              <p className={styles.quiet}>Nothing is waiting on you.</p>
            ) : (
              <ul className={styles.todo} role="list">
                {todo.map((item, index) => (
                  <li key={item.key} className={styles.todoRow}>
                    <span className={styles.todoFigure} aria-hidden={item.figure === null}>
                      {item.figure ?? ""}
                    </span>
                    <div className={styles.todoBody}>
                      <h3 className={styles.todoTitle}>{item.title}</h3>
                      <p className={styles.small}>{item.line}</p>
                    </div>
                    <Link href={item.href} className={index === 0 ? styles.primary : styles.secondary}>
                      {item.action}
                      <ChevronRight />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.card} aria-labelledby="home-site">
            <div className={styles.cardHead}>
              <h2 id="home-site" className={styles.cardTitle}>
                Site
              </h2>
            </div>
            <ul className={styles.site} role="list">
              <li className={styles.siteRow}>
                <h3 className={styles.siteName}>Site notice</h3>
                <span className={styles.siteState}>
                  {connection === "loading" ? null : connection === "error" ? (
                    <Chip tone="neutral">Couldn’t check</Chip>
                  ) : notice.bannerVisible ? (
                    <Chip tone="warning" dot>
                      A notice is showing
                    </Chip>
                  ) : (
                    <Chip tone="neutral" dot>
                      No notice showing
                    </Chip>
                  )}
                </span>
                <Link href="/admin/site-status" className={styles.textLink}>
                  Change
                  <span className={styles.srOnly}> the site notice</span>
                  <ChevronRight />
                </Link>
              </li>
              <li className={styles.siteRow}>
                <h3 className={styles.siteName}>Scheduled jobs</h3>
                <span className={styles.siteState}>
                  {jobs.kind === "ran" && (
                    <Chip tone="success" dot>
                      All scheduled jobs ran
                    </Chip>
                  )}
                  {jobs.kind === "failed" && (
                    <Chip tone="warning" dot>
                      {jobs.count === 1 ? "1 thing failed" : `${jobs.count} things failed`}
                    </Chip>
                  )}
                  {jobs.kind === "off" && (
                    <Chip tone="neutral" dot>
                      Scheduled jobs are off
                    </Chip>
                  )}
                  {jobs.kind === "none" && <Chip tone="neutral">Nothing has run yet</Chip>}
                  {jobs.kind === "unknown" && <Chip tone="neutral">Couldn’t check</Chip>}
                  {(jobs.kind === "ran" || jobs.kind === "failed") && whenRan(jobs.at, now) && (
                    <span className={styles.siteWhen}>{whenRan(jobs.at, now)}</span>
                  )}
                </span>
                <Link href="/admin/site-status" className={styles.textLink}>
                  Open
                  <span className={styles.srOnly}> the scheduled jobs</span>
                  <ChevronRight />
                </Link>
              </li>
            </ul>
          </section>

          {applications}
          <MyCoursesSummary runs={myRuns.runs} loading={myRuns.loading} error={myRuns.error} />
          <MyWorkSummary />
        </div>

        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="home-week">
            <div className={styles.weekHead}>
              <h2 id="home-week" className={styles.cardTitle}>
                This week
              </h2>
              {weekRange && <p className="meta">{weekRange}</p>}
            </div>

            {weekEvents.length === 0 ? (
              <p className={styles.quiet}>No events this week.</p>
            ) : (
              <ul className={styles.weekEvents} role="list">
                {weekEvents.map((event) => (
                  <li key={event.eventId} className={styles.weekEvent}>
                    <DateTile
                      size="sm"
                      weekday={event.tile.weekday}
                      day={event.tile.day}
                      month={event.tile.month}
                      dateTime={event.startsAt}
                    />
                    <div className={styles.weekEventBody}>
                      <h3 className={styles.eventTitle}>
                        <Link href={`/events/manage/${encodeURIComponent(event.eventId)}`}>
                          {event.title}
                        </Link>
                      </h3>
                      <p className={styles.weekEventLine}>
                        <span>
                          {event.dropIn
                            ? "No sign-up needed"
                            : event.limit !== null
                              ? `${event.signedUp} of ${event.limit} signed up`
                              : `${event.signedUp} signed up`}
                        </span>
                        <span>{event.clock}</span>
                      </p>
                      {!event.dropIn && event.limit !== null && (
                        <ProgressBar
                          value={event.signedUp}
                          max={event.limit}
                          size="sm"
                          ariaLabel={`Places taken at ${event.title}`}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {draft && (
              <div className={styles.weekBlock}>
                <p className="meta">Newsletter</p>
                <h3 className={styles.weekBlockTitle}>{draft.subject || "Untitled newsletter"}</h3>
                <p className={styles.small}>
                  {draft.status === "approved"
                    ? "It’s approved and ready to send."
                    : draft.authorDisplayName
                      ? `${firstName(draft.authorDisplayName)} has finished it. It’s ready for you to check and send.`
                      : "It’s ready for you to check and send."}
                </p>
                <div>
                  <Link href={`/newsletter/${encodeURIComponent(draft.id)}`} className={styles.secondary}>
                    Check and send
                    <ChevronRight />
                  </Link>
                </div>
              </div>
            )}

            <div className={styles.weekBlock}>
              <p className="meta">Committee tasks</p>
              <h3 className={styles.weekBlockTitle}>
                {week.due === 0 ? "Nothing due this week" : `${week.due} due this week`}
              </h3>
              {week.late.length > 0 && week.late[0].dueDate && (
                <p className={styles.small}>
                  “{week.late[0].title}” is {lateBy(week.late[0].dueDate, now)}.
                </p>
              )}
              <div>
                <Link href="/committee/tasks" className={styles.secondary}>
                  Committee tasks
                  <ChevronRight />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
