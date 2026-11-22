import Link from "next/link";
import type { ReactNode } from "react";
import PersonNotes from "@/features/admin/memberNotes/PersonNotes";
import { MemberEventsView } from "@/features/admin/MemberEvents";
import { PERSON_EVENTS_WORDS } from "@/lib/events/attendanceWords";
import type { AttendanceView, FacilitatorPersonView, FeedbackLine, PersonWeekRow, TeamPersonView, WeekChartView } from "@/lib/courses/personPage/model";
import { WHY, WOULD_WORK } from "@/lib/courses/timeAnswer/words";
import chartStyles from "@/features/applications/times/WeekChart.module.css";
import {
  ACCOUNT,
  ACTIVITY,
  ACTIVITY_HINT,
  ACTIVITY_WHO,
  ADMINS_ONLY_NOTE,
  APPLICATION,
  ATTENDANCE,
  CHART_LABEL,
  CLAUDE_AND_PANGRAM,
  IN_THIS_GROUP,
  ONLY_ADMINS_SEE_THIS,
  PLACE_AND_GROUP,
  WHEN_FREE,
  ATTENDANCE_HINT,
  COURSEWORK,
  COURSEWORK_HINT,
  DONE,
  EMAIL_ADDRESS,
  EVENTS,
  EVENTS_WHO,
  FACILITATOR_FOOT,
  FEEDBACK,
  FEEDBACK_WHO,
  GOES_BY,
  JOINED,
  NONE_ASKED,
  NOTES,
  NOT_TOLD,
  NO_ACTIVITY,
  NO_FEEDBACK,
  NO_REGISTERS,
  NO_WEEKS,
  READINGS,
  REFLECTION,
  SECTIONS_LABEL,
  TEAM_RATING,
  WEEK,
  WRITTEN_ANSWER,
  YOUR_FEEDBACK,
  YOUR_FEEDBACK_NONE,
} from "@/lib/courses/personPage/words";
import styles from "./personPage.module.css";

/**
 * A PERSON'S PAGE, DRAWN (Wed 18 Nov 2026). Server components only, drawing
 * the view the loader handed (`src/lib/courses/personPage/load.ts`): a
 * section whose key is absent from the view is not drawn, and nothing
 * stands in its place. The notes are the notes' own component, which reads
 * through the notes' own routes; the events are the admin profile's own card
 * body, handed what the events tree's reader answered for an admin.
 */

function Card({ title, who, hint, children, id }: { title: string; who?: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <section className={styles.card} aria-labelledby={id}>
      <div className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>
          {title}
        </h2>
        {who ? <span className={styles.who}>{who}</span> : null}
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {children}
    </section>
  );
}

function Lines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <span className={styles.stack}>
      {lines.map((line, at) => (
        <span key={at}>{line}</span>
      ))}
    </span>
  );
}

function ReadLink({ week }: { week: PersonWeekRow }) {
  return week.readHref ? (
    <Link href={week.readHref} className={styles.readLink}>
      {week.readLabel}
    </Link>
  ) : null;
}

/** The coursework, week by week: a table on a wide screen, a card per week on a phone. */
function Coursework({ weeks, ratings }: { weeks: readonly PersonWeekRow[]; ratings?: TeamPersonView["ratings"] }) {
  if (weeks.length === 0) return <p className={styles.line}>{NO_WEEKS}</p>;
  const ratingOf = (weekNumber: number) => ratings?.find((each) => each.weekNumber === weekNumber)?.lines ?? [];
  return (
    <>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{WEEK}</th>
              <th scope="col">{DONE}</th>
              <th scope="col">{READINGS}</th>
              <th scope="col">{REFLECTION}</th>
              <th scope="col">{WRITTEN_ANSWER}</th>
              {ratings ? <th scope="col">{TEAM_RATING}</th> : null}
              <th scope="col">{FEEDBACK}</th>
              <th scope="col">
                <span className={styles.srOnly}>{COURSEWORK}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekNumber}>
                <th scope="row">{week.weekNumber}</th>
                <td>
                  <Lines lines={week.visit ? [week.state, week.visit] : [week.state]} />
                </td>
                {week.open ? (
                  <>
                    <td>{week.readings ?? NONE_ASKED}</td>
                    <td>{week.reflection ?? NONE_ASKED}</td>
                    <td>{week.answer ?? NONE_ASKED}</td>
                    {ratings ? (
                      <td>
                        <Lines lines={ratingOf(week.weekNumber)} />
                      </td>
                    ) : null}
                    <td>
                      <Lines lines={week.feedback} />
                    </td>
                    <td>
                      <ReadLink week={week} />
                    </td>
                  </>
                ) : (
                  <td colSpan={ratings ? 6 : 5} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.weekCards}>
        {weeks.map((week) => (
          <li key={week.weekNumber} className={styles.weekCard}>
            <p className={styles.weekCardHead}>
              {WEEK} {week.weekNumber} · {week.state}
            </p>
            {week.visit ? <span className={styles.line}>{week.visit}</span> : null}
            {week.open ? (
              <>
                {week.readings ? (
                  <span className={styles.line}>
                    {READINGS}: {week.readings}
                  </span>
                ) : null}
                {week.reflection ? (
                  <span className={styles.line}>
                    {REFLECTION}: {week.reflection}
                  </span>
                ) : null}
                {week.answer ? (
                  <span className={styles.line}>
                    {WRITTEN_ANSWER}: {week.answer}
                  </span>
                ) : null}
                {ratings
                  ? ratingOf(week.weekNumber).map((line, at) => (
                      <span key={`r${at}`} className={styles.line}>
                        {TEAM_RATING}: {line}
                      </span>
                    ))
                  : null}
                {week.feedback.map((line, at) => (
                  <span key={`f${at}`} className={styles.line}>
                    {FEEDBACK}: {line}
                  </span>
                ))}
                <ReadLink week={week} />
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Attendance as counts only, and a line per week from the registers. */
function Attendance({ attendance }: { attendance: AttendanceView }) {
  return (
    <>
      <dl className={styles.counts}>
        {attendance.counts.map((count) => (
          <div key={count.key} className={styles.count}>
            <dt>{count.label}</dt>
            <dd>{count.value}</dd>
          </div>
        ))}
      </dl>
      {attendance.empty ? <p className={styles.line}>{NO_REGISTERS}</p> : null}
      {attendance.lines.length > 0 ? (
        <ul className={styles.list}>
          {attendance.lines.map((line) => (
            <li key={line.weekNumber} className={styles.listItem}>
              <span>{line.when}</span>
              <span className={styles.lineWithChips}>
                <span>{line.said}</span>
                {line.chips.map((chip) => (
                  <span key={chip} className={styles.chip}>
                    {chip}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Feedback({ feedback, none }: { feedback: readonly FeedbackLine[]; none: string }) {
  if (feedback.length === 0) return <p className={styles.line}>{none}</p>;
  return (
    <ul className={styles.list}>
      {feedback.map((piece) => (
        <li key={piece.id} className={styles.listItem}>
          <span>{piece.on}</span>
          <span className={styles.listWhen}>{piece.line}</span>
        </li>
      ))}
    </ul>
  );
}

/** The strip of links to the sections this reader is shown, in the page's order. */
function sectionsOf(view: TeamPersonView): Array<{ id: string; label: string }> {
  return [
    { id: "person-place", label: PLACE_AND_GROUP },
    view.free || view.timeAnswer ? { id: "person-free", label: WHEN_FREE } : null,
    view.application ? { id: "person-application", label: APPLICATION } : null,
    view.weeks ? { id: "person-coursework", label: COURSEWORK } : null,
    { id: "person-attendance", label: ATTENDANCE },
    view.feedback ? { id: "person-feedback", label: FEEDBACK } : null,
    view.notes ? { id: "person-notes", label: NOTES } : null,
    view.events ? { id: "person-events", label: EVENTS } : null,
    view.activity ? { id: "person-activity", label: ACTIVITY } : null,
    view.account ? { id: "person-account", label: ACCOUNT } : null,
  ].filter((each): each is { id: string; label: string } => each !== null);
}

/**
 * ONE PERSON'S WEEK, read only: the chart the model worked out
 * (`weekChartOf`), drawn with the chart's own sheet beside a person in
 * Circles, with nothing to press.
 */
function WeekChartDrawn({ chart }: { chart: WeekChartView }) {
  const pct = (value: number) => `${value}%`;
  return (
    <div className={chartStyles.chart} role="img" aria-label={CHART_LABEL}>
      <div className={chartStyles.axis} aria-hidden="true">
        {chart.hours.map((hour) => (
          <span key={hour.label} className={chartStyles.hour} style={{ top: pct(hour.top) }}>
            {hour.label}
          </span>
        ))}
      </div>
      {chart.days.map((day) => (
        <div key={day.name} className={chartStyles.day}>
          <span className={chartStyles.dayName}>{day.name}</span>
          <div className={chartStyles.column}>
            {day.readAs ? <span className={chartStyles.readAs} style={{ top: pct(day.readAs.top), height: pct(day.readAs.height) }} /> : null}
            {day.free.map((block) => (
              <span key={`${block.top}`} className={chartStyles.free} style={{ top: pct(block.top), height: pct(block.height) }} />
            ))}
            {day.bars.map((bar) => (
              <span
                key={bar.key}
                className={[chartStyles.bar, bar.fits ? chartStyles.barFits : chartStyles.barNot, bar.current ? chartStyles.barCurrent : ""].filter(Boolean).join(" ")}
                style={{ top: pct(bar.top), height: pct(bar.height), left: pct(bar.left), width: pct(bar.width) }}
                title={bar.title}
              >
                {bar.letter}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** When they're free: the week as this reader may see it, their answer about their group's time, and who sees both. */
function WhenFree({ view }: { view: TeamPersonView }) {
  const { free, timeAnswer } = view;
  return (
    <Card id="person-free" title={WHEN_FREE}>
      {free?.kind === "may-not" ? <p className={styles.line}>{free.line}</p> : null}
      {free?.kind === "nothing" ? (
        <>
          {free.chart ? <WeekChartDrawn chart={free.chart} /> : null}
          <p className={styles.line}>{free.line}</p>
        </>
      ) : null}
      {free?.kind === "given" ? (
        <>
          <WeekChartDrawn chart={free.chart} />
          {free.littleMarked ? <p className={styles.line}>{free.littleMarked}</p> : null}
          {free.groups.length > 0 ? (
            <ul className={styles.fitList}>
              {free.groups.map((group) => (
                <li key={group.key} className={styles.fitItem}>
                  <span className={styles.stack}>
                    <span className={styles.fitName}>
                      <span className={`${styles.dot} ${group.fits ? styles.dotFits : styles.dotNot}`} aria-hidden="true" />
                      {group.name}
                    </span>
                    <span className={styles.listWhen}>{group.said}</span>
                  </span>
                  {group.current ? <span className={styles.chip}>{IN_THIS_GROUP}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {timeAnswer ? (
        <div className={styles.answer}>
          <h3 className={styles.answerTitle}>{timeAnswer.title}</h3>
          <p className={styles.line}>{timeAnswer.said}</p>
          {timeAnswer.why ? (
            <p className={styles.line}>
              <strong>{WHY}</strong> {timeAnswer.why}
            </p>
          ) : null}
          {timeAnswer.wouldWork ? (
            <p className={styles.line}>
              <strong>{WOULD_WORK}</strong> {timeAnswer.wouldWork}
            </p>
          ) : null}
        </div>
      ) : null}
      {view.freeFoot ? <p className={styles.hint}>{view.freeFoot}</p> : null}
    </Card>
  );
}

/** THE TEAM'S PAGE: for an admin and the programme's lead. */
export default function PersonPage({ view }: { view: TeamPersonView }) {
  const { header } = view;
  const sections = sectionsOf(view);
  return (
    <div className={styles.page}>
      <Link href={view.back.href} className={styles.backLink}>
        {view.back.label}
      </Link>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{header.programmeName}</p>
        <h1 className={styles.name}>{header.name}</h1>
        <div className={styles.chips}>
          {header.group ? <span className={styles.chip}>{header.group}</span> : null}
          {header.notTold ? <span className={styles.chip}>{NOT_TOLD}</span> : null}
          {header.status ? <span className={styles.chip}>{header.status}</span> : null}
        </div>
        {view.about || view.email ? (
          <dl className={styles.facts}>
            {view.about?.goesBy ? (
              <div className={styles.fact}>
                <dt>{GOES_BY}</dt>
                <dd>{view.about.goesBy}</dd>
              </div>
            ) : null}
            {view.about?.joined ? (
              <div className={styles.fact}>
                <dt>{JOINED}</dt>
                <dd>{view.about.joined}</dd>
              </div>
            ) : null}
            {view.email ? (
              <div className={styles.fact}>
                <dt>{EMAIL_ADDRESS}</dt>
                <dd>
                  {view.email} <span className={styles.who}>{ADMINS_ONLY_NOTE}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </header>

      {sections.length > 1 ? (
        <nav className={styles.sections} aria-label={SECTIONS_LABEL}>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className={styles.sectionLink}>
              {section.label}
            </a>
          ))}
        </nav>
      ) : null}

      <div className={styles.top}>
        <div className={styles.topMain}>
          <Card id="person-place" title={PLACE_AND_GROUP}>
            <dl className={styles.placeList}>
              {view.place.map((line) => (
                <div key={line.key} className={styles.placeRow}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            {view.visit || view.move ? (
              <div className={styles.actions}>
                {view.visit ? (
                  <Link href={view.visit.href} className={styles.button}>
                    {view.visit.label}
                  </Link>
                ) : null}
                {view.move ? (
                  <Link href={view.move.href} className={styles.button}>
                    {view.move.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </Card>

          {view.application ? (
            <Card id="person-application" title={APPLICATION}>
              {view.application.line ? <p className={styles.line}>{view.application.line}</p> : null}
              <Link href={view.application.href} className={styles.button}>
                {view.application.label}
              </Link>
              {view.claude ? <ClaudeAndPangram claude={view.claude} /> : null}
            </Card>
          ) : null}
        </div>

        {view.free || view.timeAnswer ? <WhenFree view={view} /> : null}
      </div>

      {view.weeks ? (
        <Card id="person-coursework" title={COURSEWORK} hint={COURSEWORK_HINT}>
          <Coursework weeks={view.weeks} ratings={view.ratings} />
        </Card>
      ) : null}

      <Card id="person-attendance" title={ATTENDANCE} hint={ATTENDANCE_HINT}>
        <Attendance attendance={view.attendance} />
      </Card>

      {view.feedback ? (
        <Card id="person-feedback" title={FEEDBACK} who={FEEDBACK_WHO}>
          <Feedback feedback={view.feedback} none={NO_FEEDBACK} />
        </Card>
      ) : null}

      {view.notes ? (
        // The notes' own component draws its own head, and asks its own routes who reads which note.
        <div className={styles.card} id="person-notes">
          <PersonNotes
            uid={view.uid}
            firstName={view.notes.firstName}
            place={{ run: view.notes.runId }}
            {...(view.notes.lead ? { lead: view.notes.lead } : { draft: "run" as const })}
          />
        </div>
      ) : null}

      {view.events ? (
        <Card id="person-events" title={PERSON_EVENTS_WORDS.title} who={EVENTS_WHO}>
          {view.signedUp ? <p className={styles.line}>{view.signedUp}</p> : null}
          <MemberEventsView view={view.events} />
        </Card>
      ) : null}

      {view.activity ? (
        <Card id="person-activity" title={ACTIVITY} who={ACTIVITY_WHO} hint={ACTIVITY_HINT}>
          {view.activity.length === 0 ? (
            <p className={styles.line}>{NO_ACTIVITY}</p>
          ) : (
            <ul className={styles.list}>
              {view.activity.map((line) => (
                <li key={`${line.at} ${line.said}`} className={styles.listItem}>
                  <span>
                    {line.who ? <span className={styles.activityWho}>{line.who}</span> : null}
                    {line.said}
                  </span>
                  <span className={styles.listWhen}>{line.when}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {view.account ? (
        <Card id="person-account" title={ACCOUNT} who={ONLY_ADMINS_SEE_THIS}>
          <Link href={view.account.href} className={styles.button}>
            {view.account.label}
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

/** Claude's and Pangram's reads, inside the application's card: an admin's alone, and labelled so. */
function ClaudeAndPangram({ claude }: { claude: NonNullable<TeamPersonView["claude"]> }) {
  return (
    <section className={styles.inner} aria-labelledby="person-claude">
      <div className={styles.cardHead}>
        <h3 id="person-claude" className={styles.answerTitle}>
          {CLAUDE_AND_PANGRAM}
        </h3>
        <span className={styles.chip}>{ONLY_ADMINS_SEE_THIS}</span>
      </div>
      {claude.lines.map((line, at) => (
        <p key={at} className={styles.line}>
          {line}
        </p>
      ))}
      <p className={claude.flagged ? styles.flagLine : styles.line}>{claude.pangram}</p>
    </section>
  );
}

/** THE FACILITATOR'S CUT: their group's weeks, attendance for those weeks, and their own feedback. */
export function FacilitatorPersonPage({ view }: { view: FacilitatorPersonView }) {
  return (
    <div className={styles.page}>
      <Link href={view.back.href} className={styles.backLink}>
        {view.back.label}
      </Link>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{view.header.group}</p>
        <h1 className={styles.name}>{view.header.name}</h1>
      </header>

      <Card id="person-coursework" title={COURSEWORK} hint={view.elsewhere ?? undefined}>
        <Coursework weeks={view.weeks} />
      </Card>

      <Card id="person-attendance" title={ATTENDANCE} hint={ATTENDANCE_HINT}>
        <Attendance attendance={view.attendance} />
      </Card>

      <Card id="person-feedback" title={YOUR_FEEDBACK}>
        <Feedback feedback={view.feedback} none={YOUR_FEEDBACK_NONE} />
      </Card>

      <p className={styles.hint}>{FACILITATOR_FOOT}</p>
    </div>
  );
}
