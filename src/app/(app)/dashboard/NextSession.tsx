"use client";

import type { ReactNode } from "react";
import Chip from "@/components/ui/Chip";
import DateTile from "@/components/ui/DateTile";
import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { GROUP_FIELD_LIMITS, type GroupSessionMode } from "@/lib/firestore/courseGroups";
import { validateSubmissionUrl, weekDocId } from "@/lib/firestore/courses";
import { clockLabel, dayLabel, tilePartsOfDay } from "./homeWords";
import styles from "./home.module.css";

/**
 * Home's own next-session card: the date as a tile, when and where, and who
 * with. The week page and the group page have a session card of their own;
 * this one is the top of Home and nothing else uses it.
 *
 * WHICH SESSION. `calendar.nextSession` is the group's next meeting that has
 * not finished, so on the morning after a session this card has already moved
 * on to next week's.
 *
 * WHICH ROOM. The room and the joining link on the payload are resolved for
 * the week the group is in now. They are printed only when the next session
 * is in that week, or when no week's own arrangements were applied at all (a
 * run that has not started): a room that was changed for this week only must
 * not be printed beside next week's date. When neither holds the card gives
 * the date and the time, and the week's own page gives the rest.
 *
 * Whether a week is online or in person is sent for every week, so that part
 * is always the next session's own.
 */

export type SessionFacts = {
  weekNumber: number;
  dateKey: string;
  startTimeLocal: string;
  /** Set when the session is in a room and the room may be named. */
  room: string | null;
  mode: GroupSessionMode | null;
  /** Set when the session is online and the link may be given. */
  joinUrl: string | null;
  /** A sentence for a week that is online or in person with nothing to show for it yet. */
  missing: string | null;
};

export function sessionFacts(group: OverviewGroup): SessionFacts | null {
  const next = group.calendar.nextSession;
  if (!next) return null;

  const current = group.calendar.currentWeek;
  const slotWeek = current ? (current.weekNumber ?? current.anchorWeekNumber) : 0;
  const slotIsNextSessions = slotWeek === next.weekNumber || slotWeek < 1;
  const mode = group.sessionModes[weekDocId(next.weekNumber)] ?? null;

  // Facilitators write the link. The same check the editor makes on save is
  // made again here, so an address stored before that check existed cannot
  // put anything but a web address behind a button.
  const link =
    slotIsNextSessions &&
    group.meetingUrl &&
    !validateSubmissionUrl(group.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl)
      ? group.meetingUrl
      : null;
  const room = slotIsNextSessions && mode !== "virtual" && group.location ? group.location : null;
  const joinUrl = mode !== "in-person" ? link : null;

  return {
    weekNumber: next.weekNumber,
    dateKey: next.dateKey,
    startTimeLocal: next.startTimeLocal,
    room,
    mode,
    joinUrl,
    missing:
      mode === "virtual" && !joinUrl
        ? "Your facilitator will send the joining link."
        : mode === "in-person" && !room
          ? "Your facilitator will confirm the room."
          : null,
  };
}

type CardParts = {
  eyebrow: string;
  /** A shorter eyebrow for a phone, where the long one would take two lines. */
  eyebrowShort?: string;
  facts: SessionFacts;
  /** Who is there: "with Rahul and Sofia", or "8 in the group". */
  people?: ReactNode;
  /** A main action under the details. */
  actions?: ReactNode;
  /** A strip along the foot of the card. */
  foot?: ReactNode;
};

export default function NextSession({
  eyebrow,
  eyebrowShort,
  facts,
  people,
  actions,
  foot,
}: CardParts) {
  const tile = tilePartsOfDay(facts.dateKey);
  const day = dayLabel(facts.dateKey);
  const clock = clockLabel(facts.startTimeLocal);
  const when = [day, clock].filter(Boolean).join(", ");

  return (
    <section className={styles.session} aria-label="Your next session">
      {tile && (
        <DateTile
          size="hero"
          weekday={tile.weekday}
          day={tile.day}
          month={tile.month}
          dateTime={facts.dateKey}
          className={styles.sessionTile}
        />
      )}
      <div className={styles.sessionMain}>
        <div className={styles.sessionBody}>
          {eyebrowShort ? (
            // One of the two is drawn, by the stylesheet: the long one on a
            // laptop and the short one on a phone.
            <p className={`meta ${styles.sessionEyebrow}`}>
              <span className={styles.wideOnly}>{eyebrow}</span>
              <span className={styles.phoneOnly}>{eyebrowShort}</span>
            </p>
          ) : (
            <p className={`meta ${styles.sessionEyebrow}`}>{eyebrow}</p>
          )}
          <h2 className={styles.sessionWhen}>{when}</h2>
          <div className={styles.sessionFacts}>
            {facts.room && <span className={styles.sessionRoom}>{facts.room}</span>}
            {facts.mode && (
              <Chip tone={facts.mode === "virtual" ? "accent" : "neutral"}>
                {facts.mode === "virtual" ? "Online this week" : "In person this week"}
              </Chip>
            )}
            {people}
          </div>
          {facts.missing && <p className={styles.sessionNote}>{facts.missing}</p>}
          {(facts.joinUrl || actions) && (
            <div className={styles.sessionActions}>
              {facts.joinUrl && (
                <a
                  className={styles.secondaryLarge}
                  href={facts.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join the call
                </a>
              )}
              {actions}
            </div>
          )}
        </div>
        {foot && <div className={styles.sessionFoot}>{foot}</div>}
      </div>
    </section>
  );
}
