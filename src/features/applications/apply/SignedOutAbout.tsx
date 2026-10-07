"use client";

import { useState } from "react";
import Link from "next/link";
import kit from "@/features/applications/kit/kit.module.css";
import type { AboutYou } from "@/lib/applications/model";
import { EMPTY_ABOUT_YOU } from "@/lib/applications/normalise";
import AboutStep from "./AboutStep";
import { ArrowRightIcon, CloseIcon } from "./icons";
import styles from "./form.module.css";

/**
 * About you, for a visitor who is not signed in.
 *
 * The step looks the way it does for everybody else, with empty boxes. What
 * it does NOT do is create an account: making an account is the registration
 * flow's job (the emailed link, the password, the check that a university
 * address is really theirs), and there is one of those on purpose. So
 * Continue hands the visitor to registration with this form as the place to
 * come back to, and the address it goes to carries the form's id and nothing
 * the visitor typed.
 *
 * Nothing typed here is stored or sent anywhere. Once they have an account
 * the step opens filled in from it.
 */
export default function SignedOutAbout({ roundId, label }: { roundId: string; label: string }) {
  // Held only so the boxes behave like boxes. It never leaves this component.
  const [about, setAbout] = useState<AboutYou>(EMPTY_ABOUT_YOU);
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
        <div role="progressbar" aria-label="Step 1" aria-valuetext="Step 1" className={styles.progress}>
          <div className={styles.progressFill} style={{ width: "8%" }} />
        </div>
      </div>

      <div className={styles.columns}>
        <aside className={styles.aside}>
          <div className={styles.asideHead}>
            <div className={`${kit.mono} ${styles.eyebrow}`}>{title}</div>
          </div>
          <nav aria-label="Your application">
            <ol className={styles.sectionList}>
              <li>
                <span className={styles.sectionLink} aria-current="step" data-state="current">
                  <span className={styles.sectionMark}>1</span>
                  <span>About you</span>
                </span>
              </li>
            </ol>
          </nav>
          <p className={styles.asideHelp}>
            Questions? <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>
          </p>
        </aside>

        <div className={styles.main}>
          <div className={styles.stepRow}>
            <span className={`${kit.mono} ${styles.stepLine}`}>Step 1 · About you</span>
          </div>
          <div role="progressbar" aria-label="Step 1" aria-valuetext="Step 1" className={`${styles.progress} ${styles.desktopProgress}`}>
            <div className={styles.progressFill} style={{ width: "8%" }} />
          </div>
          <div>
            <h1 className={styles.heading}>About you</h1>
            <p className={styles.lede}>
              You don’t have an account yet, so this step is your join request too. You can keep applying while
              the committee checks it. If you get a place, that approves your account.
            </p>
            <p className={styles.lede}>
              Already have an account?{" "}
              <Link href={`/login?next=${returnTo}`} className={styles.inlineLink}>
                Sign in
              </Link>
            </p>
          </div>

          <AboutStep
            about={about}
            email={{ kind: "new", onChange: () => {} }}
            onChange={(patch) => setAbout((current) => ({ ...current, ...patch }))}
            problems={[]}
          />

          <div className={styles.desktopNav}>
            <p className={styles.recaptcha}>
              This site is protected by reCAPTCHA. Google’s{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
                Terms of Service
              </a>{" "}
              apply.
            </p>
            <Link href={`/register?next=${returnTo}`} className={`${kit.primary} ${styles.next}`}>
              <span>Next</span>
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p className={styles.recaptcha}>
          This site is protected by reCAPTCHA. Google’s{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{" "}
          apply.
        </p>
        <div className={styles.bottomActions}>
          <Link href="/" className={styles.finishLater}>
            Finish later
          </Link>
          <Link href={`/register?next=${returnTo}`} className={`${kit.primary} ${styles.continue}`}>
            <span>Continue</span>
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}
