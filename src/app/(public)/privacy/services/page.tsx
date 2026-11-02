import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AI_REVIEW_LINK, OUTSIDE_SERVICES, SERVICES_LAST_UPDATED } from "@/content/legal/services";
import styles from "@/content/legal/legal.module.css";

const TITLE = "Services we use";
const DESCRIPTION =
  "The outside services the Nottingham AI Safety Initiative uses to run its website, and what each one receives.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

/**
 * THE OUTSIDE SERVICES, from the privacy policy (version 15 on): what each
 * does for us, what it receives and its own privacy policy, drawn from
 * `src/content/legal/services.ts`. The policy says we use the services
 * listed here and that adding one updates this page and is told before it
 * receives anything, so a service is added there, never typed here.
 *
 * Server rendered, no reads: the same page for everybody.
 */
export default function PrivacyServicesPage() {
  return (
    <section className={styles.page}>
      <div className="container">
        <div className={styles.index}>
          <p className="meta">Legal</p>
          <h1 className={styles.heading}>{TITLE}</h1>
          <p className={styles.meta}>
            <span>Updated {SERVICES_LAST_UPDATED}</span>
          </p>
          <p className={styles.lede}>
            We use these outside services to run the site. For each one, what
            it does for us, what it receives and its own privacy policy. If we
            add a service, we update this page and tell you before it receives
            anything about you. Our{" "}
            <Link href="/privacy">privacy policy</Link> says the rest.
          </p>

          <ul className={styles.serviceList}>
            {OUTSIDE_SERVICES.map((service) => (
              <li key={service.id} id={service.id}>
                <h2 className={styles.serviceName}>{service.name}</h2>
                <p>
                  <span className={styles.serviceLabel}>What it does for us</span>
                  {linked(service.does)}
                </p>
                <p>
                  <span className={styles.serviceLabel}>What it receives</span>
                  {service.receives}
                </p>
                {service.policy ? (
                  <p>
                    <span className={styles.serviceLabel}>Its privacy policy</span>
                    <a href={service.policy.href} target="_blank" rel="noreferrer noopener">
                      {service.policy.label}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <p className={styles.back}>
            <Link className={styles.backLink} href="/privacy">
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
              <span>Back to the privacy policy</span>
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/** A service's words, with "AI-assisted review" linked to that part of the policy. */
function linked(text: string): ReactNode {
  const [before, ...rest] = text.split(AI_REVIEW_LINK.words);
  if (rest.length === 0) return text;
  return (
    <>
      {before}
      <Link href={AI_REVIEW_LINK.href}>{AI_REVIEW_LINK.words}</Link>
      {rest.join(AI_REVIEW_LINK.words)}
    </>
  );
}
