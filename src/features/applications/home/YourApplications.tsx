import Link from "next/link";
import Card from "@/components/ui/Card";
import styles from "./YourApplications.module.css";

/**
 * The way back to "Your applications", on the dashboard.
 *
 * Somebody who has applied comes back to find out what happened, and the
 * page that tells them (`/applications`) was reachable only from the email
 * and from a closed course page. This is the one obvious link to it, where a
 * member already looks for their own things. It sits with the dashboard's
 * other summary cards and is drawn like them.
 *
 * ONLY FOR SOMEBODY WHO HAS APPLIED. With no applications it renders nothing,
 * for the reason the cards beside it do: a dashboard full of "you have none
 * of these" is worse than a short one. When the applications could not be
 * read at all (`rows` is null) the link is offered anyway, because hiding
 * the way back from somebody who applied last week is the worse mistake.
 *
 * IT SAYS WHERE, NEVER HOW IT WENT. A row is the name the list already gives
 * the application and a link to it. What became of an application is said in
 * one place, on its own page and the list, in words held to each other by a
 * test; a third wording here could come to disagree with them, and nobody
 * should learn a decision from a summary card.
 *
 * A Server Component with no state of its own: the page reads, this draws.
 */

/** One application as the dashboard names it. */
export type YourApplicationRow = {
  /** The round the application is on, which is the address it is read back at. */
  roundId: string;
  /** What the list of applications calls it: "Autumn 2026". */
  label: string;
};

/** Past this the list is one click away, and a summary card should stay one. */
const MAX_ROWS = 3;

const LIST_PATH = "/applications";

export default function YourApplications({ rows }: { rows: YourApplicationRow[] | null }) {
  if (rows !== null && rows.length === 0) return null;

  return (
    <Card padding="md" className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.title}>Your applications</h3>
        <Link href={LIST_PATH} className={styles.viewAll}>
          View all →
        </Link>
      </div>

      {rows === null ? (
        <p className={styles.note}>Everything you have applied to, and where each one has got to.</p>
      ) : (
        <ul className={styles.list}>
          {rows.slice(0, MAX_ROWS).map((row) => (
            <li key={row.roundId}>
              <Link href={`${LIST_PATH}/${encodeURIComponent(row.roundId)}`} className={styles.row}>
                <span className={styles.name}>{row.label}</span>
                <span className={styles.open}>Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
