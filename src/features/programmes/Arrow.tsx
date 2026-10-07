import styles from "./programme.module.css";

/**
 * The small arrow after a link's words, and the chevron of a way back.
 * Decoration: the link's own words say where it goes.
 */
export default function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      className={styles.arrow}
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
      <path d={back ? "M15 6l-6 6 6 6" : "M5 12h14M13 6l6 6-6 6"} />
    </svg>
  );
}
