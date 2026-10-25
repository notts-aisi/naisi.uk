import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import type { OverviewAttention, OverviewModel, OverviewSession } from "@/lib/courses/programmeOverview";
import type { OverviewUpdate } from "@/lib/courses/updates/views";
import RemindButton from "./RemindButton";
import styles from "./ProgrammeOverview.module.css";

/**
 * A PROGRAMME'S OVERVIEW (board wk-overview), drawn from the model the
 * server worded (`buildProgrammeOverview`): the week, the sessions this week
 * and their registers, what needs attention, who came by week, and the
 * people. Only "Remind" runs in the browser.
 *
 * Not drawn, because it is not built: the board's "Email Freya". The
 * Updates card shows the newest updates and leads to the Messages tab, where
 * they are written and read in full.
 */

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.arrow}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function AttentionIcon({ kind }: { kind: OverviewAttention["kind"] }) {
  if (kind === "left") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.infoIcon}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.warnIcon}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

function pillClass(state: OverviewSession["state"]): string {
  switch (state) {
    case "finished":
      return `${styles.pill} ${styles.pillOk}`;
    case "not-finished":
      return `${styles.pill} ${styles.pillWarn}`;
    case "today":
      return `${styles.pill} ${styles.pillLive}`;
    default:
      return styles.pill;
  }
}

function SessionCard({
  session,
  roundId,
  programmeId,
}: {
  session: OverviewSession;
  roundId: string;
  programmeId: string;
}) {
  const dot = session.state === "finished" || session.state === "not-finished" || session.state === "today";
  return (
    <article
      className={`${styles.session} ${session.state === "not-finished" ? styles.sessionWarn : ""}`}
      aria-labelledby={`session-${session.groupId}`}
    >
      <p className={`${styles.when} ${session.today ? styles.whenToday : ""}`}>{session.when}</p>
      <h3 id={`session-${session.groupId}`} className={styles.sessionGroup}>
        {session.groupName}
      </h3>
      {session.where && <p className={styles.where}>{session.where}</p>}
      {session.facilitators.length > 0 ? (
        <ul className={styles.facilitators}>
          {session.facilitators.map((person) => (
            <li key={person.uid} className={styles.facilitator}>
              <InitialsChip name={person.name} uid={person.uid} size="sm" />
              {person.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No facilitator yet</p>
      )}
      <div className={styles.sessionFoot}>
        <span className={pillClass(session.state)}>
          {dot && <span className={styles.pillDot} aria-hidden="true" />}
          {session.pill}
        </span>
        {session.line && <p className={styles.sessionLine}>{session.line}</p>}
        {session.seeIt && (
          <Link href={session.seeIt} className={styles.textLink}>
            See it
            <Arrow />
          </Link>
        )}
        {session.remind && (
          <RemindButton
            roundId={roundId}
            programmeId={programmeId}
            groupId={session.groupId}
            sessionKey={session.remind.sessionKey}
            label={session.remind.label}
            count={session.remind.count}
            countLine={session.remind.countLine}
            confirm={session.remind.confirm}
          />
        )}
        {session.reminded && <p className={styles.sessionNote}>{session.reminded}</p>}
      </div>
    </article>
  );
}

export default function ProgrammeOverview({
  model,
  updates,
  roundId,
  programmeId,
  programmePath,
}: {
  model: OverviewModel;
  /** The newest updates on the run, worded on the server (`overviewUpdateRows`). */
  updates: OverviewUpdate[];
  roundId: string;
  programmeId: string;
  /** The programme's own address, no trailing slash. */
  programmePath: string;
}) {
  const { week, sessions, attention, chart, people } = model;
  return (
    <div className={styles.page}>
      {week ? (
        <section className={styles.weekCard} aria-labelledby="overview-week">
          <div className={styles.weekTop}>
            <div className={styles.weekText}>
              <p className={styles.eyebrow}>{week.label}</p>
              <div className={styles.weekTitleRow}>
                <h2 id="overview-week" className={styles.weekTitle}>
                  {week.title}
                </h2>
                {week.span && <span className={styles.weekSpan}>{week.span}</span>}
              </div>
              {week.theme && <p className={styles.theme}>{week.theme}</p>}
            </div>
            {week.open && (
              <Link href={week.open.href} className={styles.buttonLink}>
                {week.open.label}
                <Arrow />
              </Link>
            )}
          </div>
          <ol className={styles.rail}>
            {week.rail.map((entry) => (
              <li
                key={entry.weekNumber}
                className={`${styles.railStep} ${
                  entry.state === "done" ? styles.railDone : entry.state === "current" ? styles.railCurrent : ""
                }`}
                aria-current={entry.state === "current" ? "step" : undefined}
              >
                <span className={styles.railBar} aria-hidden="true" />
                <span className={styles.railWeek}>{entry.label}</span>
                <span className={styles.railDate}>
                  {entry.date}
                  <span className={styles.visuallyHidden}>, {entry.stateWord}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className={styles.card}>
          <p className={styles.muted}>This run has no start date or no weeks yet, so its weeks can’t be shown.</p>
        </section>
      )}

      <section aria-labelledby="overview-sessions">
        <h2 id="overview-sessions" className={styles.sectionTitle}>
          Sessions this week
        </h2>
        {sessions.length > 0 ? (
          <div className={styles.sessions}>
            {sessions.map((session) => (
              <SessionCard key={session.groupId} session={session} roundId={roundId} programmeId={programmeId} />
            ))}
          </div>
        ) : (
          <p className={styles.muted}>No group meets this week.</p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="overview-attention">
        <div className={styles.cardHead}>
          <h2 id="overview-attention" className={styles.cardTitle}>
            Needs attention
          </h2>
          {attention.length > 0 && <span className={styles.countBadge}>{attention.length}</span>}
        </div>
        {attention.length === 0 ? (
          <p className={styles.muted}>Nothing needs attention.</p>
        ) : (
          <ul className={styles.items}>
            {attention.map((item, index) => (
              <li key={`${item.kind}-${index}`} className={styles.item}>
                <AttentionIcon kind={item.kind} />
                <div className={styles.itemText}>
                  <p className={styles.itemTitle}>{item.title}</p>
                  {item.detail && <p className={styles.itemDetail}>{item.detail}</p>}
                </div>
                {item.link &&
                  (item.kind === "register" ? (
                    <Link href={item.link.href} className={styles.textLink}>
                      {item.link.label}
                      <Arrow />
                    </Link>
                  ) : (
                    <Link href={item.link.href} className={styles.buttonLink}>
                      {item.link.label}
                    </Link>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="overview-chart">
          <h2 id="overview-chart" className={styles.cardTitle}>
            Attendance by week
          </h2>
          <p className={styles.muted}>Late and left early count as came.</p>
          <div className={styles.chart} role="img" aria-label={chart.description}>
            <div className={styles.gridLines} aria-hidden="true">
              <span className={styles.gridLine}>100%</span>
              <span className={styles.gridLine}>50%</span>
              <span className={styles.gridLine}>0%</span>
            </div>
            <ol className={styles.bars} aria-hidden="true">
              {chart.weeks.map((entry) => (
                <li key={entry.weekNumber} className={styles.barColumn}>
                  <span className={styles.barTrack}>
                    {entry.percent !== null && (
                      <span
                        className={`${styles.bar} ${entry.soFar ? styles.barSoFar : ""}`}
                        style={{ height: `${entry.percent}%` }}
                      >
                        <span className={styles.barValue}>{entry.percent}%</span>
                      </span>
                    )}
                    {entry.percent === null && <span className={styles.barEmpty}>·</span>}
                  </span>
                  <span className={styles.barLabel}>
                    {entry.label}
                    {entry.soFar && <span className={styles.barSoFarWord}>so far</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {chart.from && <p className={styles.chartFrom}>{chart.from}</p>}
          <Link href={`${programmePath}/attendance`} className={styles.textLink}>
            All attendance
            <Arrow />
          </Link>
        </section>

        <div className={styles.side}>
          <section className={styles.card} aria-labelledby="overview-people">
            <h2 id="overview-people" className={styles.cardTitle}>
              People
            </h2>
            <p className={styles.peopleCount}>
              <span className={styles.bigNumber}>{people.takingPart}</span> taking part
            </p>
            <p className={styles.peopleLine}>{people.line}</p>
          </section>
          <section className={styles.card} aria-labelledby="overview-updates">
            <h2 id="overview-updates" className={styles.cardTitle}>
              Updates
            </h2>
            <Link href={`${programmePath}/messages`} className={styles.textLink}>
              Write an update
              <Arrow />
            </Link>
            {updates.length === 0 ? (
              <p className={styles.peopleLine}>No updates yet.</p>
            ) : (
              <ul className={styles.updateList}>
                {updates.map((update) => (
                  <li key={update.id} className={styles.updateItem}>
                    <InitialsChip name={update.author} uid={update.authorUid} size="sm" />
                    <span className={styles.updateBody}>
                      <Link href={`${programmePath}/messages`} className={styles.updateTitle}>
                        {update.title}
                      </Link>
                      <span className={styles.updateMeta}>{update.meta}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
