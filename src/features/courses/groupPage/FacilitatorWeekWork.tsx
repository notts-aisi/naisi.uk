"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { countBuckets, doneCount, filterRows } from "@/lib/courses/groupWeekWork/model";
import type { GroupWeekWorkView } from "@/lib/courses/groupWeekWork/view";
import * as R from "@/lib/courses/groupWeekWork/words";
import RemindPanel from "./RemindPanel";
import WorkBar from "./WorkBar";
import styles from "./GroupPage.module.css";

/**
 * THE CHOSEN WEEK'S WORK ON A FACILITATOR'S GROUP PAGE, phone first: "4 of 6
 * have done week 1", the week's bar, Remind for everybody whose week isn't
 * done (a sheet on a phone, a side panel at a computer, the same preview and
 * button as the programme's page), and what is true of the automatic
 * reminders. Who each person is and where their week stands is This week's
 * work's, further down the page, which reads each person's week through the
 * same function this count does.
 *
 * The group's fellows only: a facilitator's own week, theirs or a
 * co-facilitator's or that of somebody who facilitates another group, is
 * never counted or shown here (`groupWeekWorkView` is handed none for this
 * page). Somebody whose week isn't done and whom Remind does not reach is
 * named under the button, with why. After a press the page is read again,
 * so the count and each person's last reminder are the server's. In a
 * view-as session the button is drawn as the facilitator sees it, and the
 * route refuses the press in its own words.
 */
export default function FacilitatorWeekWork({ groupId, work }: { groupId: string; work: GroupWeekWorkView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const buckets = work.rows.map((row) => row.week.bucket);
  const counts = countBuckets(buckets);
  const remindCount = work.remind?.count ?? 0;
  const leftOut = filterRows(work.rows, "week").filter((row) => !row.remindable);

  return (
    <section className={`${styles.card} ${styles.facCard}`} aria-labelledby="fac-week-work" data-testid="week-work-count">
      <h2 id="fac-week-work" className={styles.cardTitle}>
        {R.haveDoneTitle(doneCount(counts), work.rows.length, work.weekNumber)}
      </h2>
      <WorkBar label={R.weekLabel(work.weekNumber)} buckets={buckets} quietLabel />
      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
      {work.remind && remindCount > 0 && (
        <button
          type="button"
          className={styles.button}
          disabled={!hydrated}
          onClick={() => {
            setSaid(null);
            setOpened((n) => n + 1);
            setOpen(true);
          }}
        >
          {R.remindAllWords(remindCount)}
        </button>
      )}
      {work.remind && leftOut.length > 0 && (
        <p className={styles.cardLine}>{R.remindLeavesOutWords(leftOut.map((row) => row.firstName || row.name))}</p>
      )}
      {work.automatic && <p className={styles.cardLine}>{work.automatic}</p>}
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel={R.remindAllWords(remindCount)} side>
        {(dismiss) =>
          // Drawn only while open: the panel asks the route what a press would
          // do as it mounts, which nobody wants done on every visit to the page.
          open ? (
            <RemindPanel
              key={opened}
              groupId={groupId}
              weekNumber={work.weekNumber}
              only={null}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                // The count and each person's last reminder, read again.
                router.refresh();
              }}
            />
          ) : null
        }
      </Modal>
    </section>
  );
}
