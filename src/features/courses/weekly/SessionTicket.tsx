"use client";

import InitialsChip from "@/components/ui/InitialsChip";
import { tilePartsOfDay } from "@/app/(app)/dashboard/homeWords";
import type { TicketFacts } from "../sessionChange/cardFacts";
import { ROOM_CHANGED, withWords } from "@/lib/courses/memberPageWords";
import { JOIN_ONLINE, LINK_IS_HERE } from "@/lib/courses/sessionChange/words";
import { FOR_JOINING_ONLINE } from "@/lib/courses/joiningOnline/words";
import { memberLineWords } from "@/lib/courses/explainers/words";
import styles from "./weekly.module.css";

/**
 * A SESSION, AS A TICKET: its date on the stub, what it is over the heading,
 * and where and with whom under it. The team's page draws its team's next
 * session with it. A member's next session on Home and on the programme page
 * is `NextSessionCard` (`../nextSession/`).
 *
 * Everything it shows is the session's own, resolved for its own week
 * (`TicketFacts`): a session moved for one week shows its new day, time and
 * room, an online week says so in its eyebrow (which the caller words) and
 * offers the link to join, and a room that is not the group's usual one says
 * so beside it. A session an admin scheduled an explainer for says so under
 * the room, from the session's own facts: how long and what about, never who
 * scheduled it.
 */

export type TicketPerson = { uid: string; name: string; firstName: string };

type Props = {
  facts: TicketFacts;
  /** "Tonight · week 3", "Your first session · week 1". */
  eyebrow: string;
  /** "Tue 17 Nov, 6pm". */
  heading: string;
  /** The week's room is not the group's usual one. */
  roomChanged: boolean;
  /** The facilitators, for "with Rahul and Sofia". Empty draws nothing. */
  facilitators: TicketPerson[];
};

export default function SessionTicket({ facts, eyebrow, heading, roomChanged, facilitators }: Props) {
  const tile = tilePartsOfDay(facts.dateKey);
  const withLine = withWords(facilitators.map((person) => person.firstName));
  const faces = (
    <span className={styles.faces} aria-hidden="true">
      {facilitators.map((person) => (
        <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="sm" />
      ))}
    </span>
  );
  // An online week is said in the eyebrow; a week set in person
  // keeps its chip.
  const modeChip = facts.mode === "in-person" ? <span className={styles.plainChip}>In person this week</span> : null;

  return (
    <section className={styles.ticket} aria-label="Your next session">
      <div className={styles.ticketRow}>
        {tile && (
          <time className={styles.stub} dateTime={facts.dateKey}>
            <span className={styles.stubWeekday}>{tile.weekday}</span>
            <span className={styles.stubDay}>{tile.day}</span>
            <span className={styles.stubMonth}>{tile.month}</span>
          </time>
        )}
        <div className={styles.ticketMain}>
          <div className={styles.ticketBody}>
            <p className={styles.ticketEyebrow}>{eyebrow}</p>
            <h2 className={styles.ticketWhen}>{heading}</h2>
            {(facts.room || modeChip || withLine) && (
              <div className={styles.ticketFacts}>
                {facts.room && <span className={styles.ticketRoom}>{facts.room}</span>}
                {modeChip}
                {roomChanged && facts.room ? (
                  <span className={styles.warnChip}>{ROOM_CHANGED}</span>
                ) : (
                  withLine && (
                    <span className={styles.ticketWith}>
                      {faces}
                      <span>{withLine}</span>
                    </span>
                  )
                )}
              </div>
            )}
            {facts.missing && <p className={styles.ticketNote}>{facts.missing}</p>}
            {facts.explainer && (
              <p className={styles.ticketExplainer}>{memberLineWords(facts.explainer.minutes, facts.explainer.topic)}</p>
            )}
          </div>
        </div>
      </div>
      {facts.joinUrl && (
        /* The row under the card: the link to join, and under
           it who it is for and that the link is only here. */
        <div className={`${styles.ticketFoot} ${styles.joinFoot}`}>
          <a className={styles.joinButton} href={facts.joinUrl} target="_blank" rel="noopener noreferrer">
            {JOIN_ONLINE}
          </a>
          <p className={styles.joinNote}>
            {facts.joinFor === "joining-online" ? `${FOR_JOINING_ONLINE} ` : ""}
            {LINK_IS_HERE}
          </p>
        </div>
      )}
    </section>
  );
}
