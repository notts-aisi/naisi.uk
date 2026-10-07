import Link from "next/link";
import Chip from "@/components/ui/Chip";
import { POLICIES, type PolicyKey } from "@/lib/legal/policies";
import styles from "@/content/legal/legal.module.css";

/** Version-history index for a policy: every published version + its date. */
export default function PolicyVersionsIndex({ policy }: { policy: PolicyKey }) {
  const meta = POLICIES[policy];
  const current = meta.versions[0].version;

  return (
    <section className={styles.page}>
      <div className="container">
        <div className={styles.index}>
          <p className="meta">Legal</p>
          <h1 className={styles.heading}>{meta.label} version history</h1>
          <p className={styles.lede}>
            Every published version of our {meta.label}. The current version
            applies to your use of the site; earlier versions are kept for
            reference, so you can see exactly what you agreed to and when.
          </p>

          <ul className={styles.versionList}>
            {meta.versions.map((vrs) => (
              <li key={vrs.version}>
                <Link
                  href={vrs.version === current ? meta.href : `${meta.href}/v/${vrs.version}`}
                >
                  Version {vrs.version}
                </Link>
                <span className={styles.versionMeta}>{vrs.lastUpdated}</span>
                {vrs.version === current ? <Chip tone="accent">Current</Chip> : null}
              </li>
            ))}
          </ul>

          <p className={styles.back}>
            <Link className={styles.backLink} href={meta.href}>
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
                <path d="M15 6l-6 6 6 6" />
              </svg>
              <span>Back to the current {meta.label}</span>
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
