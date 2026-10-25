"use client";

import InitialsChip from "@/components/ui/InitialsChip";
import { tilePartsOfDay } from "@/app/(app)/dashboard/homeWords";
import type { TicketFacts } from "../sessionChange/cardFacts";
import { ROOM_CHANGED, withWords } from "@/lib/courses/memberPageWords";
import { JOIN_ONLINE, LINK_IS_HERE } from "@/lib/courses/sessionChange/words";
import styles from "./weekly.module.css";

/**
 * THE NEXT SESSION, AS A TICKET (boards wk-programme, st-programme and
 * wk-home-phone): its date on the stub, what it is over the heading, and
 * where and with whom under it.
 *
 * Everything it shows is the session's own, resolved for its own week
 * (`ticketFacts`): a session moved for one week shows its new day, time and
 * room, an online week shows "Online this week" and the link to join, and a
 * room that is not the group's usual one says so beside it.
 *
 * "Add to calendar" and "Can’t make it", which the boards draw under the
 * heading, are not here: neither feature exists yet, and the page draws no
 * control for one that does not.
 */

export type TicketPerson = { uid: string; name: string; firstName: string };

type Props = {
  facts: TicketFacts;
  /** "Tonight · week 3", "Your first session · week 1". */
  eyebrow: string;
  /** "Tue 17 Nov, 6pm to 8pm", or on Home "Group B, 6pm to 8pm". */
  heading: string;
  /** The week's room is not the group's usual one. */
  roomChanged: boolean;
  /** The group's facilitators, for "with Rahul and Sofia". Empty draws nothing. */
  facilitators: TicketPerson[];
  /** Home's narrower ticket, with the room and the people each on a line of their own. */
  home?: boolean;
};

export default function SessionTicket({ facts, eyebrow, heading, roomChanged, facilitators, home = false }: Props) {
  const tile = tilePartsOfDay(facts.dateKey);
  const withLine = withWords(facilitators.map((person) => person.firstName));
  const faces = (
    <span className={styles.faces} aria-hidden="true">
      {facilitators.map((person) => (
        <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="sm" />
      ))}
    </span>
  );
  const modeChip =
    facts.mode === "virtual" ? (
      <span className={styles.liveChip}>Online this week</span>
    ) : facts.mode === "in-person" ? (
      <span className={styles.plainChip}>In person this week</span>
    ) : null;

  return (
    <section className={home ? `${styles.ticket} ${styles.ticketHome}` : styles.ticket} aria-label="Your next session">
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
          {home ? (
            <>
              {(facts.room || modeChip) && (
                <div className={styles.ticketFacts}>
                  {facts.room && <span className={styles.ticketRoom}>{facts.room}</span>}
                  {roomChanged && facts.room && <span className={styles.warnChip}>{ROOM_CHANGED}</span>}
                  {modeChip}
                </div>
              )}
              {withLine && (
                <div className={styles.ticketWith}>
                  {faces}
                  <span>{withLine}</span>
                </div>
              )}
            </>
          ) : (
            (facts.room || modeChip || withLine) && (
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
            )
          )}
          {facts.missing && <p className={styles.ticketNote}>{facts.missing}</p>}
          {facts.joinUrl && (
            <>
              <div className={styles.ticketActions}>
                <a className={styles.joinButton} href={facts.joinUrl} target="_blank" rel="noopener noreferrer">
                  {JOIN_ONLINE}
                </a>
              </div>
              <p className={styles.ticketNote}>{LINK_IS_HERE}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
