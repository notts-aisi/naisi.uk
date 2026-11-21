"use client";

import type { ReactNode } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import type { TicketFacts } from "../sessionChange/cardFacts";
import { JOINING_ONLINE_CHIP, MOVED_THIS_WEEK, ROOM_CHANGED } from "@/lib/courses/memberPageWords";
import { JOIN_ONLINE, LINK_IS_HERE } from "@/lib/courses/sessionChange/words";
import { FOR_JOINING_ONLINE } from "@/lib/courses/joiningOnline/words";
import { memberLineWords } from "@/lib/courses/explainers/words";
import AddToCalendar from "../weekly/AddToCalendar";
import styles from "../weekly/weekly.module.css";

/**
 * THE CARD FOR A PERSON'S NEXT SESSION WITH THEIR OWN GROUP, the one shape
 * Home and the programme page both draw (`NextSessionCards` decides what goes
 * in it, once, for both):
 *
 *   YOUR NEXT SESSION · WEEK 2   [Moved this week]
 *   Thu 12 Nov, 3pm to 5pm
 *   Monica Partridge E02, University Park
 *   Group C with Rahul
 *   Why: Portland A21 is closed for an exam. Usually Wednesdays, 3pm, Portland A21.
 *   [Can't make it] [I'm joining online]
 *
 * Everything it says is the session's own, resolved for its own week
 * (`ticketFacts`). One chip at most beside the label: "Joining online" once
 * they have said so, then "Moved this week" for a session moved for its week
 * alone, then "Room changed this week" for a room that is not the group's
 * usual one. Once they have said they are joining online, one line, "Online,
 * with Group C and Rahul", stands for the room and the group.
 *
 * Kept from the ticket it replaces, for what no drawing settles: "In person
 * this week" for a week set in person, the line for a room or a link still to
 * come, the explainer the session starts with, "Add to calendar" (beside the
 * buttons on the programme page, in a row of its own on Home), and the link
 * to join in the row under the card.
 */

export type CardPerson = { uid: string; name: string; firstName: string };

export default function NextSessionCard({
  facts,
  eyebrow,
  heading,
  groupLine,
  onlineLine,
  facilitators,
  roomChanged,
  why,
  saidOnline,
  home = false,
  calendar = false,
  answers = null,
}: {
  facts: TicketFacts;
  /** "Your next session · week 2", "Tonight · week 3". */
  eyebrow: string;
  /** "Thu 12 Nov, 3pm to 5pm", or the hours alone when the eyebrow names the day. */
  heading: string;
  /** "Group C with Rahul". */
  groupLine: string;
  /** "Online, with Group C and Rahul": drawn in place of the room and group lines once they have said they are joining online. */
  onlineLine: string;
  /** The group's facilitators, for the faces beside the group line. */
  facilitators: CardPerson[];
  /** The week's room is not the group's usual one. */
  roomChanged: boolean;
  /** Under a session moved for its week alone: why, and the usual slot. "" draws nothing. */
  why: string;
  /** They have said they are joining this session online. */
  saidOnline: boolean;
  /** Home's card: Add to calendar in a row of its own under it. */
  home?: boolean;
  /** Offer "Add to calendar": a group Publish has told them about, or one they facilitate. */
  calendar?: boolean;
  /** The buttons for this session (`TicketExcuse`, `TicketAnswers`), or nothing. */
  answers?: ReactNode;
}) {
  // An online session's card carries Join online in Add to calendar's
  // place; a session in a room keeps it, whatever link it has.
  const offerCalendar = calendar && facts.joinFor !== "everybody";
  const chip = saidOnline ? (
    <span className={styles.plainChip}>{JOINING_ONLINE_CHIP}</span>
  ) : facts.moved ? (
    <span className={styles.warnChip}>{MOVED_THIS_WEEK}</span>
  ) : roomChanged && facts.place ? (
    <span className={styles.warnChip}>{ROOM_CHANGED}</span>
  ) : null;
  const inPerson = facts.mode === "in-person" ? <span className={styles.plainChip}>In person this week</span> : null;

  return (
    <section className={home ? `${styles.ticket} ${styles.ticketHome}` : styles.ticket} aria-label="Your next session">
      <div className={styles.ticketBody}>
        <div className={styles.cardHead}>
          <p className={styles.ticketEyebrow}>{eyebrow}</p>
          {chip}
          {inPerson}
        </div>
        <h2 className={styles.ticketWhen}>{heading}</h2>
        {saidOnline ? (
          <p className={`${styles.ticketRoom} ${styles.cardLine}`}>{onlineLine}</p>
        ) : (
          <>
            {facts.place && <p className={`${styles.ticketRoom} ${styles.cardLine}`}>{facts.place}</p>}
            {groupLine && (
              <p className={`${styles.ticketWith} ${styles.cardLine}`}>
                {facilitators.length > 0 && (
                  <span className={styles.faces} aria-hidden="true">
                    {facilitators.map((person) => (
                      <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="sm" />
                    ))}
                  </span>
                )}
                <span>{groupLine}</span>
              </p>
            )}
          </>
        )}
        {why && <p className={styles.ticketNote}>{why}</p>}
        {facts.missing && <p className={styles.ticketNote}>{facts.missing}</p>}
        {facts.explainer && <p className={styles.ticketExplainer}>{memberLineWords(facts.explainer.minutes, facts.explainer.topic)}</p>}
        {((offerCalendar && !home) || answers) && (
          <div className={styles.ticketActions}>
            {offerCalendar && !home && <AddToCalendar />}
            {answers}
          </div>
        )}
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
      {offerCalendar && home && (
        <div className={styles.ticketFoot}>
          <AddToCalendar home />
        </div>
      )}
    </section>
  );
}
