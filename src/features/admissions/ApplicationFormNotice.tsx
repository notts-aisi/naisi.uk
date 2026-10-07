import { MADE_ON_THE_APPLICATION_FORM } from "@/lib/admissions/formFence";
import styles from "./ApplicationFormNotice.module.css";

/**
 * What an older applicant page says when the round it was asked for is an
 * application form: where applications are made, and nothing else.
 *
 * The page that reads one application back was written for rounds of the
 * older kind. An application made on a form is read back on the form's own
 * screens, so on a form that page returns this before it reads or draws
 * anything in the older shape. The apply page returned it as well while the
 * form had no screen of its own. It shows the form at that address now, so it
 * has nothing left to say this about. See `src/lib/admissions/formFence.ts`
 * for the rule.
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
