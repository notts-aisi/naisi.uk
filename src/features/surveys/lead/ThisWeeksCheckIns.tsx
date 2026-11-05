import Link from "next/link";
import { registerPath, type WeekTable } from "@/lib/surveys/checkIns/weekTable";
import { THIS_WEEK_WORDS as WORDS } from "@/lib/surveys/checkIns/words";
import { weekWords } from "@/lib/surveys/words";
import CheckInRowActions from "./CheckInRowActions";
import styles from "./thisWeek.module.css";

/**
 * THIS WEEK'S CHECK-INS, an admin's table above the weeks on a programme's
 * Check-ins view: a row for each group's session in one week (the week the
 * run is in, or one chosen with `?week=`), its register, its check-in and how
 * many answered, with what an admin can do about each
 * (`CheckInRowActions`). Drawn on the server from `readWeekTable`, which the
 * page asks for only when its gate said the reader is an admin: the
 * programme's lead reads check-ins a whole week at a time, never a group's.
 *
 * No name and no answer: a group, a session, states and counts.
 */
export default function ThisWeeksCheckIns({
  table,
  roundId,
  programmeId,
  runId,
  path,
}: {
  table: WeekTable;
  roundId: string;
  programmeId: string;
  runId: string;
  /** The Check-ins view's own address, which `?week=` is added to. */
  path: string;
}) {
  return (
    <section className={styles.card} aria-labelledby="this-weeks-check-ins">
      <h2 id="this-weeks-check-ins" className={styles.title}>
        {table.title}
      </h2>
      <p className={styles.lede}>{WORDS.lede}</p>
      {table.weeks.length > 1 && (
        <nav className={styles.weeks} aria-label={WORDS.weeks}>
          {table.weeks.map((weekNumber) => {
            const here = weekNumber === table.weekNumber;
            return (
              <Link
                key={weekNumber}
                href={`${path}?week=${weekNumber}`}
                className={here ? `${styles.week} ${styles.weekHere}` : styles.week}
                aria-current={here ? "page" : undefined}
                aria-label={weekWords(weekNumber)}
              >
                {weekNumber}
              </Link>
            );
          })}
        </nav>
      )}
      {table.rows.length === 0 ? (
        <p className={styles.lede}>{WORDS.noSessions}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{WORDS.group}</th>
              <th scope="col">{WORDS.session}</th>
              <th scope="col">{WORDS.register}</th>
              <th scope="col">{WORDS.checkIn}</th>
              <th scope="col">{WORDS.answered}</th>
              <th scope="col">
                <span className={styles.srOnly}>{WORDS.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className={styles.group}>
                  {row.groupName}
                </th>
                <td data-label={WORDS.session}>{row.when}</td>
                <td data-label={WORDS.register}>{row.register}</td>
                <td data-label={WORDS.checkIn}>{row.checkIn}</td>
                <td data-label={WORDS.answered}>{row.answered}</td>
                <td className={styles.doing}>
                  <CheckInRowActions
                    roundId={roundId}
                    programmeId={programmeId}
                    groupId={row.groupId}
                    sessionKey={row.sessionKey}
                    registerHref={registerPath(runId, row.groupId)}
                    open={row.open}
                    close={row.close}
                    remind={row.remind}
                    takeRegisterFirst={row.takeRegisterFirst}
                    note={row.note}
                    reminded={row.reminded}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
