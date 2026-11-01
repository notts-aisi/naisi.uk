import type { ReactNode } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import { tilePartsOfDay } from "@/app/(app)/dashboard/homeWords";
import { ArrowRight } from "@/app/(app)/dashboard/icons";
import type { TicketFacts } from "@/features/courses/sessionChange/cardFacts";
import type {
  GroupMark,
  GroupPersonRow,
  GroupRegisterRow,
  GroupReviewRow,
} from "@/lib/courses/facilitatorGroup";
import {
  CANCELLED,
  DID_NOT_HAPPEN,
  GROUP_MARK_WORDS,
  NAMES_ONLY,
  NOBODY_IN_GROUP,
  NO_MORE_SESSIONS,
  NOTHING_TO_REVIEW,
  PACE,
  REGISTERS,
  REVIEW,
  REVIEW_EXERCISES,
  SEE_IT,
  TAKE_THE_REGISTER,
  TO_REVIEW,
  WEEKS_AND_SCHEDULE,
  YOUR_GROUP,
  cameWords,
  expectedWords,
  finishedWeeksWords,
  finishedWord,
  firstRegisterWords,
  groupMarkWords,
  notFinishedWord,
  paceWords,
  reviewWeekWords,
  sentWords,
  todayWord,
} from "@/lib/courses/facilitatorPageWords";
import { MARK_LETTER, ROOM_CHANGED } from "@/lib/courses/memberPageWords";
import { JOIN_ONLINE, LINK_IS_HERE, dayWords } from "@/lib/courses/sessionChange/words";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { STARTS_WITH_AN_EXPLAINER, facilitatorLineWords, scheduledByWords } from "@/lib/courses/explainers/words";
import { PeopleIcon } from "./icons";
import styles from "./facilitator.module.css";

/**
 * THE CARDS OF A FACILITATOR'S GROUP PAGE (boards wk-fac-group and
 * wk-fac-group-phone), drawn on the server from what the page worked out
 * (`src/lib/courses/facilitatorGroup.ts`): the session ticket, the group's
 * people with each finished register's marks, the registers, the work to
 * review and the pace. The updates and the notes have cards of their own.
 *
 * Names only: no card here takes an address, because none is handed one.
 */

// ---------------------------------------------------------------------------
// The session ticket
// ---------------------------------------------------------------------------

/**
 * The next session, as a ticket: its date on the stub, "Tonight · week 3"
 * over "Tue 17 Nov, 6pm", its room, how many are expected, and "Take the
 * register". The session's own week: a session moved for one week shows its
 * new day, time and room, and an online week its link to join.
 *
 * Not drawn: who can't make it (the register says it, which "Take the
 * register" opens) and the facilitator guide (no record holds one).
 *
 * AN EXPLAINER at the start of the session, when an admin scheduled one from
 * a week's review: "Starts with an explainer", how long, what about and who
 * gives it, then the week as planned, and under the ticket who scheduled it
 * and from which week's review. Never the review itself.
 */
export function FacilitatorTicket({
  facts,
  eyebrow,
  heading,
  roomChanged,
  expected,
  registerHref,
  guide = null,
  explainer = null,
}: {
  facts: TicketFacts;
  eyebrow: string;
  heading: string;
  roomChanged: boolean;
  /** People expected; null draws no line (nobody told yet). */
  expected: number | null;
  registerHref: string;
  /**
   * "Facilitator guide for week 3" and where it leads (wk-fac-group), or null
   * when the session's week has nothing in the course's facilitator guide.
   */
  guide?: { href: string; label: string } | null;
  /**
   * The explainer the session starts with, named as this reader sees people
   * (`by` and `scheduledBy`, null once an account is gone), or null.
   */
  explainer?: { minutes: number; topic: string; by: string | null; scheduledBy: string | null; fromWeekNumber: number } | null;
}) {
  const tile = tilePartsOfDay(facts.dateKey);
  const modeChip =
    facts.mode === "virtual" ? (
      <span className={weekly.liveChip}>Online this week</span>
    ) : facts.mode === "in-person" ? (
      <span className={weekly.plainChip}>In person this week</span>
    ) : null;
  return (
    <>
    <section className={weekly.ticket} aria-label="Your next session" data-testid="session-card">
      {/* The stub and the body side by side, as wk-fac-group draws them: the
          ticket's frame is a column since Home's row of buttons sits under both. */}
      <div className={weekly.ticketRow}>
      {tile && (
        <time className={weekly.stub} dateTime={facts.dateKey}>
          <span className={weekly.stubWeekday}>{tile.weekday}</span>
          <span className={weekly.stubDay}>{tile.day}</span>
          <span className={weekly.stubMonth}>{tile.month}</span>
        </time>
      )}
      <div className={weekly.ticketMain}>
        <div className={weekly.ticketBody}>
          <p className={weekly.ticketEyebrow}>{eyebrow}</p>
          <h2 className={weekly.ticketWhen}>{heading}</h2>
          {(facts.room || modeChip) && (
            <div className={weekly.ticketFacts}>
              {facts.room && <p className={styles.ticketRoomMuted}>{facts.room}</p>}
              {roomChanged && facts.room && <span className={weekly.warnChip}>{ROOM_CHANGED}</span>}
              {modeChip}
            </div>
          )}
          {facts.mode === "virtual" && !facts.joinUrl && facts.missing && <p className={weekly.ticketNote}>{facts.missing}</p>}
          {expected !== null && (
            <div className={styles.ticketPeople}>
              <span className={styles.ticketPerson}>
                <PeopleIcon />
                <span>{expectedWords(expected)}</span>
              </span>
            </div>
          )}
          {explainer && (
            <div className={styles.explainerBox}>
              <span className={styles.explainerChip}>{STARTS_WITH_AN_EXPLAINER}</span>
              <p className={styles.explainerText}>{facilitatorLineWords(explainer.minutes, explainer.topic, explainer.by)}</p>
            </div>
          )}
          <div className={styles.ticketButtons}>
            <Link href={registerHref} className={styles.buttonPrimary}>
              {TAKE_THE_REGISTER}
            </Link>
            {guide && (
              <Link href={guide.href} className={styles.ticketGuide}>
                <span>{guide.label}</span>
                <ArrowRight />
              </Link>
            )}
            {facts.joinUrl && (
              <a className={styles.buttonGhost} href={facts.joinUrl} target="_blank" rel="noopener noreferrer">
                {JOIN_ONLINE}
              </a>
            )}
          </div>
          {facts.joinUrl && <p className={weekly.ticketNote}>{LINK_IS_HERE}</p>}
        </div>
      </div>
      </div>
    </section>
    {explainer && <p className={styles.explainerLine}>{scheduledByWords(explainer.scheduledBy, explainer.fromWeekNumber)}</p>}
    </>
  );
}

/**
 * Where the ticket would be once the group's last session is over: the
 * sentence Home says, so the page never just stops above "Your group".
 */
export function NoMoreSessionsCard() {
  return (
    <section className={weekly.card} aria-label="Your next session" data-testid="session-card">
      <p className={weekly.cardLine}>{NO_MORE_SESSIONS}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Your group
// ---------------------------------------------------------------------------

const MARK_CLASS: Record<AttendanceStatus, string> = {
  present: styles.markPresent,
  late: styles.markLate,
  "left-early": styles.markLate,
  excused: styles.markExcused,
  absent: styles.markAbsent,
};

function markWord(mark: GroupMark): string {
  if (mark.kind === "mark" && mark.mark) return ATTENDANCE_STATUS_LABEL[mark.mark];
  return GROUP_MARK_WORDS[mark.kind === "mark" ? "not-marked" : mark.kind];
}

function Marks({ marks }: { marks: GroupMark[] }) {
  if (marks.length === 0) return null;
  return (
    <span className={styles.marks}>
      {marks.map((mark) => (
        <span
          key={mark.weekNumber}
          className={[styles.mark, mark.kind === "mark" && mark.mark ? MARK_CLASS[mark.mark] : ""].filter(Boolean).join(" ")}
          role="img"
          aria-label={groupMarkWords(mark.weekNumber, markWord(mark))}
          title={markWord(mark)}
        >
          {mark.kind === "mark" && mark.mark ? MARK_LETTER[mark.mark] : ""}
        </span>
      ))}
    </span>
  );
}

/**
 * "Your group": everybody taking part, by name, with each finished
 * register's mark; then, last and faded under a dashed rule, everybody who
 * left, with "Left Fri 13 Nov" and the marks they had. Names only.
 */
export function GroupPeopleCard({
  people,
  leavers,
  finishedWeeks,
  notYetTold,
}: {
  people: GroupPersonRow[];
  leavers: GroupPersonRow[];
  finishedWeeks: number[];
  notYetTold: boolean;
}) {
  const meta = finishedWeeksWords(finishedWeeks);
  return (
    <section className={weekly.card} aria-labelledby="group-people" data-testid="group-roster">
      <div className={weekly.cardHead}>
        <h2 id="group-people" className={weekly.cardTitle}>
          {YOUR_GROUP}
        </h2>
        {meta && <span className={weekly.cardMeta}>{meta}</span>}
      </div>
      {people.length === 0 && leavers.length === 0 ? (
        <p className={weekly.cardLine}>{notYetTold ? NAMES_WHEN_GROUPS_GO_OUT : NOBODY_IN_GROUP}</p>
      ) : (
        <ul className={styles.people} aria-label="Members of this group">
          {people.map((person) => (
            <li key={person.uid} className={styles.person}>
              <InitialsChip name={person.name} uid={person.uid} size="lg" />
              <span className={styles.personText}>
                <span className={styles.personName}>{person.name}</span>
              </span>
              <Marks marks={person.marks} />
            </li>
          ))}
          {leavers.map((person) => (
            <li key={person.uid} className={`${styles.person} ${styles.personLeft}`}>
              <span className={styles.personFaded}>
                <InitialsChip name={person.name} uid={person.uid} size="lg" />
              </span>
              <span className={styles.personText}>
                <span className={`${styles.personName} ${styles.personNameLeft}`}>{person.name}</span>
                <span className={styles.personNote}>{person.left}</span>
              </span>
              <Marks marks={person.marks} />
            </li>
          ))}
        </ul>
      )}
      <p className={styles.cardFootLine}>{NAMES_ONLY}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

/** "TUE 3 NOV" by the stylesheet's capitals. */
function registerDay(dateKey: string): string {
  return dayWords(dateKey);
}

function RegisterState({ row, scheduled, href }: { row: GroupRegisterRow; scheduled: boolean; href: string }): ReactNode {
  switch (row.state) {
    case "finished":
      return (
        <>
          <span className={styles.okChip}>{finishedWord(scheduled)}</span>
          {row.of > 0 && <span className={styles.registerCame}>{cameWords(row.came, row.of)}</span>}
          <Link href={href} className={styles.seeIt}>
            {SEE_IT}
          </Link>
        </>
      );
    case "not-finished":
      return (
        <>
          <span className={styles.warnChip}>{notFinishedWord(scheduled)}</span>
          <Link href={href} className={styles.seeIt}>
            {SEE_IT}
          </Link>
        </>
      );
    case "not-held":
      return (
        <>
          <span className={styles.plainChip}>{DID_NOT_HAPPEN}</span>
          <Link href={href} className={styles.seeIt}>
            {SEE_IT}
          </Link>
        </>
      );
    case "cancelled":
      return <span className={styles.plainChip}>{CANCELLED}</span>;
    case "today":
      return <span className={styles.liveChip}>{todayWord(row.startTimeLocal)}</span>;
  }
}

/** "Registers": each session from the first to today's, with its state and how many came. */
export function GroupRegistersCard({
  registers,
  scheduled,
  registerHref,
  firstSessionDateKey,
}: {
  registers: GroupRegisterRow[];
  scheduled: boolean;
  registerHref: string;
  firstSessionDateKey: string;
}) {
  return (
    <section className={weekly.card} aria-labelledby="group-registers">
      <div className={weekly.cardHead}>
        <h2 id="group-registers" className={weekly.cardTitle}>
          {REGISTERS}
        </h2>
      </div>
      {registers.length === 0 ? (
        <p className={weekly.cardLine}>{firstRegisterWords(firstSessionDateKey)}</p>
      ) : (
        <ul className={styles.registers}>
          {registers.map((row) => (
            <li key={row.weekNumber} className={styles.register}>
              <span className={styles.registerWhen}>
                <span className={styles.registerWeek}>Week {row.weekNumber}</span>
                <span className={styles.registerDate}>{registerDay(row.dateKey)}</span>
              </span>
              <span className={styles.registerState}>
                <RegisterState row={row} scheduled={scheduled} href={registerHref} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// To review
// ---------------------------------------------------------------------------

/** "To review": each person's exercises waiting for a review, newest first, each with "Review". */
export function ToReviewCard({ rows, reviewHref }: { rows: GroupReviewRow[]; reviewHref: (weekNumber: number | null) => string }) {
  return (
    <section className={weekly.card} aria-labelledby="group-to-review">
      <div className={weekly.cardHead}>
        <h2 id="group-to-review" className={weekly.cardTitle}>
          {TO_REVIEW}
        </h2>
        {rows.length > 0 && <span className={styles.countChip}>{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <p className={weekly.cardLine}>{NOTHING_TO_REVIEW}</p>
      ) : (
        <ul className={styles.reviews}>
          {rows.map((row) => (
            <li key={`${row.uid} ${row.weekNumber}`} className={styles.review}>
              <InitialsChip name={row.name} uid={row.uid} size="md" />
              <span className={styles.reviewText}>
                <span className={styles.personName}>{row.name}</span>
                <span className={styles.reviewMetaWrap}>
                  <span className={styles.reviewMeta}>
                    {[reviewWeekWords(row.weekNumber, row.count), sentWords(row.sentDateKey)]
                      .filter(Boolean)
                      .map((part, index) => (
                        <span key={part} className={styles.reviewPart}>
                          <span className={styles.reviewSep} aria-hidden="true">
                            ·
                          </span>
                          {index > 0 && <span className={weekly.srOnly}>, </span>}
                          {part}
                        </span>
                      ))}
                  </span>
                </span>
              </span>
              <Link
                href={reviewHref(row.weekNumber)}
                className={styles.buttonGhost}
                aria-label={`${REVIEW} ${row.name}, ${reviewWeekWords(row.weekNumber, row.count).toLowerCase()}`}
              >
                {REVIEW}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className={weekly.cardFoot}>
        <Link href={reviewHref(null)} className={styles.cardFootLink}>
          {REVIEW_EXERCISES}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

/** "Pace": where the group is against its programme, and the way to the group's own weeks. */
export function PaceCard({ weeksBehind, editHref }: { weeksBehind: number; editHref: string | null }) {
  return (
    <section className={weekly.card} aria-labelledby="group-pace">
      <div className={weekly.cardHead}>
        <h2 id="group-pace" className={weekly.cardTitle}>
          {PACE}
        </h2>
      </div>
      <p className={styles.paceLine}>{paceWords(weeksBehind)}</p>
      {editHref && (
        <div className={weekly.cardFoot}>
          <Link href={editHref} className={styles.cardFootLink}>
            {WEEKS_AND_SCHEDULE}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </section>
  );
}
