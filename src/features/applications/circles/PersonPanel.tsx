"use client";

import Link from "next/link";
import type { SessionSlot } from "@/lib/admissions/availability";
import type { RingPerson } from "@/lib/applications/arrange/view";
import { own } from "@/lib/applications/keys";
import WeekChart from "../times/WeekChart";
import styles from "./Circles.module.css";
import type { DrawnRing } from "./circlesModel";
import {
  AS_A_FACILITATOR,
  ASK_THEM,
  ASK_THEM_WHY,
  CONCERNS,
  DIDNT_OFFER,
  DONE,
  FACILITATORS_VIEW,
  LEAN,
  LITTLE_MARKED,
  MAKE_BACK_UP,
  MAKE_FACILITATOR,
  MAKE_LEAD,
  NOT_A_FACILITATOR,
  NOT_READ,
  NO_WEEK,
  OFFERED,
  OPEN_APPLICATION,
  POTENTIAL,
  PREVIEW_NOT_OFFERED,
  START_A_GROUP,
  STOP_FACILITATING,
  STRENGTHS,
  TAKE_OUT,
  TOLD,
  facilitatesLine,
  pangramLine,
  startCounts,
  thinLine,
  whenWords,
  whereLine,
} from "./circlesWords";

/**
 * THE PERSON PICKED ON CIRCLES: a link to their application, whether they
 * offered to facilitate, Claude's read and their Pangram line, and their
 * marked week against every group's time (`../times/WeekChart.tsx`), each
 * group a "Move here". On the run as it is a move saves at once; in a
 * preview it changes the preview. Somebody who facilitates a group is not
 * moved: the panel says why and what to do.
 */

export type Start = { session: SessionSlot; leftOut: number; everybody: number };

export default function PersonPanel({
  person,
  ring,
  rings,
  grid,
  preview,
  outside,
  starts,
  facilitatorsHref,
  disabled,
  onMove,
  onStart,
  onRole,
  onFacilitate,
  onClose,
}: {
  person: RingPerson;
  /** The ring they are in on the screen, or null. */
  ring: DrawnRing | null;
  rings: readonly DrawnRing[];
  grid: { startMinute: number; endMinute: number };
  /** A preview is on the screen: changes go to it, not to the run. */
  preview: boolean;
  /** How many are in no group, for the new-group counts. */
  outside: number;
  starts: Start[];
  facilitatorsHref: string;
  disabled: boolean;
  onMove: (key: string | null) => void;
  onStart: (session: SessionSlot) => void;
  /** In a preview: make them lead or back-up of their group, or neither. */
  onRole: (role: "lead" | "second" | null) => void;
  /** On the run as it is: make them a facilitator of their group, or stop. */
  onFacilitate: (ring: DrawnRing, add: boolean) => void;
  onClose: () => void;
}) {
  const facilitates = person.appointed
    .map((id) => rings.find((each) => each.id === id))
    .filter((each): each is DrawnRing => each !== undefined);
  const pinned = facilitates.length > 0;
  const role = ring ? (own(ring.roles, person.uid) ?? null) : null;
  const read = person.read;

  return (
    <div className={styles.person}>
      <div className={styles.personHead}>
        <strong>{person.name}</strong>
        <a className={styles.link} href={person.href} target="_blank" rel="noreferrer">
          {OPEN_APPLICATION}
        </a>
      </div>
      <p className={styles.line}>
        {person.offered ? OFFERED : DIDNT_OFFER}
        {person.told ? TOLD : ""}
        {person.littleMarked ? LITTLE_MARKED : ""}
      </p>
      {person.potential ? (
        <p className={styles.line}>
          <strong>{AS_A_FACILITATOR(own(POTENTIAL, person.potential.level) ?? person.potential.level)}</strong>{" "}
          {person.potential.why}
        </p>
      ) : null}
      <p className={person.flags ? styles.flagLine : styles.line}>{pangramLine(person.flags)}</p>
      {read ? (
        <div className={styles.read}>
          <p className={styles.line}>
            {read.lean ? <strong>{LEAN(read.lean)}</strong> : null}
            {read.summary}
          </p>
          {read.strengths.length > 0 ? <p className={styles.line}>{STRENGTHS(read.strengths)}</p> : null}
          {read.concerns.length > 0 ? <p className={styles.line}>{CONCERNS(read.concerns)}</p> : null}
          {read.thin > 0 ? <p className={styles.line}>{thinLine(read.thin)}</p> : null}
        </div>
      ) : (
        <p className={styles.line}>{NOT_READ}</p>
      )}

      {pinned ? (
        <div className={styles.pinned}>
          <p className={styles.flagLine}>{facilitatesLine(facilitates.map((each) => each.name).join(" and "))}</p>
          <div className={styles.personActions}>
            {!preview
              ? facilitates.map((each) => (
                  <button key={each.key} type="button" className={styles.small} disabled={disabled} onClick={() => onFacilitate(each, false)}>
                    {STOP_FACILITATING(each.name)}
                  </button>
                ))
              : null}
            <Link className={styles.link} href={facilitatorsHref}>
              {FACILITATORS_VIEW}
            </Link>
          </div>
        </div>
      ) : (
        <p className={styles.line}>{whereLine(ring?.name ?? null)}</p>
      )}
      {person.week.said ? null : <p className={styles.flagLine}>{NO_WEEK}</p>}
      <WeekChart
        grid={grid}
        marked={person.week.marked}
        fromFirstMark={person.week.fromFirstMark}
        groups={rings.flatMap((each) =>
          each.session
            ? [
                {
                  key: each.key,
                  name: each.name,
                  session: each.session,
                  fits: each.canMake.includes(person.uid),
                  current: each.memberUids.includes(person.uid),
                },
              ]
            : [],
        )}
        disabled={disabled || pinned}
        onPick={(key) => onMove(key)}
      />
      {!pinned && starts.length > 0 ? (
        <div className={styles.starts}>
          <span className={styles.line}>{START_A_GROUP}</span>
          <div className={styles.tray}>
            {starts.map((start) => (
              <button
                key={`${start.session.weekday}@${start.session.startTimeLocal}`}
                type="button"
                className={styles.trayChip}
                disabled={disabled}
                onClick={() => onStart(start.session)}
              >
                {whenWords(start.session)}
                <span className={styles.trayWhy}> · {startCounts(start.leftOut, outside, start.everybody)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={styles.personActions}>
        {ring && !pinned && preview ? (
          <>
            <button type="button" className={styles.small} disabled={disabled || role?.label === "lead"} onClick={() => onRole("lead")}>
              {MAKE_LEAD}
            </button>
            <button type="button" className={styles.small} disabled={disabled || role?.label === "second"} onClick={() => onRole("second")}>
              {MAKE_BACK_UP}
            </button>
            {role && role.isNew ? (
              <button type="button" className={styles.small} disabled={disabled} onClick={() => onRole(null)}>
                {NOT_A_FACILITATOR}
              </button>
            ) : null}
          </>
        ) : null}
        {ring && ring.id !== null && !pinned && !preview && person.offered ? (
          <button type="button" className={styles.small} disabled={disabled} onClick={() => onFacilitate(ring, true)}>
            {MAKE_FACILITATOR(ring.name)}
          </button>
        ) : null}
        {ring && !pinned ? (
          <button type="button" className={styles.small} disabled={disabled} onClick={() => onMove(null)}>
            {TAKE_OUT}
          </button>
        ) : null}
        <button type="button" className={styles.smallQuiet} onClick={onClose}>
          {DONE}
        </button>
      </div>
      {ring && !pinned && !person.offered ? (
        <p className={styles.line}>
          {preview && role ? PREVIEW_NOT_OFFERED : ASK_THEM_WHY}{" "}
          {!preview ? (
            <Link className={styles.link} href={facilitatorsHref}>
              {ASK_THEM}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
