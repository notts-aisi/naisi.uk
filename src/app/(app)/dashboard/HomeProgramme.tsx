"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import PageHead from "@/components/ui/PageHead";
import ProgressBar from "@/components/ui/ProgressBar";
import Skeleton from "@/components/ui/Skeleton";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import type { OverviewPayload } from "@/app/api/courses/runs/[runId]/overview/route";
import { weekHref } from "@/features/courses/links";
import { useRunOverview } from "@/features/courses/useRunOverview";
import { useRunProgress } from "@/features/courses/useRunProgress";
import { useWeek } from "@/features/courses/useWeek";
import { weekDocId, type Material } from "@/lib/firestore/courses";
import { ArrowRight, Check, External } from "./icons";
import { aboutMinutes, nameList } from "./homeWords";
import NextSession, { sessionFacts } from "./NextSession";
import styles from "./home.module.css";

/**
 * Home for a member on a programme: their next session, this week's reading
 * and their own attendance.
 *
 * Everything here is read through what the programme's own pages already
 * read: `/api/courses/runs/[runId]/overview` for the run, the group, the next
 * session and the member's own register marks; the week's document for its
 * reading; and the member's own ticks.
 *
 * A READING IS TICKED ON THE WEEK'S PAGE, NOT HERE. Home shows which are done
 * and links to each one, and "Open week 3" is where ticking, notes and the
 * exercises are. Nothing on Home writes.
 */

const KIND_LABEL: Record<Material["type"], string> = {
  reading: "Reading",
  video: "Video",
  link: "Link",
  note: "Note",
};

/** The week Home is about: this week, week 1 before the start, none after the end. */
function weekInHand(overview: OverviewPayload): { weekNumber: number; published: boolean } | null {
  const current = overview.currentWeek;
  if (!current || current.phase === "after") return null;
  const number =
    current.phase === "before"
      ? 1
      : (current.weekNumber ?? (current.anchorWeekNumber > 0 ? current.anchorWeekNumber : null));
  if (number === null || number < 1) return null;
  const doc = overview.weeks.find((w) => w.weekNumber === number);
  return { weekNumber: number, published: doc?.published === true };
}

/** "AGI Strategy Fellowship · Group B · week 3 of 6", from what is known. */
function headLine(entry: MyRunEntry): { long: string; short: string } {
  const week = entry.currentWeek;
  const number = week ? (week.weekNumber ?? week.anchorWeekNumber) : 0;
  const weekPart =
    !week || week.phase === "before"
      ? "starts soon"
      : week.phase === "after"
        ? "finished"
        : week.breakLabel
          ? week.breakLabel
          : number >= 1
            ? entry.totalWeeks > 0
              ? `week ${number} of ${entry.totalWeeks}`
              : `week ${number}`
            : "starting this week";
  const parts = [entry.groupName, weekPart].filter(Boolean);
  return {
    long: [entry.courseTitle, ...parts].filter(Boolean).join(" · "),
    short: parts.join(" · "),
  };
}

type Slots = {
  given: string;
  entry: MyRunEntry;
  /** Server-rendered: the next events, as two small cards. */
  comingUp: ReactNode;
  /** Server-rendered: the member's applications, when they have any. */
  applications: ReactNode;
  /** The cards every form of Home ends with. */
  more: ReactNode;
};

export default function HomeProgramme({ given, entry, comingUp, applications, more }: Slots) {
  const { data, error } = useRunOverview(entry.runId);
  const head = headLine(entry);

  const target = data ? weekInHand(data) : null;
  const weekSource = data
    ? {
        groupId: data.enrolment?.groupId ?? data.group?.id ?? null,
        forkedWeekIds: data.forkedWeekIds,
      }
    : null;
  // An unpublished week is not asked for: a learner may not read one.
  const week = useWeek(
    entry.runId,
    target?.published ? weekDocId(target.weekNumber) : "",
    false,
    weekSource,
  );
  const progress = useRunProgress(entry.runId);

  const materials = week.status === "ready" && week.week ? week.week.materials : [];
  const counted = materials.filter((m) => !m.optional);
  const isDone = (id: string) => progress.byItemId.get(id)?.completed === true;
  const doneCount = counted.filter((m) => isDone(m.id)).length;
  const left = counted.filter((m) => !isDone(m.id));
  const leftMinutes = left.reduce((sum, m) => sum + (m.estimatedMinutes ?? 0), 0);
  const ticksKnown = !progress.loading && !progress.error;

  const group = data?.group ?? null;
  const facts = group ? sessionFacts(group) : null;
  const runHref = `/learn/${encodeURIComponent(entry.runId)}`;

  return (
    <>
      {head.short && <p className={`meta ${styles.phoneEyebrow}`}>{head.short}</p>}
      <PageHead
        title={given ? `Hi ${given}.` : "Hi."}
        description={<span className={styles.headLine}>{head.long}</span>}
      />

      {!data && !error && <Skeleton height="14rem" />}

      {error && (
        <section className={styles.card}>
          <p className={styles.quiet}>We couldn’t load your programme just now.</p>
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
          eyebrow={
            entry.totalWeeks > 0
              ? `Your next session · week ${facts.weekNumber} of ${entry.totalWeeks}`
              : `Your next session · week ${facts.weekNumber}`
          }
          eyebrowShort="Next session"
          facts={facts}
          people={
            group.facilitatorNames.length > 0 ? (
              <span className={styles.sessionPeople}>
                <span className={styles.sessionFaces} aria-hidden="true">
                  {group.facilitatorNames.map((name) => (
                    <InitialsChip key={name} name={name} uid={name} size="md" />
                  ))}
                </span>
                with {nameList(group.facilitatorNames)}
              </span>
            ) : null
          }
          foot={
            target ? (
              <>
                <p className={styles.sessionFootLine}>
                  {week.status === "ready" && ticksKnown
                    ? counted.length === 0
                      ? "Nothing to read this week."
                      : left.length === 0
                        ? "You’ve done this week’s reading."
                        : `You’ve got ${left.length} ${left.length === 1 ? "reading" : "readings"} left${
                            aboutMinutes(leftMinutes) ? `, ${aboutMinutes(leftMinutes)}` : ""
                          }.`
                    : target.published
                      ? ""
                      : `Week ${target.weekNumber} isn’t up yet.`}
                </p>
                {target.published && (
                  <Link href={weekHref(entry.runId, target.weekNumber)} className={styles.textLink}>
                    Open week {target.weekNumber}
                    <ArrowRight />
                  </Link>
                )}
              </>
            ) : null
          }
        />
      )}

      {data && !(group && facts) && (
        <section className={styles.card}>
          <p className={styles.quiet}>
            {!group
              ? "You’ll be placed in a group soon. Your sessions appear here after that."
              : "No more sessions are planned for your group."}
          </p>
          <div>
            <Link href={runHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          {target && week.status === "ready" && materials.length > 0 && (
            <section className={`${styles.card} ${styles.readingCard}`} aria-labelledby="home-reading">
              <div className={styles.cardHead}>
                <h2 id="home-reading" className={styles.cardTitle}>
                  This week’s reading
                </h2>
                {ticksKnown && counted.length > 0 && (
                  <span className={styles.cardCount}>
                    {doneCount} of {counted.length} done
                  </span>
                )}
              </div>
              {ticksKnown && counted.length > 0 && (
                <ProgressBar
                  value={doneCount}
                  max={counted.length}
                  size="sm"
                  ariaLabel="This week’s reading done"
                />
              )}
              <ul className={styles.reading} role="list">
                {materials.map((material) => {
                  const done = ticksKnown && isDone(material.id);
                  const source = material.type === "reading" ? material.author : undefined;
                  return (
                    <li key={material.id} className={styles.readingRow}>
                      <span
                        className={done ? styles.tickDone : styles.tick}
                        aria-hidden="true"
                      >
                        {done && <Check size={14} />}
                      </span>
                      <div className={styles.readingBody}>
                        <p className={done ? styles.readingTitleDone : styles.readingTitle}>
                          <span className={styles.srOnly}>{done ? "Done: " : "To do: "}</span>
                          {material.title}
                        </p>
                        <p className={styles.readingMeta}>
                          <Chip tone="neutral">{KIND_LABEL[material.type]}</Chip>
                          {material.optional && <Chip tone="neutral">Optional</Chip>}
                          {material.estimatedMinutes ? (
                            <span className="meta">{material.estimatedMinutes} min</span>
                          ) : null}
                          {source && <span>{source}</span>}
                        </p>
                      </div>
                      {material.type !== "note" && (
                        <a
                          className={styles.textLink}
                          href={material.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open
                          <span className={styles.srOnly}> {material.title}</span>
                          <External />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {comingUp}
        </div>

        <div className={styles.stack}>
          {data?.ownAttendance && (
            <Attendance
              own={data.ownAttendance}
              totalWeeks={data.run.totalWeeks}
              href={`${runHref}/progress`}
            />
          )}
          {applications}
          {more}
        </div>
      </div>
    </>
  );
}

const MARK: Record<string, { letter: string; word: string }> = {
  present: { letter: "P", word: "Present" },
  late: { letter: "L", word: "Late" },
  "left-early": { letter: "LE", word: "Left early" },
  absent: { letter: "A", word: "Absent" },
  excused: { letter: "EX", word: "Excused" },
};

/**
 * The member's own attendance: how many sessions in full, and one box a week.
 *
 * A week has a mark only once its register is finished, which the route
 * decides. A week with no finished register is a dash, never an absence.
 */
function Attendance({
  own,
  totalWeeks,
  href,
}: {
  own: NonNullable<OverviewPayload["ownAttendance"]>;
  totalWeeks: number;
  href: string;
}) {
  const held = own.rollup.sessionsHeld;
  const inFull = own.rollup.attendedInFull;
  // The first session of each week speaks for the week's box.
  const byWeek = new Map<number, (typeof own.sessions)[number]>();
  for (const session of own.sessions) {
    if (!byWeek.has(session.weekNumber)) byWeek.set(session.weekNumber, session);
  }
  const weeks = Array.from({ length: Math.max(0, totalWeeks) }, (_, i) => i + 1);

  return (
    <section className={styles.card} aria-labelledby="home-attendance">
      <div className={styles.cardHead}>
        <h2 id="home-attendance" className={styles.cardTitle}>
          Your attendance
        </h2>
      </div>
      {held > 0 ? (
        <p className={styles.attendanceCount}>
          <strong>
            {inFull} of {held}
          </strong>{" "}
          so far
        </p>
      ) : (
        <p className={styles.quiet}>
          Your attendance appears here once your facilitator finishes each session’s register.
        </p>
      )}
      {weeks.length > 0 && (
        <ol className={styles.pips} role="list">
          {weeks.map((n) => {
            const session = byWeek.get(n);
            const mark = session?.held && session.status ? MARK[session.status] : null;
            const word = !session
              ? "not marked yet"
              : !session.held
                ? "no session"
                : (mark?.word ?? "not marked");
            return (
              <li key={n} className={styles.pip}>
                <span
                  className={
                    mark
                      ? session?.status === "absent"
                        ? styles.pipMissed
                        : styles.pipHere
                      : styles.pipEmpty
                  }
                  aria-hidden="true"
                >
                  {mark ? mark.letter : "-"}
                </span>
                <span className="meta" aria-hidden="true">
                  W{n}
                </span>
                <span className={styles.srOnly}>
                  Week {n}: {word}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div>
        <Link href={href} className={styles.textLink}>
          Your progress week by week
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
