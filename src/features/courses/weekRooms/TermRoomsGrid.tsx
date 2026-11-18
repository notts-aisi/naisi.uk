import Link from "next/link";
import type { TermSection } from "@/lib/courses/weekRooms/model";
import { CELL_MARK, NOT_BOOKED, NO_GROUPS, NO_SESSION, cellLinkLabel } from "@/lib/courses/weekRooms/words";
import styles from "./WeekRooms.module.css";

/**
 * THE TERM'S ROOMS: a table a programme, a row a group, a column a taught week
 * of its run, each cell that week's room with what is unusual about it. Every
 * cell with a session is a link to that week's rooms with the group's row in
 * view; the grid itself writes nothing. A wide grid scrolls inside its own
 * box, the group's name held at its left edge.
 */
export default function TermRoomsGrid({ sections }: { sections: TermSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.programmeId} className={styles.section} aria-labelledby={`term-${section.programmeId}`}>
          <h2 id={`term-${section.programmeId}`} className={styles.sectionTitle}>
            {section.programmeName}
          </h2>
          {section.rows.length === 0 ? (
            <p className={styles.lede}>{NO_GROUPS}</p>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <td />
                    {section.weeks.map((week) => (
                      <th key={week.weekNumber} scope="col">
                        {week.label}
                        {week.from ? <span className={styles.gridWeek}>{week.from}</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.groupId}>
                      <th scope="row">{row.groupName}</th>
                      {row.cells.map((cell) => (
                        <td key={cell.weekNumber}>
                          {cell.kind === "none" ? (
                            <span className={styles.cellNone}>{NO_SESSION}</span>
                          ) : (
                            <Link href={cell.href} className={styles.cellLink}>
                              <span className={styles.visuallyHidden}>{cellLinkLabel(row.groupName, cell.weekNumber, cell.day)}</span>
                              {cell.marks.includes("cancelled") ? null : (
                                <span className={cell.room ? "" : styles.cellEmpty}>{cell.room || NOT_BOOKED}</span>
                              )}
                              {cell.marks.map((mark) => (
                                <span key={mark} className={styles.mark}>
                                  {CELL_MARK[mark]}
                                </span>
                              ))}
                            </Link>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
