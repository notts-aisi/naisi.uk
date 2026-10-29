"use client";

import type { ReactNode } from "react";
import type { RingPerson } from "@/lib/applications/arrange/view";
import { own } from "@/lib/applications/keys";
import { lengthWords } from "@/lib/courses/sessionLength";
import { MARK_CANT_MAKE } from "@/lib/courses/timeAnswer/words";
import styles from "./Circles.module.css";
import type { DrawnRing } from "./circlesModel";
import {
  BACK_UP,
  FACILITATING,
  LEAD,
  MOVE_HERE,
  MOVE_HERE_CANT,
  MOVES_IN,
  NEW_GROUP,
  NEW_TIME,
  NOT_TOLD,
  NO_TIME_YET,
  PANGRAM_FLAG,
  ROLE_VERB,
  facilitatingOutside,
  moveAria,
  seatsLine,
  whenWords,
} from "./circlesWords";

/**
 * ONE GROUP AS A RING (Circles): its day, time and programme in the middle,
 * its people around the edge. A person who facilitates it is marked, and so
 * is anybody who cannot make its time, anybody Pangram flagged, anybody
 * Publish has not told yet, and, in a preview, anybody who would move in and
 * every facilitator it adds. Pressing the middle while a person is picked
 * moves them here; the screen decides whether that saves or changes the
 * preview.
 */

/** "Amara Okafor" as a name tag: "Amara O." */
function tagName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

const ROLE_LABEL = { facilitating: FACILITATING, lead: LEAD, second: BACK_UP } as const;

export default function Ring({
  ring,
  people,
  near,
  programme,
  selected,
  canMoveHere,
  warnings,
  showNotTold,
  disabled,
  locked,
  onSelect,
  onMoveHere,
  children,
}: {
  ring: DrawnRing;
  people: Record<string, RingPerson>;
  near: ReadonlySet<string>;
  /** The programme's short name, in the middle. */
  programme: string;
  selected: string | null;
  /** The picked person may be moved here. */
  canMoveHere: boolean;
  warnings: string[];
  /** Mark people Publish has not told their group (the run has been published, and this is the run as it is). */
  showNotTold: boolean;
  disabled: boolean;
  /** Nothing may be picked: a press is being sent. */
  locked: boolean;
  onSelect: (uid: string) => void;
  onMoveHere: () => void;
  /** What sits under the ring: its time control, or "Remove this group". */
  children?: ReactNode;
}) {
  const n = ring.memberUids.length;
  const chosen = selected ? own(people, selected) : undefined;
  const selectedFits = selected !== null && ring.canMake.includes(selected);
  const when = ring.session ? whenWords(ring.session) : NO_TIME_YET;
  return (
    <div className={styles.ringCard}>
      <div className={`${styles.ring} ${warnings.length > 0 ? styles.ringWarn : ""} ${ring.isNew ? styles.ringNew : ""}`}>
        <div className={styles.circle} aria-hidden="true" />
        <button
          type="button"
          className={`${styles.centre} ${canMoveHere ? styles.centreTarget : ""}`}
          disabled={disabled || !canMoveHere}
          onClick={onMoveHere}
          aria-label={canMoveHere && chosen ? moveAria(chosen.name, ring.name) : `${ring.name}, ${when}`}
        >
          <span className={styles.when}>{when}</span>
          <span className={styles.centreLine}>
            {ring.session ? `${lengthWords(ring.session.durationMinutes)} · ` : ""}
            {programme}
          </span>
          <span className={styles.centreLine}>
            {seatsLine(ring.name, n, ring.room)}
            {ring.isNew ? ` · ${NEW_GROUP}` : ring.newTime ? ` · ${NEW_TIME}` : ""}
          </span>
          {canMoveHere ? (
            <span className={selectedFits || !ring.session ? styles.moveHint : styles.moveHintWarn}>
              {selectedFits || !ring.session ? MOVE_HERE : MOVE_HERE_CANT}
            </span>
          ) : null}
        </button>
        {ring.memberUids.map((uid, i) => {
          const person = own(people, uid);
          const angle = ((-90 + (360 * i) / Math.max(n, 1)) * Math.PI) / 180;
          const role = own(ring.roles, uid) ?? null;
          const off = near.has(uid) || (ring.session !== null && !ring.canMake.includes(uid));
          const movesIn = ring.movesIn.includes(uid);
          const notTold = showNotTold && person !== undefined && person.groupId !== null && !person.told;
          return (
            <button
              key={uid}
              type="button"
              className={[
                styles.chip,
                role?.label === "lead" || role?.label === "facilitating" ? styles.chipLead : "",
                role?.label === "second" ? styles.chipSecond : "",
                role?.isNew ? styles.chipNewRole : "",
                movesIn ? styles.chipMoves : "",
                off ? styles.chipOff : "",
                selected === uid ? styles.chipSelected : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` }}
              disabled={locked}
              aria-pressed={selected === uid}
              title={person?.name}
              onClick={() => onSelect(uid)}
            >
              {role ? <span className={styles.chipRole}>{ROLE_LABEL[role.label]}</span> : null}
              {!role && movesIn ? <span className={styles.chipRole}>{MOVES_IN}</span> : null}
              <span>{tagName(person?.name ?? "?")}</span>
              {notTold ? <span className={styles.chipNote}>{NOT_TOLD}</span> : null}
              {/* Only on the live run: a preview shows where people would go, not what they said. */}
              {showNotTold && person?.timeAnswer?.kind === "cant" ? (
                <span className={`${styles.chipNote} ${styles.chipCant}`}>{MARK_CANT_MAKE}</span>
              ) : null}
              {person?.flags ? (
                <span className={styles.chipFlag} aria-label={PANGRAM_FLAG}>
                  !
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {ring.outside.length > 0 ? <p className={styles.facilitatorWhy}>{facilitatingOutside(ring.outside)}</p> : null}
      {ring.why ? <p className={styles.why}>{ring.why}</p> : null}
      {ring.whys.map((f) => (
        <p key={f.uid} className={styles.facilitatorWhy}>
          <strong>{own(people, f.uid)?.name}</strong> {ROLE_VERB[f.role]}: {f.why}
        </p>
      ))}
      {warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}
