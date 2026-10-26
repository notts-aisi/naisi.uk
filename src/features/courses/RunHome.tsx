"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import PageEnter from "@/components/motion/PageEnter";
import { firstName, tilePartsOfDay } from "@/app/(app)/dashboard/homeWords";
import FacilitatorGroupPanel from "./FacilitatorGroupPanel";
import { ticketFacts } from "./sessionChange/cardFacts";
import SessionNotice from "./sessionChange/SessionNotice";
import RunUpdates from "./updates/RunUpdates";
import { useRunOverview } from "./useRunOverview";
import { useSyncTasks } from "./useSyncTasks";
import SessionTicket from "./weekly/SessionTicket";
import ThisWeekCard from "./weekly/ThisWeekCard";
import WeekList from "./weekly/WeekList";
import YourGroup from "./weekly/YourGroup";
import { useMaterialTicks } from "./weekly/useMaterialTicks";
import { weekRowsOf } from "./weekly/weekRows";
import { LEAVE_LINK } from "@/lib/courses/leavingWords";
import { ENDED_SUB, FINISHED_SUB, hasEnded, youFinished } from "@/lib/courses/finishing/words";
import {
  MARKS_LEGEND_LABEL,
  MARKS_LINE,
  MARK_LETTER,
  MARK_STATE_WORDS,
  NOT_YET_MARK,
  YOUR_MARKS,
  groupLineWords,
  hoursWords,
  kindAndTermWords,
  markWords,
  opensWords,
  sessionEyebrow,
  weekOfWords,
  withWords,
} from "@/lib/courses/memberPageWords";
import { slotWords } from "@/lib/courses/sessionChange/words";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { londonDateKey } from "@/lib/courses/weekPlan";
import type { OverviewPayload, OverviewWeekSchedule } from "@/app/api/courses/runs/[runId]/overview/route";
import weekly from "./weekly/weekly.module.css";
import styles from "./RunHome.module.css";

/**
 * THE PROGRAMME HOME: where am I, what do I do next, who am I doing it with
 * (boards st-programme before the first session and wk-programme once it has
 * started, at 1440 and on a phone).
 *
 * One data source, `/api/courses/runs/[runId]/overview`, drives the page; the
 * member's own ticks are live (`useMaterialTicks`), and their group's names
 * come from the group's roster route (`YourGroup`).
 *
 * WHAT A MEMBER TAKING PART SEES, in the boards' order: the head (the
 * programme, their group with its day, time and room, with whom), the next
 * session's ticket (tonight, a room changed this week, a session moved or
 * cancelled as "Change a session" says), "This week" (or before the first
 * session, week 1's readings to tick), the weeks with their dates and states
 * and when the next one opens (C17), their marks with no count (C26), the
 * updates, their group, and the way out.
 *
 * "Add to calendar" is on the ticket for somebody whose group it is, taking
 * part or facilitating (st-calendar-phone: their own calendar link).
 *
 * WHAT IS NOT HERE, though the boards draw it: "Can’t make it" on the ticket.
 * It does not exist yet, and the page draws no control for a feature that
 * does not.
 *
 * STAFF (a facilitator, an admin) read the same head, ticket and weeks, every
 * published week open, with their own panels below; no marks, no ticks.
 */

type Props = {
  runId: string;
  /** From the server gate, not from the payload's `access` mirror: whether the admissions panel renders. */
  isAdmin: boolean;
  /**
   * Whether this member may address the WHOLE cohort: a run facilitator, a
   * track lead, or an admin. From the server gate for the same reason
   * `isAdmin` is: the payload's `access.isFacilitator` is true for someone who
   * merely holds one GROUP of the run, and a group facilitator is exactly who
   * this lane excludes. A link gate; `/learn/[runId]/email` re-derives it and
   * the send route is the boundary.
   */
  canEmailCohort: boolean;
  /**
   * Pitching week's card, worked out by the server page for somebody taking
   * part (`pitchingCard`): its line, and whether pitching is still open. Null
   * draws nothing.
   */
  pitching?: { lede: string; open: boolean } | null;
  /**
   * Whether "Leave the programme" is drawn at the foot (wk-programme): the
   * server page asks the leave route's own rule (`leavePathFor`), so the link
   * is there exactly where the press would work.
   */
  canLeave?: boolean;
  /** The session's own uid, from the server gate: the ticks' row, and "(you)" in the group. */
  uid?: string | null;
};

// ---------------------------------------------------------------------------
// The head's line under the title
// ---------------------------------------------------------------------------

/** The hero's sentence while there is no week to show: no date, a break, or the end. */
function stateCopy(overview: OverviewPayload): { heading: string; line: string } | null {
  const { run, currentWeek } = overview;
  if (!currentWeek) {
    return {
      heading: "Not scheduled yet",
      line: "This run doesn't have a start date yet. It'll show up here the moment it's timetabled.",
    };
  }
  // After the last week. "You finished" only where the member's own finished
  // record says so (`overview.finished`, the one answer every page asks);
  // everybody else, staff included, is told the course has ended, and nothing
  // here claims they finished it.
  if (currentWeek.phase === "after") {
    const name = run.courseTitle.trim() || "This course";
    return overview.finished
      ? { heading: youFinished(name), line: FINISHED_SUB }
      : { heading: hasEnded(name), line: ENDED_SUB };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function RunHomeSkeleton() {
  return (
    <div className={weekly.programme}>
      <div className={weekly.head}>
        <Skeleton width="12rem" height="0.875rem" ariaLabel="Loading this course…" />
        <Skeleton width="20rem" height="2.25rem" ariaLabel="" />
        <Skeleton width="24rem" height="1.25rem" ariaLabel="" />
      </div>
      <div className={styles.stack}>
        <Skeleton width="100%" height="10rem" radius="var(--radius-lg)" ariaLabel="" />
        <Skeleton width="100%" height="8rem" radius="var(--radius-lg)" ariaLabel="" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your marks (C26): one per session, a legend, and no count
// ---------------------------------------------------------------------------

type MarkKind = AttendanceStatus | "not-yet" | "not-marked" | "cancelled" | "did-not-happen";

const MARK_ORDER: MarkKind[] = [
  "present",
  "late",
  "left-early",
  "excused",
  "absent",
  "not-marked",
  "cancelled",
  "did-not-happen",
  "not-yet",
];

const MARK_CLASS: Record<MarkKind, string> = {
  present: weekly.markHere,
  late: weekly.markHere,
  "left-early": weekly.markHere,
  excused: weekly.markExcused,
  absent: weekly.markAway,
  "not-marked": weekly.markNone,
  cancelled: weekly.markNone,
  "did-not-happen": weekly.markNone,
  "not-yet": "",
};

function markWord(kind: MarkKind): string {
  return kind in MARK_LETTER ? ATTENDANCE_STATUS_LABEL[kind as AttendanceStatus] : MARK_STATE_WORDS[kind as keyof typeof MARK_STATE_WORDS];
}

function markGlyph(kind: MarkKind): string {
  if (kind in MARK_LETTER) return MARK_LETTER[kind as AttendanceStatus];
  return kind === "not-yet" ? NOT_YET_MARK : "";
}

/** "3 Nov", the date under a mark: upper case by the stylesheet. */
function shortDay(dateKey: string): string {
  const parts = tilePartsOfDay(dateKey);
  return parts ? `${parts.day} ${parts.month}` : "";
}

/**
 * THE MEMBER'S OWN MARKS: one per session of their group's, from the week
 * they joined, and a legend. Nothing here counts them, says "in full", or
 * says how many they came to: a member is never shown a target.
 *
 * A mark shows once its register is finished, which the route decides
 * (`ownAttendance?.sessions` holds finished registers only); until then the
 * session is "Not yet". A session cancelled through "Change a session" reads
 * as cancelled from the group's own record, and a register that says the
 * session did not happen says so.
 */
function YourMarks({
  ownAttendance,
  schedule,
  joinedWeekNumber,
  nextDateKey,
  className,
}: {
  ownAttendance: OverviewPayload["ownAttendance"];
  schedule: OverviewWeekSchedule[];
  joinedWeekNumber: number;
  nextDateKey: string | null;
  className?: string;
}) {
  const marks = ownAttendance?.sessions ?? [];
  const byWeek = new Map<number, (typeof marks)[number]>();
  for (const session of marks) {
    if (!byWeek.has(session.weekNumber)) byWeek.set(session.weekNumber, session);
  }
  const rows = schedule
    .filter((week) => week.weekNumber >= Math.max(1, joinedWeekNumber))
    .map((week) => {
      const session = byWeek.get(week.weekNumber);
      const kind: MarkKind = week.cancelled
        ? "cancelled"
        : !session
          ? "not-yet"
          : !session.held
            ? "did-not-happen"
            : (session.status ?? "not-marked");
      return { week, kind, dateKey: week.dateKey || session?.dateKey || "" };
    });
  const used = new Set(rows.map((row) => row.kind));

  return (
    <section className={[weekly.card, className ?? ""].filter(Boolean).join(" ")} aria-labelledby="your-marks">
      <div className={`${weekly.cardHead} ${weekly.cardHeadSpaced}`}>
        <h2 id="your-marks" className={weekly.cardTitle}>
          {YOUR_MARKS}
        </h2>
      </div>
      {ownAttendance === null ? (
        /* No group yet: there is no session, no register and no facilitator
           to name. Allocation is what happens next, so that is what it says. */
        <p className={weekly.cardLine}>You’ll be placed in a group soon. Your marks appear here after that.</p>
      ) : (
        <>
          {rows.length > 0 && (
            <ol className={weekly.marks} role="list">
              {rows.map(({ week, kind, dateKey }) => (
                <li key={week.weekNumber} className={weekly.markItem}>
                  <span
                    className={[weekly.markBox, MARK_CLASS[kind]].filter(Boolean).join(" ")}
                    role="img"
                    aria-label={markWords(week.weekNumber, dateKey, markWord(kind))}
                    title={markWord(kind)}
                  >
                    {markGlyph(kind)}
                  </span>
                  <span
                    className={dateKey && dateKey === nextDateKey ? `${weekly.markDate} ${weekly.markDateNext}` : weekly.markDate}
                    aria-hidden="true"
                  >
                    {shortDay(dateKey) || `W${week.weekNumber}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {used.size > 0 && (
            <ul className={weekly.legend} aria-label={MARKS_LEGEND_LABEL}>
              {MARK_ORDER.filter((kind) => used.has(kind)).map((kind) => (
                <li key={kind} className={weekly.legendItem}>
                  <span className={[weekly.markBox, weekly.markSmall, MARK_CLASS[kind]].filter(Boolean).join(" ")} aria-hidden="true">
                    {markGlyph(kind)}
                  </span>
                  {markWord(kind)}
                </li>
              ))}
            </ul>
          )}
          <p className={`${weekly.cardLine} ${weekly.marksLine}`}>{MARKS_LINE}</p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// RunHome
// ---------------------------------------------------------------------------

export default function RunHome({
  runId,
  isAdmin,
  canEmailCohort,
  pitching = null,
  canLeave = false,
  uid = null,
}: Props) {
  const { data, error, reload } = useRunOverview(runId);
  const [tickFailed, setTickFailed] = useState(false);

  /*
    The groups the caller FACILITATES, not merely the group on the payload.
    The overview sends every group this caller holds: their learner placement
    first (if they have one), then each group they facilitate. Their placement
    is their seat, not their post, so it is subtracted here.
  */
  const placementGroupId = data?.enrolment?.groupId ?? null;
  const facilitatedGroups = data?.access.isFacilitator
    ? data.groups.filter((g) => g.id !== placementGroupId)
    : [];

  // Somebody taking part, on an active enrolment, ticks; nobody else does.
  const learner = data?.enrolment?.role === "learner" ? data.enrolment : null;
  // Before the reader's group first meets (st-programme): the run's calendar
  // may have begun, but this group's first session is still to come.
  const firstNext = data?.group?.calendar.nextSession ?? null;
  const beforeStart =
    data?.currentWeek?.phase === "before" ||
    (firstNext !== null && firstNext.dateKey === data?.group?.calendar.firstSessionDate);
  const ticks = useMaterialTicks(runId, uid, 1, learner?.status === "active");

  /*
    P10, the primary mirror trigger. The gate is an ACTIVE ENROLMENT, the
    sync-tasks route's own: learner or facilitator, and nothing else. The
    anchor week is dedupe key material only (see useSyncTasks): never sent.
  */
  useSyncTasks(
    runId,
    data?.enrolment?.status === "active",
    data?.currentWeek?.anchorWeekNumber ?? null,
  );

  if (!data) {
    if (error) {
      return (
        <div className={styles.page}>
          <EmptyState
            title="Couldn't load this course"
            body={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        </div>
      );
    }
    return <RunHomeSkeleton />;
  }

  const { run, currentWeek, group, access } = data;
  const now = new Date();
  const todayKey = londonDateKey(now);
  const programmeName = data.programme?.name || run.courseTitle;
  const state = stateCopy(data);

  // The week this card is about: this week by the reader's own group's
  // calendar, read off THE CARD'S OWN GROUP so a facilitator of one group and
  // a member of it read the same week.
  const cardCurrentWeek = group?.calendar.currentWeek ?? null;
  const calendarWeek = cardCurrentWeek ?? currentWeek;
  const thisWeekNumber = beforeStart
    ? (firstNext?.weekNumber ?? 1)
    : calendarWeek
      ? calendarWeek.phase === "before"
        ? 1
        : (calendarWeek.weekNumber ?? calendarWeek.anchorWeekNumber)
      : 0;
  const thisSchedule = data.weekSchedule.find((week) => week.weekNumber === thisWeekNumber) ?? null;
  const thisDoc = data.weeks.find((week) => week.weekNumber === thisWeekNumber) ?? null;

  // The next session's ticket: its own day, time, room and link.
  const facts = group ? ticketFacts(group) : null;
  const facilitatorPeople = (group?.facilitatorNames ?? []).map((name, index) => ({
    uid: `${group?.id ?? "group"}-${index}`,
    name,
    firstName: firstName(name) || name,
  }));
  const factsSchedule = facts ? data.weekSchedule.find((week) => week.weekNumber === facts.weekNumber) : undefined;
  const ticketIsToday = facts !== null && facts.dateKey === todayKey;
  const firstSessionDate = group?.calendar.firstSessionDate ?? "";

  // The head's line: "Group B · Tuesdays 6pm · Room C20 · with Rahul and
  // Sofia", the group's USUAL slot and room: a week's own arrangement is the
  // ticket's to say.
  const groupLine = group
    ? groupLineWords({
        groupName: group.name,
        slot: slotWords(group.usualSlot.weekday, group.usualSlot.startTimeLocal),
        room: group.usualSlot.location,
        with: withWords(facilitatorPeople.map((person) => person.firstName)),
      })
    : "";

  const running = currentWeek?.phase === "running";
  const chip =
    running && currentWeek && !beforeStart
      ? currentWeek.breakLabel
        ? currentWeek.breakLabel
        : weekOfWords(currentWeek.weekNumber ?? currentWeek.anchorWeekNumber, run.totalWeeks)
      : null;

  const rows = weekRowsOf(
    data,
    group?.calendar.nextSession?.weekNumber ?? null,
    (ids) => ids.filter((id) => ticks.isDone(id)).length,
    now,
    beforeStart,
  );
  const weekSource = {
    groupId: data.enrolment?.groupId ?? group?.id ?? null,
    forkedWeekIds: data.forkedWeekIds,
  };

  const showAdmissions = access.isReviewer || access.isTrackLead || isAdmin;
  const publishedWeekNumbers = data.weeks.filter((w) => w.published).map((w) => w.weekNumber);
  const learnerGroup = learner && group && learner.groupId === group.id ? group : null;

  // The phone's order, card by card, as the boards draw it.
  const order = beforeStart
    ? { ticket: weekly.order1, week: weekly.order2, group: weekly.order3, updates: weekly.order4, weeks: weekly.order5 }
    : { ticket: weekly.order1, week: weekly.order2, updates: weekly.order3, marks: weekly.order4, weeks: weekly.order5, group: weekly.order6 };

  const ticket =
    group?.sessionNotice || facts ? (
      <div className={order.ticket}>
        <div className={styles.stack}>
          {group?.sessionNotice && <SessionNotice notice={group.sessionNotice} />}
          {facts && (
            <SessionTicket
              facts={facts}
              eyebrow={sessionEyebrow({
                isToday: ticketIsToday,
                isFirst: facts.dateKey === firstSessionDate,
                startTimeLocal: facts.startTimeLocal,
                weekNumbers: facts.weekNumbers,
              })}
              heading={sessionWhenLabel(
                { weekday: -1, startTimeLocal: facts.startTimeLocal, durationMinutes: facts.durationMinutes },
                facts.dateKey,
              ) || hoursWords(facts.startTimeLocal, facts.durationMinutes)}
              roomChanged={factsSchedule?.roomChanged === true}
              facilitators={facilitatorPeople}
              calendar={learnerGroup !== null || access.isFacilitator}
            />
          )}
        </div>
      </div>
    ) : null;

  const weekCard =
    learner && thisWeekNumber >= 1 && (running || beforeStart) ? (
      <ThisWeekCard
        className={order.week}
        runId={runId}
        variant={beforeStart ? "before-first" : "this-week"}
        weekNumber={thisWeekNumber}
        title={thisDoc?.title ?? ""}
        slotStartKey={thisSchedule?.slotStartKey || null}
        countableIds={thisDoc?.countableIds ?? []}
        thisWeek={thisDoc?.thisWeek ?? null}
        open={thisSchedule?.open ?? false}
        opens={thisSchedule?.opensAfter ? opensWords(thisSchedule.opensAfter, todayKey) : null}
        breakLabel={calendarWeek?.breakLabel ?? null}
        weekSource={weekSource}
        ticks={ticks}
        showTicks={learner !== null}
        onTickFailed={() => setTickFailed(true)}
      />
    ) : null;

  const weekList = (
    <WeekList
      className={order.weeks}
      runId={runId}
      rows={rows}
      beforeStart={beforeStart}
      progressHref={`/learn/${encodeURIComponent(runId)}/progress`}
      showProgress={learner !== null}
    />
  );

  const yourGroup =
    learnerGroup && learner ? (
      <YourGroup
        className={order.group}
        groupId={learnerGroup.id}
        groupName={learnerGroup.name}
        selfUid={uid}
        namesOnly={beforeStart}
      />
    ) : null;

  return (
    <PageEnter className={weekly.programme}>
      <div className={`${weekly.bar} ${weekly.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href="/learn" className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>My programmes</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>{programmeName}</div>
        <div className={weekly.barEnd} />
      </div>

      <header className={weekly.head}>
        {kindAndTermWords(data.programme?.kind ?? null, run.label) && (
          <p className={weekly.eyebrow}>{kindAndTermWords(data.programme?.kind ?? null, run.label)}</p>
        )}
        <div className={weekly.titleRow}>
          <h1 className={weekly.title}>{run.courseTitle || programmeName}</h1>
          {chip && <span className={weekly.weekChip}>{chip}</span>}
        </div>
        {groupLine && <p className={weekly.groupLine}>{groupLine}</p>}
        {state && (
          <>
            <p className={weekly.stateHeading}>{state.heading}</p>
            <p className={weekly.stateLine}>{state.line}</p>
          </>
        )}
      </header>

      {tickFailed && (
        <p className={weekly.tickError} role="alert">
          That tick didn’t save, so it has been undone. Check your connection and try again.
        </p>
      )}

      <div className={weekly.columns}>
        <div className={weekly.colMain}>
          {ticket}
          {weekCard}
          {!beforeStart && weekList}
        </div>

        <div className={weekly.colSide}>
          {pitching && (
            /* Pitching week, for somebody taking part, from the moment the week
               is published until the end of their group's session day in it. */
            <Card as="section" padding="md" className={`${styles.panel} ${weekly.order2}`}>
              <h3 className={styles.panelTitle}>Pitching week</h3>
              <p className={styles.panelNote}>{pitching.lede}</p>
              <Link className={styles.panelLink} href={`/learn/${encodeURIComponent(runId)}/pitching`}>
                {pitching.open ? "Pitch and pick" : "See the pitches"}
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </Card>
          )}

          {/* Learners only. A facilitator has no marks of their own, and an
              admin reading over the cohort's shoulder has no row on this run
              at all. `access.isEnrolled` covers a completed enrolment too: a
              finished cohort is the member's own history. */}
          {access.isEnrolled && !beforeStart && (
            <YourMarks
              className={order.marks}
              ownAttendance={data.ownAttendance}
              schedule={data.weekSchedule}
              joinedWeekNumber={data.enrolment?.joinedWeekNumber ?? 1}
              nextDateKey={facts?.dateKey ?? null}
            />
          )}

          {beforeStart && yourGroup}

          {/* Updates the people running the programme wrote to the reader
              (Q18), read by their own route: what the reader is shown is the
              route's decision, and a reader shown nothing is drawn nothing. */}
          <div className={order.updates}>
            <RunUpdates runId={runId} />
          </div>

          {!beforeStart && yourGroup}
          {beforeStart && weekList}

          {/* One card per group they facilitate. The cohort-wide links ride on
              the FIRST card only, because they address the run and not a room. */}
          {facilitatedGroups.map((facilitated, index) => (
            <div key={facilitated.id} className={weekly.order7}>
              <FacilitatorGroupPanel
                runId={runId}
                group={facilitated}
                publishedWeekNumbers={publishedWeekNumbers}
                showCohortLinks={canEmailCohort && index === 0}
              />
            </div>
          ))}

          {canEmailCohort && facilitatedGroups.length === 0 && (
            /* The same link as in the facilitator panel, for the people that
               panel never renders for: a run facilitator, track lead or admin
               who holds no group of their own. */
            <Card as="section" padding="md" className={`${styles.panel} ${weekly.order7}`}>
              <h3 className={styles.panelTitle}>Cohort announcements</h3>
              <p className={styles.panelNote}>
                One message to everyone subscribed to this run&apos;s channel. Announcements only: anything a single
                group needs goes out from that group&apos;s own page instead.
              </p>
              <Link className={styles.panelLink} href={`/learn/${encodeURIComponent(runId)}/email`}>
                Email the whole cohort
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </Link>
              {/* The weekly nudge lives in the same lane and behind the same
                  gate: prepared for you and sent by you. */}
              <Link className={styles.panelLink} href={`/learn/${encodeURIComponent(runId)}/nudge`}>
                Send this week&apos;s nudge
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </Card>
          )}

          {showAdmissions && (
            /* Reviewers, track leads and admins only. A plain learner must never
               see a route into the applications of the run they are sitting in. */
            <Card as="section" padding="md" className={`${styles.panel} ${weekly.order7}`}>
              <h3 className={styles.panelTitle}>Admissions</h3>
              <p className={styles.panelNote}>
                Applications to this run are reviewed in their own queue, separate from the cohort.
              </p>
              <Link className={styles.panelLink} href={`/learn/${encodeURIComponent(runId)}/admissions`}>
                Open the admissions queue
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </Card>
          )}
        </div>
      </div>

      {/* At the foot, as wk-programme draws it: the way out, behind its own
          confirmation page. Only for somebody taking part who can leave by
          themselves (see `canLeave`). */}
      {canLeave && access.isEnrolled && (
        <div className={weekly.foot}>
          <Link className={weekly.footLink} href={`/learn/${encodeURIComponent(runId)}/leave`}>
            {LEAVE_LINK}
          </Link>
        </div>
      )}
    </PageEnter>
  );
}
