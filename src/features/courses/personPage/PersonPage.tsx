import Link from "next/link";
import type { ReactNode } from "react";
import PersonNotes from "@/features/admin/memberNotes/PersonNotes";
import { MemberEventsView } from "@/features/admin/MemberEvents";
import { PERSON_EVENTS_WORDS } from "@/lib/events/attendanceWords";
import type { AttendanceView, FacilitatorPersonView, FeedbackLine, PersonWeekRow, TeamPersonView } from "@/lib/courses/personPage/model";
import {
  ACTIVITY,
  ACTIVITY_HINT,
  ACTIVITY_WHO,
  APPLICATION,
  ATTENDANCE,
  ATTENDANCE_HINT,
  COURSEWORK,
  COURSEWORK_HINT,
  DONE,
  EVENTS_WHO,
  FACILITATOR_FOOT,
  FEEDBACK,
  FEEDBACK_WHO,
  NONE_ASKED,
  NOT_TOLD,
  NO_ACTIVITY,
  NO_FEEDBACK,
  NO_REGISTERS,
  NO_WEEKS,
  READINGS,
  REFLECTION,
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
                <td>{week.state}</td>
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
              <span>{line.said}</span>
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

/** THE TEAM'S PAGE: for an admin and the programme's lead. */
export default function PersonPage({ view }: { view: TeamPersonView }) {
  const { header } = view;
  return (
    <div className={styles.page}>
      <Link href={view.back.href} className={styles.backLink}>
        {view.back.label}
      </Link>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{header.programmeName}</p>
        <h1 className={styles.name}>{header.name}</h1>
        <div className={styles.chips}>
          <span className={styles.chip}>{header.group}</span>
          {header.notTold ? <span className={styles.chip}>{NOT_TOLD}</span> : null}
          {header.status ? <span className={styles.chip}>{header.status}</span> : null}
        </div>
        {view.move ? (
          <div className={styles.actions}>
            {/* A visit, once it exists, goes beside Move. */}
            <Link href={view.move.href} className={styles.action}>
              {view.move.label}
            </Link>
          </div>
        ) : null}
      </header>

      <Card id="person-coursework" title={COURSEWORK} hint={COURSEWORK_HINT}>
        <Coursework weeks={view.weeks} ratings={view.ratings} />
      </Card>

      <Card id="person-attendance" title={ATTENDANCE} hint={ATTENDANCE_HINT}>
        <Attendance attendance={view.attendance} />
      </Card>

      <Card id="person-feedback" title={FEEDBACK} who={FEEDBACK_WHO}>
        <Feedback feedback={view.feedback} none={NO_FEEDBACK} />
      </Card>

      {view.notes ? (
        // The notes' own component draws its own head, and asks its own routes who reads which note.
        <div className={styles.card}>
          <PersonNotes
            uid={view.uid}
            firstName={view.notes.firstName}
            place={{ run: view.notes.runId }}
            {...(view.notes.lead ? { lead: view.notes.lead } : { draft: "run" as const })}
          />
        </div>
      ) : null}

      {view.application ? (
        <Card id="person-application" title={APPLICATION}>
          <Link href={view.application.href} className={styles.action}>
            {view.application.label}
          </Link>
        </Card>
      ) : null}

      {view.events ? (
        <Card id="person-events" title={PERSON_EVENTS_WORDS.title} who={EVENTS_WHO}>
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
                  <span>{line.said}</span>
                  <span className={styles.listWhen}>{line.when}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
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
