"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ringStyles from "@/features/applications/circles/Circles.module.css";
import { FACILITATING, FACILITATING_OUTSIDE, MOVED, NOT_TOLD, PANGRAM_FLAG, moveAria } from "@/features/applications/circles/circlesWords";
import { groupPagePath } from "@/lib/courses/groupPage/words";
import { MARK_CANT_MAKE } from "@/lib/courses/timeAnswer/words";
import styles from "./RingsBoard.module.css";
import type { BoardRing } from "./ringsModel";
import * as words from "./peopleInGroupsWords";

/**
 * PEOPLE IN GROUPS SHOWN AS RINGS: the drawing Circles had, on the same page
 * as Columns, with the same toolbar, counts, panel, moves and Publish around
 * it (`PeopleInGroups.tsx`, which hands everything in).
 *
 * To place first, as a row of names (an invited person among them, marked
 * so), then each of the run's groups as a ring: its name (to its page), how
 * full it is and its time in the middle, its people round the edge, and
 * under it Circles' sentences about what is wrong with it. A name opens the
 * person's panel, as on Columns; while it is open, the middle of every ring
 * the person can be moved to says "Move here", which is the card's own move.
 *
 * Nothing here works anything out about anybody's time: each ring's marks
 * and sentences arrive made (`ringsOf` in `./ringsModel.ts`), from the
 * panel's one gated read alone.
 */

export type TrayPerson = { uid: string; name: string; invited: boolean };

type Props = {
  roundId: string;
  programmeId: string;
  rings: BoardRing[];
  /** To place, and the invited, by name. */
  tray: TrayPerson[];
  /** Under To place: its notes, and the card for a run with no groups yet. */
  beforeRings?: ReactNode;
  /** Whose panel is open, and their name. */
  selected: string | null;
  selectedName: string;
  /** The words in a ring's middle for moving the person whose panel is open there, or null where they can't be moved. */
  moveHere: (ring: BoardRing) => string | null;
  busy: boolean;
  /** A name pressed: whose panel to open, and the name it was opened from, where the focus goes back to. */
  onOpen: (uid: string, from: HTMLElement) => void;
  onMoveHere: (groupId: string) => void;
  /** The legend under the rings: an admin's, or the lead's without Claude and Pangram. */
  legend: string;
};

export default function RingsBoard({
  roundId,
  programmeId,
  rings,
  tray,
  beforeRings = null,
  selected,
  selectedName,
  moveHere,
  busy,
  onOpen,
  onMoveHere,
  legend,
}: Props) {
  return (
    <div className={styles.rings}>
      {tray.length > 0 ? (
        <section className={styles.tray} aria-label={words.TO_PLACE}>
          <h3 className={styles.trayTitle}>{words.TO_PLACE}</h3>
          {tray.map((person) =>
            person.invited ? (
              <button
                key={person.uid}
                type="button"
                className={`${styles.trayInvited} ${selected === person.uid ? styles.traySelected : ""}`}
                aria-expanded={selected === person.uid}
                data-panel-name={person.uid}
                onClick={(event) => onOpen(person.uid, event.currentTarget)}
              >
                {words.invitedTrayWords(person.name)}
              </button>
            ) : (
              <button
                key={person.uid}
                type="button"
                className={`${styles.trayName} ${selected === person.uid ? styles.traySelected : ""}`}
                aria-expanded={selected === person.uid}
                data-panel-name={person.uid}
                onClick={(event) => onOpen(person.uid, event.currentTarget)}
              >
                {person.name}
              </button>
            ),
          )}
        </section>
      ) : null}
      {beforeRings}

      <div className={styles.grid}>
        {rings.map((ring) => {
          const n = ring.members.length;
          const hint = moveHere(ring);
          return (
            <section key={ring.id} className={styles.ringCard} aria-label={ring.name}>
              <div className={`${ringStyles.ring} ${ring.warnings.length > 0 ? ringStyles.ringWarn : ""}`}>
                <div className={ringStyles.circle} aria-hidden="true" />
                <div className={styles.centre}>
                  <Link href={groupPagePath(roundId, programmeId, ring.id)} className={styles.ringName}>
                    {ring.name}
                  </Link>
                  <span className={styles.centreLine}>
                    {words.seatsWords(n, ring.capacity)} · {ring.when || words.NO_TIME_YET}
                  </span>
                  {hint !== null && selected !== null ? (
                    <button
                      type="button"
                      className={hint === words.MOVE_HERE ? styles.moveHere : styles.moveHereCant}
                      disabled={busy}
                      onClick={() => onMoveHere(ring.id)}
                      aria-label={moveAria(selectedName, ring.name)}
                    >
                      {hint}
                    </button>
                  ) : null}
                </div>
                {ring.members.map((member, i) => {
                  const angle = ((-90 + (360 * i) / Math.max(n, 1)) * Math.PI) / 180;
                  return (
                    <button
                      key={member.uid}
                      type="button"
                      className={[
                        ringStyles.chip,
                        member.facilitating ? ringStyles.chipLead : "",
                        member.cant ? ringStyles.chipOff : "",
                        selected === member.uid ? ringStyles.chipSelected : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` }}
                      aria-expanded={selected === member.uid}
                      title={member.name}
                      data-panel-name={member.uid}
                      onClick={(event) => onOpen(member.uid, event.currentTarget)}
                    >
                      {member.facilitating ? <span className={ringStyles.chipRole}>{FACILITATING}</span> : null}
                      <span>{member.tag}</span>
                      {member.notTold ? <span className={ringStyles.chipNote}>{NOT_TOLD}</span> : null}
                      {member.moved ? <span className={ringStyles.chipNote}>{MOVED}</span> : null}
                      {member.cantAnswer ? <span className={`${ringStyles.chipNote} ${ringStyles.chipCant}`}>{MARK_CANT_MAKE}</span> : null}
                      {member.flagged ? (
                        <span className={ringStyles.chipFlag} aria-label={PANGRAM_FLAG}>
                          !
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {ring.outside.length > 0 ? (
                <p className={ringStyles.facilitatorWhy}>
                  {FACILITATING_OUTSIDE}{" "}
                  {ring.outside.map((f, at) => (
                    <span key={f.uid}>
                      {at === 0 ? "" : at === ring.outside.length - 1 ? " and " : ", "}
                      <button type="button" className={styles.nameButton} aria-expanded={selected === f.uid} data-panel-name={f.uid} onClick={(event) => onOpen(f.uid, event.currentTarget)}>
                        {f.firstName}
                      </button>
                    </span>
                  ))}
                </p>
              ) : null}
              {ring.warnings.length > 0 ? (
                <ul className={ringStyles.warnings}>
                  {ring.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      <p className={styles.legend}>{legend}</p>
    </div>
  );
}
