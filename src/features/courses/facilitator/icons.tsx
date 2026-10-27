import styles from "./facilitator.module.css";

/**
 * The people icon beside "6 expected" on a facilitator's ticket, on the group
 * page and on Home. Decorative: the words beside it say it all.
 */
export function PeopleIcon() {
  return (
    <svg className={styles.peopleIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="8.5" r="2.6" />
      <path d="M15.5 13.6c2.6-.3 4.6 1.4 5 4.4" />
    </svg>
  );
}
