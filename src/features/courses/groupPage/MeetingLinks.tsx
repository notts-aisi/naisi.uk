"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { linkChangeable, type GroupPageView } from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import LinkPanel from "./LinkPanel";
import styles from "./GroupPage.module.css";

/**
 * EACH WEEK'S MEETING LINK, on a facilitator's group page: one row a week of
 * the plan, its date and state, which link it reads in words ("Set: every
 * week", "Set: week 3 only", "Kept the link it had before", "No link"), and, for a session still to end and
 * not cancelled, the way to change it: the same panel as "Set the link",
 * on that week, for that week only (the default) or from that week on. A week
 * that has met keeps the link it had and has nothing to press.
 *
 * Drawn from `loadGroupPage`'s view, which carries which kind of link each
 * week reads and never a link. The route behind the panel admits the
 * group's facilitators, the programme's lead, the run's track leads and
 * admins, and asks again; nobody is emailed. In a view-as session
 * (`canChange` false) the list is drawn with nothing to press, as the box
 * about joining online draws its own.
 */
export default function MeetingLinks({ view, canChange }: { view: GroupPageView; canChange: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [week, setWeek] = useState<{ weekNumber: number; sessionKey: string } | null>(null);
  const [opened, setOpened] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  if (view.weeks.length === 0) return null;

  return (
    <section className={`${styles.card} ${styles.facCard}`} aria-labelledby="meeting-links" data-testid="meeting-links">
      <h2 id="meeting-links" className={styles.cardTitle}>
        {W.MEETING_LINKS}
      </h2>
      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
      <ul className={styles.linkList}>
        {view.weeks.map((each) => {
          const changeable = canChange && linkChangeable(each);
          return (
            <li key={each.weekNumber} className={styles.linkRow}>
              <span className={styles.linkText}>
                <span className={styles.linkWeek}>
                  {W.weekWords(each.weekNumber)}
                  {each.dateKey ? ` · ${W.weekPillLine(each.dateKey, each.state)}` : ""}
                </span>
                <span className={styles.linkState}>{W.weekLinkWords(each.link, each.weekNumber)}</span>
              </span>
              {changeable && (
                <button
                  type="button"
                  className={styles.button}
                  disabled={!hydrated}
                  aria-label={`${each.link === "none" ? W.SET_THE_LINK : W.CHANGE}: ${W.weekWords(each.weekNumber)}`}
                  onClick={() => {
                    setSaid(null);
                    setOpened((n) => n + 1);
                    setWeek({ weekNumber: each.weekNumber, sessionKey: each.sessionKey });
                  }}
                >
                  {each.link === "none" ? W.SET_THE_LINK : W.CHANGE}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {view.meets.hasLink && <p className={styles.cardLine}>{W.ANY_WEEK_OWN_LINK}</p>}
      <Modal open={week !== null} onClose={() => setWeek(null)} ariaLabel={W.SET_THE_LINK} side>
        {(dismiss) =>
          week ? (
            <LinkPanel
              key={opened}
              view={view}
              week={week}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                router.refresh();
              }}
            />
          ) : null
        }
      </Modal>
    </section>
  );
}
