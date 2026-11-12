"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { CAMPUS_LABEL } from "@/lib/courses/campusWords";
import type { GroupPageView } from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import ChangePanel from "./ChangePanel";
import LinkPanel from "./LinkPanel";
import styles from "./GroupPage.module.css";

/**
 * THE FACILITATOR'S CUT OF A GROUP'S PAGE, on their own group page: how the
 * group meets as words (the regular time is never a control for a
 * facilitator: one line says the lead or an admin changes it), "Change one
 * week" with the one-week choices alone and the same preview and button,
 * "Set the link", and the row of weeks with each week's date and state.
 *
 * Drawn from `loadGroupPage` with the facilitator's view: no people and no
 * history, no address and no link. The routes behind both buttons admit the
 * group's facilitators and ask again. In a view-as session the page is drawn
 * exactly as the facilitator sees it, buttons and all: the routes refuse
 * every press made from it, in their own words.
 */
export default function FacilitatorMeets({
  view,
  eyebrow,
}: {
  view: GroupPageView;
  /** "AGI Strategy · Group C". */
  eyebrow: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [panel, setPanel] = useState<"change" | "link" | null>(null);
  const [opened, setOpened] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const timeSet = Boolean(view.meets.hhmm);
  const campus = view.meets.campus ? CAMPUS_LABEL[view.meets.campus] : "";
  const changeable = view.weeks.some((week) => !week.taken && week.dateKey);

  const open = (next: "change" | "link") => {
    setSaid(null);
    setOpened((n) => n + 1);
    setPanel(next);
  };
  const done = (dismiss: () => void) => (words: string) => {
    dismiss();
    setSaid(words);
    router.refresh();
  };

  return (
    <section className={`${styles.card} ${styles.facCard}`} aria-labelledby="group-meets-facilitator">
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id="group-meets-facilitator" className={styles.facWhen}>
        {timeSet ? W.dayAndTimeWords(view.meets.weekday, view.meets.hhmm, view.meets.minutes) : W.howMeetsTitle(view.groupName)}
      </h2>
      <p className={styles.weekWhere}>{timeSet ? W.roomLine(view.meets.room, campus) : W.NOT_SET_YET}</p>
      {(changeable || view.linkSessionKey) && (
        <div className={styles.facActions}>
          {changeable && (
            <button type="button" className={styles.button} disabled={!hydrated} onClick={() => open("change")}>
              {W.CHANGE_ONE_WEEK}
            </button>
          )}
          {view.linkSessionKey && (
            <button type="button" className={styles.button} disabled={!hydrated} onClick={() => open("link")}>
              {W.SET_THE_LINK}
            </button>
          )}
        </div>
      )}
      <p className={styles.cardLine}>{W.facilitatorWhoLine(view.leadFirstName)}</p>
      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
      {view.weeks.length > 0 && (
        <ul className={styles.pills} aria-label="Weeks">
          {view.weeks.map((week) => (
            <li key={week.weekNumber} className={week.weekNumber === view.openWeek ? `${styles.pill} ${styles.pillOn}` : styles.pill}>
              <span className={styles.pillWeek}>{W.weekWords(week.weekNumber)}</span>
              <span className={styles.pillLine}>{W.weekPillLine(week.dateKey, week.state)}</span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={panel !== null} onClose={() => setPanel(null)} ariaLabel={panel === "link" ? W.SET_THE_LINK : W.CHANGE_ONE_WEEK} side>
        {(dismiss) =>
          panel === "change" ? (
            <ChangePanel
              key={opened}
              view={view}
              start={{ choice: "one", weekNumber: null }}
              oneWeekOnly
              onClose={dismiss}
              onDone={done(dismiss)}
            />
          ) : panel === "link" ? (
            <LinkPanel key={opened} view={view} week={null} onClose={dismiss} onDone={done(dismiss)} />
          ) : null
        }
      </Modal>
    </section>
  );
}
