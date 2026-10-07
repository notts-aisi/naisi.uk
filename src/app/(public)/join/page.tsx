import type { Metadata } from "next";
import Link from "next/link";
import SubscribeForm from "@/components/SubscribeForm";
import NetField from "@/components/ui/NetField";
import { SU_PAGE_URL } from "@/content/socials";
import styles from "./join.module.css";

export const metadata: Metadata = {
  title: "Join",
  description:
    "Three ways to join the Nottingham AI Safety Initiative: the mailing list, an account on naisi.uk, and Students' Union membership.",
};

/*
  /join: the three things "joining" can mean, side by side, so nobody has to
  work out which one they were after. The mailing list comes first and is the
  only one with a form on this page. An account is made at /register, and SU
  membership is bought on the Students' Union's own site.

  Static: nothing here is read from the database.

  The form is the site's one subscribe form, used as it stands. It is a client
  component, and what it is handed here is two literal lists and a label,
  nothing fetched.
*/

function External() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export default function JoinPage() {
  return (
    <>
      <NetField net="hero" strength="soft" className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <h1 className={styles.title}>Join NAISI.</h1>
          <p className={styles.lede}>
            The mailing list is the easiest place to start. To apply for a
            programme you’ll need an account. SU membership is £6 a year on
            the SU site.
          </p>
        </div>
      </NetField>

      <div className={styles.section}>
        <div className="container">
          <section className={`${styles.card} ${styles.cardFirst}`} aria-labelledby="join-emails">
            <div className={styles.firstIntro}>
              <span className={styles.step}>01</span>
              <h2 id="join-emails" className={styles.cardTitle}>
                Get the emails
              </h2>
              <p className={styles.cardText}>
                We’ll tell you when the next round opens and when something’s
                on. You choose which emails you get.
              </p>
              <div>
                <p className={styles.price}>Free</p>
                <p className={styles.priceNote}>You don’t need an account</p>
              </div>
            </div>
            <div className={styles.firstForm}>
              <SubscribeForm
                source="join"
                channels={[
                  { id: "events", label: "Events", defaultChecked: false },
                  { id: "newsletter", label: "The newsletter", defaultChecked: false },
                ]}
              />
            </div>
          </section>

          <div className={styles.pair}>
            <section className={styles.card} aria-labelledby="join-account">
              <span className={styles.step}>02</span>
              <h2 id="join-account" className={styles.cardTitle}>
                Make an account
              </h2>
              <p className={styles.cardText}>
                You’ll need one to apply for a programme, and for some events.
              </p>
              <div>
                <p className={styles.price}>Free</p>
                <p className={styles.priceNote}>Sign in with Google or your email</p>
              </div>
              <div className={styles.how}>
                <h3 className={styles.labelHeading}>
                  <span className="meta">How it works</span>
                </h3>
                <p className={styles.cardText}>
                  Making an account sends us a join request. The committee
                  checks every new account, and you can apply for a programme
                  while you wait.
                </p>
                <p className={`${styles.cardText} ${styles.cardTextStrong}`}>
                  You can also make one when you apply. The first page of the
                  application is the join request.
                </p>
              </div>
              <div className={styles.cardFoot}>
                <Link href="/register" className={styles.action}>
                  Create an account
                </Link>
              </div>
            </section>

            <section className={styles.card} aria-labelledby="join-su">
              <span className={styles.step}>03</span>
              <h2 id="join-su" className={styles.cardTitle}>
                Get SU membership
              </h2>
              <p className={styles.cardText}>
                It makes you an official member of the society.
              </p>
              <div>
                <p className={styles.price}>£6 a year</p>
                <p className={styles.priceNote}>Paid on the SU website</p>
              </div>
              <div className={styles.how}>
                <h3 className={styles.labelHeading}>
                  <span className="meta">How it works</span>
                </h3>
                <p className={`${styles.cardText} ${styles.cardTextStrong}`}>
                  We’d like everyone who takes part to get SU membership (£6 a
                  year). It never stops you taking part.
                </p>
                <p className={styles.cardText}>
                  We match it to your account using your university email.
                </p>
              </div>
              <div className={styles.cardFoot}>
                <a
                  href={SU_PAGE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={styles.action}
                >
                  <span>Join on the SU site</span>
                  <External />
                </a>
                <p className={styles.actionNote}>Opens the SU website.</p>
              </div>
            </section>
          </div>

          <p className={styles.elsewhere}>
            Not at Nottingham?{" "}
            <Link href="/register?type=collaborator" className={styles.elsewhereLink}>
              Collaborate with us on a project
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
