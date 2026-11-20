import Link from "next/link";
import { MY_PROGRAMMES } from "@/lib/courses/facilitatorPageWords";
import {
  NOT_FOR_YOU_HEADING,
  NOT_FOR_YOU_HELP,
  notForYouWho,
  type NotForYouPage,
} from "@/lib/courses/notForYouWords";
import facilitator from "./facilitator.module.css";
import styles from "./notForYou.module.css";

/**
 * THE ONE CALM PAGE for a signed-in person a group's own page does not admit:
 * the facilitator's group page, the draw's page and the pairs page each
 * return it, with a 200 and as ordinary HTML, at every point where they used
 * to send somebody away without a word.
 *
 * IT TAKES THE PAGE AND NOTHING ELSE. No group, run, name or id reaches it,
 * so a real group that is not the caller's, an archived one and an address
 * that was never a group draw the same bytes, and the page says nothing about
 * whether a group exists. Only who the page is for differs, and by page
 * (`notForYouWho`).
 *
 * Drawn on the server. Nothing here reads a document. Never `notFound()`:
 * in a page that matched its route that answers an empty body
 * (tests/printed-code-landing-pages.test.mjs).
 */
export default function NotForYou({ page }: { page: NotForYouPage }) {
  return (
    <div className={styles.page} data-testid="not-for-you">
      <h1 className={styles.heading}>{NOT_FOR_YOU_HEADING}</h1>
      <p className={styles.who}>{notForYouWho(page)}</p>
      <p className={styles.help}>{NOT_FOR_YOU_HELP}</p>
      <Link href="/learn" className={`${facilitator.buttonPrimary} ${styles.way}`}>
        {MY_PROGRAMMES}
      </Link>
    </div>
  );
}
