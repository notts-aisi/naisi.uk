import Link from "next/link";
import Select from "@/components/ui/Select";
import type { OverviewByWeek, OverviewGroupsWeek, OverviewWeekRow } from "@/lib/courses/overviewByWeek";
import styles from "./OverviewByWeek.module.css";

/**
 * ATTENDANCE BY WEEK AND THE GROUPS IN A WEEK, on a programme's Overview,
 * drawn from the model the server worked out (`./overviewByWeek.ts` under
 * `src/lib/courses`). Nothing here counts anything: every number is the
 * model's, and the model's are the Attendance tab's rows and the group
 * pages' own counts.
 *
 * Each week's name opens the Attendance tab; each group's name opens the
 * group's page on the chosen week. The week is chosen with a plain GET form
 * (`?week=3`), so it works before the page's scripts arrive. On a phone the
 * table gives way to a list of the same rows; on a wide screen the table
 * scrolls inside its own card, and the page never scrolls sideways.
 */

const KINDS = [
  { key: "room", label: "In the room", className: "room" },
  { key: "online", label: "Online", className: "online" },
  { key: "excused", label: "Excused", className: "excused" },
  { key: "absent", label: "Absent", className: "absent" },
] as const;

function WeekRow({ row, attendanceHref }: { row: OverviewWeekRow; attendanceHref: string }) {
  const counted = row.state === "so-far" || row.state === "done";
  const total = row.of;
  return (
    <li className={`${styles.week} ${counted ? "" : styles.weekQuiet}`}>
      <Link href={attendanceHref} className={styles.weekName}>
        {row.label}
        {row.when && <span className={styles.weekWhen}> · {row.when}</span>}
      </Link>
      {counted ? (
        <div className={styles.weekFigures}>
          <div className={styles.bar} role="img" aria-label={row.description}>
            {total > 0 &&
              KINDS.map((kind) =>
                row.counts[kind.key] > 0 ? (
                  <span
                    key={kind.key}
                    className={`${styles.segment} ${styles[kind.className]}`}
                    style={{ width: `${((row.counts[kind.key] * 100) / total).toFixed(2)}%` }}
                  />
                ) : null,
              )}
          </div>
          <ul className={styles.legend}>
            {KINDS.map((kind) => (
              <li key={kind.key} className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles[kind.className]}`} aria-hidden="true" />
                {kind.label} <strong className={styles.legendCount}>{row.counts[kind.key]}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <span className={styles.weekLine}>{row.line}</span>
      )}
      {counted && (
        <span className={styles.weekLine}>
          {row.line}
          {row.unfinished && <span className={styles.weekNote}>{row.unfinished}</span>}
        </span>
      )}
    </li>
  );
}

function GroupsTable({ groups }: { groups: OverviewGroupsWeek }) {
  return (
    <div className={styles.scroll} role="region" aria-label={groups.heading} tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>{groups.heading}</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Facilitator</th>
            <th scope="col">{groups.sessionHeading}</th>
            <th scope="col">Readings done</th>
            <th scope="col">Coursework done</th>
            {groups.beforeHeading && <th scope="col">{groups.beforeHeading}</th>}
            <th scope="col">{groups.cameHeading}</th>
          </tr>
        </thead>
        <tbody>
          {groups.rows.map((row) => (
            <tr key={row.groupId}>
              <th scope="row">
                <Link href={row.href} className={styles.groupLink}>
                  {row.groupName}
                </Link>
              </th>
              <td>{row.facilitators}</td>
              <td>{row.session}</td>
              <td>{row.readings}</td>
              <td>{row.coursework}</td>
              {groups.beforeHeading && <td>{row.cameBefore}</td>}
              <td>{row.came}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupsList({ groups }: { groups: OverviewGroupsWeek }) {
  return (
    <ul className={styles.list} aria-label={groups.heading}>
      {groups.rows.map((row) => (
        <li key={row.groupId} className={styles.listItem}>
          <Link href={row.href} className={styles.listLink}>
            <span className={styles.listTop}>
              <span className={styles.listName}>{row.groupName}</span>
              {row.moved && <span className={styles.chip}>Moved</span>}
            </span>
            <span className={styles.listLine}>{row.session}</span>
            <span className={styles.listLine}>
              Readings: {row.readings} · Coursework: {row.coursework}
            </span>
            <span className={styles.listLine}>
              {groups.cameHeading}: {row.came}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function OverviewByWeekSections({
  byWeek,
  programmePath,
}: {
  byWeek: OverviewByWeek;
  /** The programme's own address, no trailing slash. */
  programmePath: string;
}) {
  const attendanceHref = `${programmePath}/attendance`;
  const { groups } = byWeek;
  return (
    <>
      <section className={styles.card} aria-labelledby="overview-by-week">
        <div className={styles.head}>
          <h2 id="overview-by-week" className={styles.title}>
            Attendance by week
          </h2>
          <p className={styles.sub}>Every group, from the finished registers. Each week opens the registers.</p>
        </div>
        {byWeek.blank ? (
          <p className={styles.muted}>{byWeek.blank}</p>
        ) : (
          <ol className={styles.weeks}>
            {byWeek.weeks.map((row) => (
              <WeekRow key={row.weekNumber} row={row} attendanceHref={attendanceHref} />
            ))}
          </ol>
        )}
      </section>

      {groups && (
        <section className={styles.card} aria-labelledby="overview-groups">
          <div className={styles.head}>
            <div className={styles.headText}>
              <h2 id="overview-groups" className={styles.title}>
                {groups.heading}
              </h2>
              <p className={styles.sub}>Each row opens that group’s page.</p>
            </div>
            <form method="get" action={`${programmePath}/overview`} className={styles.picker}>
              <label htmlFor="overview-week-picker" className={styles.pickerLabel}>
                Week
              </label>
              <Select id="overview-week-picker" name="week" defaultValue={String(groups.weekNumber)} className={styles.pickerSelect}>
                {groups.options.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <button type="submit" className={styles.pickerButton}>
                Show
              </button>
            </form>
          </div>
          <div className={styles.wide}>
            <GroupsTable groups={groups} />
          </div>
          <div className={styles.narrow}>
            <GroupsList groups={groups} />
          </div>
        </section>
      )}
    </>
  );
}
