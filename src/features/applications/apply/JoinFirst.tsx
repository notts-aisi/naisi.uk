import Link from "next/link";
import kit from "@/features/applications/kit/kit.module.css";
import { CloseIcon } from "./icons";
import styles from "./form.module.css";

/**
 * What the form shows a visitor who is not signed in: a short panel that says
 * applying needs an account and sends them to make one.
 *
 * THERE IS NO FIELD HERE, ON PURPOSE. An application is saved against an
 * account, and making an account is the registration flow's job (the emailed
 * link, the password, the check that a university address is really theirs).
 * A box on this page would be a box whose contents are thrown away, and the
 * visitor would be asked the same thing again a minute later. So this panel
 * asks nothing: it has two links, and each carries this form's address as the
 * place to come back to and nothing else.
 *
 * Both destinations hand the visitor back here when they are done. Which
 * return addresses registration honours is `src/lib/authReturn.ts`; an
 * address under `/apply/` is one of them.
 *
 * A server component: it holds no state, so nothing about it waits for
 * JavaScript, and the two links work the moment the HTML arrives.
 */
export default function JoinFirst({ roundId, label }: { roundId: string; label: string }) {
  const returnTo = encodeURIComponent(`/apply/${roundId}`);
  const title = `Apply · ${label}`;

  return (
    <div className={`${styles.shell} ${styles.takeover}`}>
      <div className={styles.topBar}>
        <header className={styles.appBar}>
          <div className={styles.appBarSide}>
            <Link href="/" className={styles.iconButton} aria-label="Close">
              <CloseIcon />
            </Link>
          </div>
          <div className={styles.appBarTitle}>{title}</div>
          <div className={styles.appBarSide} data-end="true" />
        </header>
      </div>

      <div className={styles.columns}>
        <div className={styles.main}>
          <div className={`${styles.stepRow} ${styles.onLaptop}`}>
            <span className={`${kit.mono} ${styles.stepLine}`}>{title}</span>
          </div>
          <div>
            <h1 className={styles.heading}>Join NAISI to apply</h1>
            <p className={styles.lede}>
              You need a NAISI account to apply. Joining takes a couple of minutes, and we bring you straight
              back to this form afterwards.
            </p>
          </div>
          <div className={styles.joinActions}>
            <Link href={`/register?next=${returnTo}`} className={`${kit.primary} ${styles.join}`}>
              Join NAISI
            </Link>
            <p className={styles.joinAside}>
              Already have an account?{" "}
              <Link href={`/login?next=${returnTo}`} className={styles.joinSignIn}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
