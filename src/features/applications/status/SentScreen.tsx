"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import kit from "@/features/applications/kit/kit.module.css";
import { TickIcon } from "@/features/applications/apply/icons";
import type { StatusStep } from "@/lib/applications/status/view";
import Steps from "./Steps";
import styles from "./status.module.css";

/**
 * "Application sent.": what the form turns into the moment a send succeeds.
 *
 * It says the two things somebody wants to know next (when they will hear,
 * and until when they can still change their answers), shows where they are
 * in the term, and offers the page that keeps showing it: "See your
 * application" goes to `/applications/<form>`, which is where the decision
 * will appear too.
 *
 * The form is gone from the screen by the time this is drawn, so the heading
 * takes the focus: a screen reader starts from "Application sent." and not
 * from wherever the Send button used to be.
 */
export default function SentScreen({
  roundId,
  steps,
  decisionsLabel,
  closesLabel,
}: {
  roundId: string;
  steps: readonly StatusStep[];
  /** "Fri 23 Oct", or null when the form has no decision day written down. */
  decisionsLabel: string | null;
  /** "Sun 18 Oct, 23:59", or null when the form has no deadline. */
  closesLabel: string | null;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={`${styles.vars} ${styles.shell}`} data-pad="sent">
      <div className={styles.column} data-gap="sent">
        <div>
          <span className={styles.disc}>
            <TickIcon size={26} strokeWidth={2.6} />
          </span>
          <h1 ref={heading} tabIndex={-1} className={styles.bigTitle} data-after="disc">
            Application sent.
          </h1>
          <p className={styles.lede}>
            {decisionsLabel ? (
              <>
                We’ll email you on <strong className={styles.together}>{decisionsLabel}</strong>.{" "}
              </>
            ) : null}
            {closesLabel ? (
              <>
                You can change your answers until <span className={styles.together}>{closesLabel}</span>.
              </>
            ) : (
              "You can change your answers until applications close."
            )}
          </p>
        </div>

        <div className={styles.card} data-pad="steps">
          <Steps steps={steps} />
        </div>

        <div className={styles.actions}>
          <Link href={`/applications/${encodeURIComponent(roundId)}`} className={`${kit.primary} ${styles.primary}`}>
            See your application
          </Link>
          <Link href="/" className={styles.outline}>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
