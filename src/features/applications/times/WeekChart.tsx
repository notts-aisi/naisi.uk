"use client";

import type { SessionSlot } from "@/lib/admissions/availability";
import styles from "./WeekChart.module.css";

/**
 * ONE PERSON'S WEEK BESIDE THE GROUPS, for an admin placing somebody by hand
 * (Circles, `../circles/PersonPanel.tsx`).
 *
 * Monday to Sunday across, the form's hours down. Shaded: every stretch they
 * marked. For somebody who marked under four hours in the week, a lighter
 * shade runs from their first mark each day to the end of the grid, which is
 * how the site reads them. Over it, each group's weekly session as a bar,
 * green where they can make the whole session and red where they cannot, the
 * group they are in now outlined. Pressing a bar moves them there. Under the
 * chart the same groups as a list, the ones they can make first, each saying
 * how much of the session falls in the time they marked.
 *
 * Other screens reuse the chart for something other than moving somebody
 * (asking somebody to facilitate a group, a note about a group's time), with
 * their own `words`; left out, the chart says what it always has.
 */

export type ChartGroup = {
  key: string;
  name: string;
  session: SessionSlot;
  /** They can make the whole session, by the site's reading of their week. */
  fits: boolean;
  /** They are in it now. */
  current: boolean;
};

/** Words for a chart that is not about moving somebody. */
export type WeekChartWords = {
  /** The button under a group they could be picked for, or null for no pick buttons (bars then not clickable). */
  pick: string | null;
  /** A bar's accessible name: (group name, "Mon 18:00") => string. */
  pickAria: (group: string, when: string) => string;
  /** What the list says of the `current` group. */
  current: string;
};

/** The chart's own words, for moving somebody (Circles). */
export const MOVE_WORDS: WeekChartWords = {
  pick: "Move here",
  pickAria: (group, when) => `Move them to ${group}, ${when}`,
  current: "they are in it",
};

type Props = {
  grid: { startMinute: number; endMinute: number };
  marked: readonly { weekday: number; start: number; end: number }[];
  fromFirstMark: boolean;
  groups: readonly ChartGroup[];
  disabled: boolean;
  onPick: (key: string) => void;
  /** Words for a chart that is not about moving somebody. Omitted: today's words, unchanged. */
  words?: WeekChartWords;
};

/** Monday first, as every screen here lists a week. */
const COLUMNS = [1, 2, 3, 4, 5, 6, 0];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/** How many minutes of a session fall inside the stretches somebody marked. */
function overlap(marked: Props["marked"], session: SessionSlot): number {
  const start = minutesOf(session.startTimeLocal);
  const end = start + session.durationMinutes;
  return marked
    .filter((range) => range.weekday === session.weekday)
    .reduce((sum, range) => sum + Math.max(0, Math.min(end, range.end) - Math.max(start, range.start)), 0);
}

/** Side by side where a day's sessions overlap: each its lane, out of how many. */
function lanesOf(groups: readonly ChartGroup[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>();
  for (const weekday of COLUMNS) {
    const day = groups
      .filter((group) => group.session.weekday === weekday)
      .sort((a, b) => minutesOf(a.session.startTimeLocal) - minutesOf(b.session.startTimeLocal));
    const ends: number[] = [];
    const lane = new Map<string, number>();
    for (const group of day) {
      const start = minutesOf(group.session.startTimeLocal);
      let at = ends.findIndex((end) => end <= start);
      if (at < 0) at = ends.length;
      ends[at] = start + group.session.durationMinutes;
      lane.set(group.key, at);
    }
    for (const group of day) out.set(group.key, { lane: lane.get(group.key) ?? 0, of: Math.max(1, ends.length) });
  }
  return out;
}

export default function WeekChart({ grid, marked, fromFirstMark, groups, disabled, onPick, words = MOVE_WORDS }: Props) {
  const span = Math.max(60, grid.endMinute - grid.startMinute);
  const top = (minutes: number) => `${(Math.max(0, minutes - grid.startMinute) / span) * 100}%`;
  const height = (from: number, to: number) => `${(Math.max(0, Math.min(to, grid.endMinute) - Math.max(from, grid.startMinute)) / span) * 100}%`;
  const lanes = lanesOf(groups);
  const hours: number[] = [];
  for (let at = Math.ceil(grid.startMinute / 120) * 120; at < grid.endMinute; at += 120) hours.push(at);
  const listed = [...groups]
    .map((group) => ({ group, minutes: overlap(marked, group.session) }))
    .sort((a, b) => Number(b.group.fits) - Number(a.group.fits) || b.minutes - a.minutes || a.group.name.localeCompare(b.group.name));

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chart} role="img" aria-label="When they said they are free, and when each group meets">
        <div className={styles.axis} aria-hidden="true">
          {hours.map((at) => (
            <span key={at} className={styles.hour} style={{ top: top(at) }}>
              {clock(at)}
            </span>
          ))}
        </div>
        {COLUMNS.map((weekday) => {
          const firstMark = Math.min(...marked.filter((range) => range.weekday === weekday).map((range) => range.start));
          return (
            <div key={weekday} className={styles.day}>
              <span className={styles.dayName}>{DAY[weekday]}</span>
              <div className={styles.column}>
                {fromFirstMark && Number.isFinite(firstMark) ? (
                  <span className={styles.readAs} style={{ top: top(firstMark), height: height(firstMark, grid.endMinute) }} />
                ) : null}
                {marked
                  .filter((range) => range.weekday === weekday)
                  .map((range) => (
                    <span
                      key={`${range.start}`}
                      className={styles.free}
                      style={{ top: top(range.start), height: height(range.start, range.end) }}
                    />
                  ))}
                {groups
                  .filter((group) => group.session.weekday === weekday)
                  .map((group) => {
                    const start = minutesOf(group.session.startTimeLocal);
                    const place = lanes.get(group.key) ?? { lane: 0, of: 1 };
                    const className = [styles.bar, group.fits ? styles.barFits : styles.barNot, group.current ? styles.barCurrent : ""]
                      .filter(Boolean)
                      .join(" ");
                    const style = {
                      top: top(start),
                      height: height(start, start + group.session.durationMinutes),
                      left: `${(place.lane / place.of) * 100}%`,
                      width: `${100 / place.of}%`,
                    };
                    const title = `${group.name}, ${DAY[weekday]} ${group.session.startTimeLocal}: ${group.fits ? "they can make it" : "they can’t make all of it"}`;
                    // No picking on this chart: the bar is drawn, and nothing happens on a press.
                    if (words.pick === null) {
                      return (
                        <span key={group.key} className={className} style={style} title={title}>
                          {group.name.replace(/^Group\s+/i, "")}
                        </span>
                      );
                    }
                    return (
                      <button
                        key={group.key}
                        type="button"
                        className={className}
                        style={style}
                        disabled={disabled || group.current}
                        title={title}
                        aria-label={words.pickAria(group.name, `${DAY[weekday]} ${group.session.startTimeLocal}`)}
                        onClick={() => onPick(group.key)}
                      >
                        {group.name.replace(/^Group\s+/i, "")}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.key}>
        <span className={`${styles.swatch} ${styles.free}`} /> marked free
        {fromFirstMark ? (
          <>
            {" "}
            <span className={`${styles.swatch} ${styles.readAs}`} /> read as free from then on
          </>
        ) : null}{" "}
        <span className={`${styles.swatch} ${styles.barFits}`} /> they can make it{" "}
        <span className={`${styles.swatch} ${styles.barNot}`} /> they can’t
      </p>
      <ul className={styles.fits}>
        {listed.map(({ group, minutes }) => (
          <li key={group.key} className={styles.fitRow}>
            <span>
              <strong>{group.name}</strong>, {DAY[group.session.weekday]} {group.session.startTimeLocal}:{" "}
              {group.current
                ? words.current
                : group.fits
                  ? "they can make it"
                  : minutes > 0
                    ? `free for ${minutes} of its ${group.session.durationMinutes} minutes`
                    : "not a time they marked"}
            </span>
            {!group.current && words.pick !== null ? (
              <button type="button" className={styles.move} disabled={disabled} onClick={() => onPick(group.key)}>
                {words.pick}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
