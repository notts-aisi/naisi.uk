import Link from "next/link";
import type { AvailabilityGrid, AvailabilityMask } from "@/lib/admissions/availability";
import { maskToColumns } from "@/features/admissions/availabilityModel";
import { DAY_LONG, DAY_SHORT, DISPLAY_DAYS, clockLabel, runLabel, runsOf } from "../apply/availabilityText";
import { slotCountFor } from "@/lib/admissions/availability";
import styles from "./status.module.css";

/**
 * "WHEN YOU’RE FREE" ON THE APPLICATION PAGE (Q7: boards st-application-phone,
 * st-late-phone), for somebody holding a place on a fellowship until Publish
 * has told them their group. The server decides whether it is drawn at all
 * (`loadWhenFree`) and hands in the form's grid, the week as painted and the
 * line under the title; nothing here decides who may.
 *
 * The week is drawn as it reads on the board: each day, a bar across the
 * grid's hours, and its times or "Not free". "Change when you’re free" opens
 * the form's own editor on a page of its own (`/applications/<round>/free`),
 * which holds the week to the same codec and limits as the form.
 *
 * Read only, with no script of its own, and in the status page's own
 * stylesheet, so it reads in full from the first HTML.
 */

/** The hour marks along the top, as the board draws them: every three hours on the grid. */
function hourMarks(grid: AvailabilityGrid): { minute: number; label: string }[] {
  const marks: { minute: number; label: string }[] = [];
  const first = Math.ceil(grid.startMinute / 180) * 180;
  for (let minute = first; minute <= grid.endMinute; minute += 180) marks.push({ minute, label: clockLabel(minute) });
  return marks;
}

function percent(minute: number, grid: AvailabilityGrid): number {
  return ((minute - grid.startMinute) / (grid.endMinute - grid.startMinute)) * 100;
}

export default function WhenYoureFree({
  roundId,
  grid,
  availability,
  line,
}: {
  roundId: string;
  grid: AvailabilityGrid;
  availability: AvailabilityMask;
  line: string;
}) {
  const columns = maskToColumns(availability, grid);
  const slots = slotCountFor(grid);
  return (
    // The address Home's "Check when you’re free" lands on.
    <section id="when-youre-free" className={styles.freeCard} aria-labelledby="when-youre-free-title">
      <h2 id="when-youre-free-title" className={styles.freeTitle}>
        When you’re free
      </h2>
      <p className={styles.freeLine}>{line}</p>
      <div className={styles.freeWeek}>
        <div className={styles.freeMarks} aria-hidden="true">
          {hourMarks(grid).map((mark) => (
            <span key={mark.minute} className={styles.freeMark} style={{ left: `${percent(mark.minute, grid)}%` }}>
              {mark.label}
            </span>
          ))}
        </div>
        <ul className={styles.freeDays}>
          {DISPLAY_DAYS.map((day) => {
            const runs = runsOf(columns[day]);
            const said = runs.length > 0 ? runs.map((run) => runLabel(run, grid)).join(", ") : "Not free";
            return (
              <li key={day} className={styles.freeDay} data-free={runs.length > 0 ? "yes" : "no"}>
                <span className={styles.freeDayName} aria-hidden="true">
                  {DAY_SHORT[day]}
                </span>
                <span className={styles.freeTrack} aria-hidden="true">
                  {runs.map((run) => (
                    <span
                      key={run.from}
                      className={styles.freeRun}
                      style={{ left: `${(run.from / slots) * 100}%`, width: `${((run.to - run.from) / slots) * 100}%` }}
                    />
                  ))}
                </span>
                <span className={styles.freeTimes}>
                  <span className={styles.freeHidden}>{DAY_LONG[day]}: </span>
                  {said}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <Link href={`/applications/${encodeURIComponent(roundId)}/free`} className={styles.freeChange}>
        Change when you’re free
      </Link>
    </section>
  );
}
