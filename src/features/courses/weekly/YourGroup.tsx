"use client";

import InitialsChip from "@/components/ui/InitialsChip";
import Skeleton from "@/components/ui/Skeleton";
import { firstName } from "@/app/(app)/dashboard/homeWords";
import { useGroupRoster, type GroupRosterState } from "../useGroupRoster";
import { NAMES_ONLY, YOU, YOUR_GROUP, facilitatorsLabel } from "@/lib/courses/memberPageWords";
import { namesWords } from "@/lib/courses/sessionChange/words";
import styles from "./weekly.module.css";

/**
 * "Your group" (boards wk-programme, st-programme, wk-home-phone): the people
 * in the reader's group and its facilitators, by the first names they go by,
 * and nothing else about anybody.
 *
 * Read through the group's roster route, which answers a member of the group
 * (once Publish has told them their group), its facilitators and admins, and
 * only with names: no address, no profile. The reader comes first, marked
 * "(you)"; everybody else in the order the route gives.
 *
 * NOBODY IS NAMED TO THEMSELVES. A facilitator who holds a place in the group
 * is one of its people, marked "(you)", and is left out of its facilitators
 * here, as the page's head, its ticket and Publish's placement email leave
 * them out (`facilitatorNames` in the overview route). The line names the
 * others, and is not drawn when the reader is the group's only facilitator.
 */

type Props = {
  groupId: string;
  groupName: string;
  /** The reader's own uid, for "(you)". */
  selfUid: string | null;
  /** "Names only. Nobody here sees your email address.", as the board before the start draws it. */
  namesOnly: boolean;
  className?: string;
  /**
   * The group's roster when the page already reads it (Home, whose last week's survey card names who steps
   * out from the same answer), so the route is asked once; without it, the card asks for its own.
   */
  roster?: GroupRosterState;
};

export default function YourGroup({ groupId, groupName, selfUid, namesOnly, className, roster: given }: Props) {
  const fetched = useGroupRoster(given ? "" : groupId);
  const roster = given ?? fetched;
  const members = [...roster.members].sort((a, b) => Number(b.uid === selfUid) - Number(a.uid === selfUid));
  const facilitators = roster.facilitators.filter((person) => person.uid !== selfUid);

  return (
    <section className={[styles.card, className ?? ""].filter(Boolean).join(" ")} aria-labelledby={`your-group-${groupId}`}>
      <div className={`${styles.cardHead} ${styles.cardHeadSpaced}`}>
        <h2 id={`your-group-${groupId}`} className={styles.cardTitle}>
          {YOUR_GROUP}
        </h2>
        <span className={styles.cardMeta}>{groupName}</span>
      </div>
      {roster.group === null && roster.loading && <Skeleton height="2.25rem" ariaLabel="Loading your group…" />}
      {roster.group === null && !roster.loading && roster.error && (
        <p className={styles.cardLine}>We couldn’t load your group just now.</p>
      )}
      {roster.group !== null && (
        <>
          <ul className={styles.people} role="list">
            {members.map((person) => {
              const you = person.uid === selfUid;
              return (
                <li key={person.uid} className={you ? styles.personYou : styles.person}>
                  <InitialsChip name={person.displayName} uid={person.uid} size="sm" />
                  <span className={styles.personName}>
                    {firstName(person.displayName) || person.displayName}
                    {you && <span className={styles.you}> {YOU}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {facilitators.length > 0 && (
            <p className={styles.facilitators}>
              <span className={styles.faces} aria-hidden="true">
                {facilitators.map((person) => (
                  <InitialsChip key={person.uid} name={person.displayName} uid={person.uid} size="sm" />
                ))}
              </span>
              <span>
                {facilitatorsLabel(facilitators.length)}{" "}
                <strong>{namesWords(facilitators.map((person) => firstName(person.displayName) || person.displayName))}</strong>
              </span>
            </p>
          )}
        </>
      )}
      {namesOnly && <p className={styles.groupNote}>{NAMES_ONLY}</p>}
    </section>
  );
}
