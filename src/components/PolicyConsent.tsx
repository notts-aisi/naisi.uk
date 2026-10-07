"use client";

import Link from "next/link";
import { POLICIES } from "@/lib/legal/policies";
import styles from "./PolicyConsent.module.css";

/**
 * Required "I agree to the Terms + Privacy Policy" checkbox for the signup
 * forms. The label only wraps the leading text (so clicking the policy links
 * opens them, in a new tab, rather than toggling the box). The accepted
 * version + timestamp are stamped server-side / at registration, not here.
 */
export default function PolicyConsent({
  checked,
  onChange,
  id = "policy-consent",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  return (
    <div className={styles.row}>
      {/* A second label round the box itself: its padding is the box's
          target, 44px each way, and takes up no room in the row. */}
      <label htmlFor={id} className={styles.target}>
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={styles.box}
        />
      </label>
      <span className={styles.text}>
        <label htmlFor={id}>I agree to NAISI&apos;s{" "}</label>
        <Link href={POLICIES.terms.href} target="_blank" className={styles.link}>
          {POLICIES.terms.label}
        </Link>
        {" and "}
        <Link href={POLICIES.privacy.href} target="_blank" className={styles.link}>
          {POLICIES.privacy.label}
        </Link>
        .
      </span>
    </div>
  );
}
