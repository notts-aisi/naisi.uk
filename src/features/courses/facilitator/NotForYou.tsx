import Link from "next/link";
import { MY_PROGRAMMES } from "@/lib/courses/facilitatorPageWords";
import {
  CANT_OPEN_HEADING,
  CANT_OPEN_LINE,
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
 * IT TAKES THE PAGE, AND WHETHER THE CALLER IS ADMITTED, AND NOTHING ELSE.
 * No group, run, name or id reaches it, so a real group that is not the
 * caller's, an archived one and an address that was never a group draw the
 * same bytes, and the page says nothing about whether a group exists. Only
 * who the page is for differs, and by page (`notForYouWho`).
 *
 * `admitted` is for somebody the page's own gate admits (an admin; on the
 * draw's and the pairs pages, the group's lead or facilitator the gate has
 * already let in) at an address it cannot open: they are never told the page
 * is not for them, and are given one fixed sentence instead, which names no
 * fact about the group either. The caller decides it from what its gate has
 * already read, so it costs no read.
 *
 * Drawn on the server. Nothing here reads a document. Never `notFound()`:
 * in a page that matched its route that answers an empty body
 * (tests/printed-code-landing-pages.test.mjs).
 */
export default function NotForYou({ page, admitted = false }: { page: NotForYouPage; admitted?: boolean }) {
  return (
    <div className={styles.page} data-testid={admitted ? "cant-open" : "not-for-you"}>
      <h1 className={styles.heading}>{admitted ? CANT_OPEN_HEADING : NOT_FOR_YOU_HEADING}</h1>
      {admitted ? (
        <p className={styles.who}>{CANT_OPEN_LINE}</p>
      ) : (
        <>
          <p className={styles.who}>{notForYouWho(page)}</p>
          <p className={styles.help}>{NOT_FOR_YOU_HELP}</p>
        </>
      )}
      <Link href="/learn" className={`${facilitator.buttonPrimary} ${styles.way}`}>
        {MY_PROGRAMMES}
      </Link>
    </div>
  );
}
