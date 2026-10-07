import { MADE_ON_THE_APPLICATION_FORM } from "@/lib/admissions/formFence";
import styles from "./ApplicationFormNotice.module.css";

/**
 * What an older applicant page says when the round it was asked for is an
 * application form: where applications are made, and nothing else.
 *
 * The apply page and the page that reads one application back were both
 * written for rounds of the older kind. A form is filled in, and read back, on
 * its own screens, so on a form each of those pages returns this before it
 * reads or draws anything in the older shape. See
 * `src/lib/admissions/formFence.ts` for the rule.
 *
 * ORDINARY HTML, RETURNED BY THE PAGE. Never `notFound()`: for a page that
 * matched its route Next answers that with an empty body and draws the screen
 * in the browser once its scripts arrive, and the round is there. A server
 * component with no state and no props, so nothing about the form is written
 * into a page a signed-out visitor can open.
 *
 * It carries no link. The form's own pages are what replace this notice, at
 * the same address, and they are the link.
 */
export default function ApplicationFormNotice() {
  return (
    <section className={styles.page}>
      <div className="container">
        <div className={styles.notice}>
          <h1 className={styles.sentence}>{MADE_ON_THE_APPLICATION_FORM}</h1>
        </div>
      </div>
    </section>
  );
}
