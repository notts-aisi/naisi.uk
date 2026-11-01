import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import type { TeamPageView } from "@/lib/courses/teamPage/views";
import {
  UPDATES,
  HAND_IN,
  NO_UPDATES,
  PAPER,
  THE_PROJECT,
  THE_TWIST,
  THE_WEEKS,
  WHATS_IN_THE_WAY,
  WHAT_WE_DID,
  YOUR_TWIST,
  weekWords,
} from "@/lib/courses/teamPage/words";
import SessionTicket from "../weekly/SessionTicket";
import weekly from "../weekly/weekly.module.css";
import CheckInForm from "./CheckInForm";
import TeamLinks from "./TeamLinks";
import styles from "./team.module.css";

/**
 * A TEAM'S PAGE (boards in-team at 1440 and in-team-phone at 390): the
 * team's name and people with its group's slot and room, "The project" from
 * its pitch, the group's next session, "This week’s update", "Team links",
 * "Hand-in", and "The weeks" across both terms.
 *
 * Drawn on the server from `TeamPageView`, every field built there from
 * records. Three parts need the page's script: the check-in's Save, adding
 * and removing a link, and nothing else; each waits for it.
 *
 * The programme's lead and admins read the same page from the Teams tab
 * (`reader: "staff"`): every week's check-in in place of this week's box,
 * the hand-in's words in its card, no ticket (it is a member's next
 * session), and nothing to write.
 *
 * NOT DRAWN, though the board draws them: "food provided" in the head and
 * "Pairs tonight: …" on the ticket. No record holds either yet, and the page
 * draws nothing it cannot read from one.
 */

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ArrowOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const TICK_CLASS = { done: styles.tickDone, current: styles.tickCurrent, upcoming: "" } as const;

export default function TeamPage({ view, addingLink = false }: { view: TeamPageView; addingLink?: boolean }) {
  const staff = view.reader === "staff";
  return (
    <div className={weekly.programme}>
      <div className={`${weekly.bar} ${weekly.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={view.back.href} className={weekly.back}>
            <ChevronLeft />
            <span>{view.back.short}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>{view.name}</div>
        <div className={weekly.barEnd} />
      </div>

      <header className={styles.head}>
        <Link href={view.back.href} className={styles.deskBack}>
          <ChevronLeft />
          <span>{view.back.label}</span>
        </Link>
        <p className={weekly.eyebrow}>{view.eyebrow}</p>
        <h1 className={styles.teamTitle}>{view.name}</h1>
        <p className={styles.headLine}>
          {view.people.length > 0 ? (
            <span className={styles.faces} aria-hidden="true">
              {view.people.map((person) => (
                <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="md" />
              ))}
            </span>
          ) : null}
          <span>{view.headLine}</span>
        </p>
      </header>

      <div className={weekly.columns}>
        <div className={weekly.colMain}>
          {view.project ? (
            <section className={`${styles.card} ${styles.cardRows}`} aria-labelledby="team-project">
              <h2 id="team-project" className={styles.h2}>
                {THE_PROJECT}
              </h2>
              {"line" in view.project ? (
                <p className={styles.text}>{view.project.line}</p>
              ) : (
                <div className={styles.rows}>
                  {view.project.paper ? (
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{PAPER}</span>
                      <span className={styles.rowValue}>
                        {view.project.paper.url ? (
                          <a className={styles.rowLink} href={view.project.paper.url} target="_blank" rel="noopener noreferrer">
                            {view.project.paper.title}
                            <ArrowOut />
                          </a>
                        ) : (
                          view.project.paper.title
                        )}
                      </span>
                    </div>
                  ) : null}
                  {view.project.twist ? (
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{staff ? THE_TWIST : YOUR_TWIST}</span>
                      <span className={styles.rowValue}>{view.project.twist}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {view.ticket ? (
            <SessionTicket
              facts={view.ticket.facts}
              eyebrow={view.ticket.eyebrow}
              heading={view.ticket.heading}
              roomChanged={view.ticket.roomChanged}
              facilitators={[]}
            />
          ) : null}

          {view.checkIn ? (
            <CheckInForm
              runId={view.runId}
              weekNumber={view.checkIn.weekNumber}
              did={view.checkIn.did}
              inTheWay={view.checkIn.inTheWay}
              canSave={view.checkIn.canSave}
              whoLine={view.whoLine}
            />
          ) : null}

          {staff ? (
            <section className={styles.card} aria-labelledby="team-updates">
              <h2 id="team-updates" className={styles.h2}>
                {UPDATES}
              </h2>
              {view.checkIns.length === 0 ? (
                <p className={styles.quiet}>{NO_UPDATES}</p>
              ) : (
                <ul className={styles.checkInList}>
                  {view.checkIns.map((checkIn) => (
                    <li key={checkIn.weekNumber} className={styles.checkInItem}>
                      <p className={styles.checkInWeek}>
                        {weekWords(checkIn.weekNumber)} · {checkIn.savedLine}
                      </p>
                      {checkIn.did ? (
                        <>
                          <p className={styles.checkInLabel}>{WHAT_WE_DID}</p>
                          <p className={styles.text}>{checkIn.did}</p>
                        </>
                      ) : null}
                      {checkIn.inTheWay ? (
                        <>
                          <p className={styles.checkInLabel}>{WHATS_IN_THE_WAY}</p>
                          <p className={styles.text}>{checkIn.inTheWay}</p>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <div className={weekly.colSide}>
          <TeamLinks
            runId={view.runId}
            links={view.links}
            canChange={view.canChangeLinks}
            adding={addingLink}
            whoLine={view.whoLine}
          />

          <section className={`${styles.card} ${styles.cardSide}`} aria-labelledby="team-hand-in">
            <h2 id="team-hand-in" className={`${styles.h2} ${styles.h2Side}`}>
              {HAND_IN}
            </h2>
            <p className={styles.text}>{view.handIn.asks}</p>
            {view.handIn.showcase ? <p className={styles.quiet}>{view.handIn.showcase}</p> : null}
            {view.handIn.handedIn ? <p className={styles.quiet}>{view.handIn.handedIn}</p> : null}
            {view.handIn.entry ? (
              <div className={styles.handedIn}>
                <a className={styles.rowLink} href={view.handIn.entry.url} target="_blank" rel="noopener noreferrer">
                  {view.handIn.entry.shown}
                  <ArrowOut />
                </a>
                <p className={styles.text}>{view.handIn.entry.summary}</p>
                {view.handIn.entry.whoDidWhat ? <p className={styles.quiet}>{view.handIn.entry.whoDidWhat}</p> : null}
              </div>
            ) : null}
            {view.handIn.action ? (
              <Link href={view.handIn.action.href} className={styles.cardLink}>
                <span>{view.handIn.action.label}</span>
                <ArrowRight />
              </Link>
            ) : null}
          </section>

          {view.weeks ? (
            <section className={`${styles.card} ${styles.cardSide}`} aria-labelledby="team-weeks">
              <h2 id="team-weeks" className={`${styles.h2} ${styles.h2Side}`}>
                {THE_WEEKS}
              </h2>
              {view.weeks.sentence ? <p className={styles.text}>{view.weeks.sentence}</p> : null}
              <div className={styles.weeksBar}>
                {view.weeks.segments.map((segment, index) => (
                  <div key={`${segment.label}-${index}`} className={styles.segment} style={{ flexGrow: segment.weeks.length }}>
                    <span className={styles.segmentLabel}>{segment.label}</span>
                    <ol className={styles.ticks}>
                      {segment.weeks.map((week) => (
                        <li
                          key={week.weekNumber}
                          className={`${styles.tick} ${TICK_CLASS[week.state]}`}
                          aria-current={week.state === "current" ? "step" : undefined}
                        >
                          <span className={styles.tickBar} aria-hidden="true" />
                          <span className={styles.tickLabel}>
                            <span aria-hidden="true">W{week.weekNumber}</span>
                            <span className={styles.srOnly}>{weekWords(week.weekNumber)}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
