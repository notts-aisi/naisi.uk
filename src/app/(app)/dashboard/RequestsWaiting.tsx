import Link from "next/link";
import { requestsWaitingLine, requestsWaitingTitle } from "@/lib/courses/registerCorrection/pageWords";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import { ChevronRight } from "./icons";
import styles from "./home.module.css";

/**
 * "REQUESTS WAITING", under the greeting on Home for the programme's lead:
 * a facilitator has asked for a line of a finished register to be
 * corrected, and the lead decides it on the Requests page. Drawn only when
 * something waits, and only for somebody the Requests page's tree admits
 * (worked out on the server, `requestsWaitingFor`). An admin's Home says the
 * same in its To do instead.
 */
export default function RequestsWaiting({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <section className={styles.card} aria-labelledby="home-requests" data-testid="home-requests">
      <ul className={styles.todo} role="list">
        <li className={styles.todoRow}>
          <span className={styles.todoFigure}>{count}</span>
          <div className={styles.todoBody}>
            <h2 id="home-requests" className={styles.todoTitle}>
              {requestsWaitingTitle(count)}
            </h2>
            <p className={styles.small}>{requestsWaitingLine(count)}</p>
          </div>
          <Link href={REQUESTS_PATH} className={styles.primary}>
            Open
            <ChevronRight />
          </Link>
        </li>
      </ul>
    </section>
  );
}
