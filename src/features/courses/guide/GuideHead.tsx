import Link from "next/link";
import weekly from "../weekly/weekly.module.css";
import styles from "./guide.module.css";

/**
 * The top of Start here and the Glossary (wk-start, wk-glossary and their
 * phone boards): on a phone, the bar with the way back to the programme and
 * the page's name; on a wide page, the breadcrumb; then the programme's
 * label and the title. Every name comes in from a record.
 */

type Props = {
  /** The programme page, or week 1 for somebody who holds a place before groups go out. */
  backHref: string;
  /** "AGI Strategy". */
  programmeName: string;
  /** "Fellowship: AGI Strategy". */
  eyebrow: string;
  /** "Start here" or "Glossary". */
  title: string;
};

export function GuidePhoneBar({ backHref, programmeName, title }: Omit<Props, "eyebrow">) {
  return (
    <div className={`${weekly.bar} ${styles.phoneBar}`}>
      <div className={weekly.barStart}>
        <Link href={backHref} className={weekly.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>{programmeName}</span>
        </Link>
      </div>
      <div className={weekly.barTitle}>{title}</div>
      <div className={weekly.barEnd} />
    </div>
  );
}

export default function GuideHead({ backHref, programmeName, eyebrow, title }: Props) {
  return (
    <header>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href={backHref} className={styles.crumbLink}>
          {programmeName}
        </Link>
        <span className={styles.crumbSep} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <span className={styles.crumbHere} aria-current="page">
          {title}
        </span>
      </nav>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
    </header>
  );
}
