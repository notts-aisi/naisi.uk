"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import InitialsChip from "@/components/ui/InitialsChip";
import GroupCampusPicker from "@/features/applications/groups/GroupCampusPicker";
import GroupRoomField from "@/features/applications/groups/GroupRoomField";
import { useHydrated } from "@/hooks/useHydrated";
import type { SessionCardView } from "@/lib/courses/sessionChange/view";
import { CHANGE_A_SESSION, STATE_WORDS } from "@/lib/courses/sessionChange/words";
import ChangeSessionDialog from "./ChangeSessionDialog";
import styles from "./SessionsBoard.module.css";

/**
 * The Sessions view of a programme's Groups tab (wk-session), and the same
 * list on a group's own page: one card per session, each with "Change a
 * session" opening the dialog beside the list (below it on a phone). On the
 * Groups tab a session whose week asks for pairs also has the way to its
 * pairs ("Pairs and laptops"), named for screen readers with its group,
 * and the group's campus, which saves as it is changed (`campusAt` names
 * the programme whose route saves it; a group's own page passes none and
 * its cards carry none).
 *
 * Everything drawn is the server's (`SessionCardView`); the only state here is
 * which card's dialog is open and what the last change said. A change that
 * went through reads the page again, so every card shows what is now true.
 */

export type WeekLink = { href: string; label: string };

export default function SessionsBoard({
  heading,
  previous,
  next,
  cards,
  blank,
  campusAt = null,
}: {
  /** "Week 4 of 6 · Thu 19 to Wed 25 Nov", or "" on a group's own page. */
  heading: string;
  previous: WeekLink | null;
  next: WeekLink | null;
  cards: SessionCardView[];
  blank: string | null;
  /** The programme whose Groups tab this is, for the campus route. Null on a group's own page. */
  campusAt?: { roundId: string; programmeId: string } | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const open = cards.find((card) => card.key === openKey && card.dialog) ?? null;

  const close = (key: string | null) => {
    setOpenKey(null);
    router.refresh();
    if (key) buttons.current.get(key)?.focus();
  };

  return (
    <div className={styles.board}>
      {said && (
        <p className={styles.done} role="status">
          {said}
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.list}>
          {(heading || previous || next) && (
            <div className={styles.weekRow}>
              {heading && <p className={styles.weekHeading}>{heading}</p>}
              {(previous || next) && (
                <nav className={styles.weekNav} aria-label="Weeks">
                  {previous && (
                    <Link className={styles.weekLink} href={previous.href}>
                      <span aria-hidden="true">←&nbsp;</span>
                      {previous.label}
                    </Link>
                  )}
                  {next && (
                    <Link className={styles.weekLink} href={next.href}>
                      {next.label}
                      <span aria-hidden="true">&nbsp;→</span>
                    </Link>
                  )}
                </nav>
              )}
            </div>
          )}
          {blank && <p className={styles.blank}>{blank}</p>}
          {cards.map((card) => {
            const here = open?.key === card.key;
            return (
              <div key={card.key} className={here ? `${styles.card} ${styles.cardOpen}` : styles.card}>
                <div className={styles.cardMain}>
                  <h3 className={styles.cardHeading}>{card.heading}</h3>
                  {card.sub && <p className={styles.cardSub}>{card.sub}</p>}
                  {card.people.length > 0 && (
                    <div className={styles.people}>
                      <span className={styles.chips}>
                        {card.people.map((person) => (
                          <InitialsChip key={person.uid} uid={person.uid} name={person.name} size="sm" />
                        ))}
                      </span>
                      <span className={styles.peopleLine}>{card.peopleLine}</span>
                    </div>
                  )}
                </div>
                <div className={styles.cardWhen}>
                  {card.eyebrow && <span className={styles.cardEyebrow}>{card.eyebrow}</span>}
                  {card.when && <p className={styles.cardDate}>{card.when}</p>}
                  {card.where && <p className={styles.cardWhere}>{card.where}</p>}
                  {card.state && (
                    <span
                      className={[
                        styles.state,
                        card.state === "cancelled" ? styles.stateCancelled : "",
                        card.state === "online" ? styles.stateOnline : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {STATE_WORDS[card.state]}
                    </span>
                  )}
                  {card.note && <p className={styles.cardNote}>{card.note}</p>}
                </div>
                {(card.dialog || card.pairs) && (
                  <div className={styles.cardAction}>
                    {card.dialog && (
                      <button
                        type="button"
                        ref={(element) => {
                          buttons.current.set(card.key, element);
                        }}
                        className={styles.changeButton}
                        aria-expanded={here}
                        disabled={!hydrated}
                        onClick={() => {
                          setSaid(null);
                          setOpenKey(here ? null : card.key);
                        }}
                      >
                        {CHANGE_A_SESSION}
                      </button>
                    )}
                    {card.pairs && (
                      <Link className={styles.pairsLink} href={card.pairs.href}>
                        {card.pairs.label}
                        <span className={styles.srOnly}> in {card.heading}</span>
                      </Link>
                    )}
                  </div>
                )}
                {campusAt && card.campus && (
                  /* Last, on a line of its own: the group's, not this week's session's. */
                  <div className={styles.cardCampus}>
                    <GroupCampusPicker
                      roundId={campusAt.roundId}
                      programmeId={campusAt.programmeId}
                      groupId={card.campus.groupId}
                      groupName={card.campus.groupName}
                      value={card.campus.value}
                      onSaved={(words) => setSaid(words || null)}
                    />
                    <GroupRoomField
                      roundId={campusAt.roundId}
                      programmeId={campusAt.programmeId}
                      groupId={card.campus.groupId}
                      groupName={card.campus.groupName}
                      value={card.campus.room}
                      onSaved={(words) => setSaid(words || null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {open?.dialog && (
          <ChangeSessionDialog
            key={open.key}
            facts={open.dialog}
            onClose={() => close(open.key)}
            onDone={(words) => {
              setSaid(words);
              close(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
