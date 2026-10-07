import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { LINKS_PAGE_PATH } from "@/content/socials";
import { FOOTER_COLUMNS, LEGAL_ENTRIES, shown, type ShownEntry } from "./publicNav";
import styles from "./PublicFooter.module.css";

/**
 * One footer entry. The columns and the legal row are lists in publicNav.ts;
 * this decides only what kind of link each address is.
 */
function EntryLink({ entry }: { entry: ShownEntry }) {
  if (entry.external) {
    return (
      <a href={entry.href} target="_blank" rel="noreferrer noopener">
        {entry.label}
      </a>
    );
  }
  if (entry.href.startsWith("mailto:")) {
    return <a href={entry.href}>{entry.label}</a>;
  }
  // The page of all our links is a page on this site and is named by its
  // constant, never by a typed address, so the footer cannot drift to the
  // third-party page it replaced.
  if (entry.href === LINKS_PAGE_PATH) {
    return <Link href={LINKS_PAGE_PATH}>{entry.label}</Link>;
  }
  return <Link href={entry.href}>{entry.label}</Link>;
}

export default function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brandBlock}>
            {/* The emblem beside the society's name on three lines. The name
                is real text, so the emblem stays decorative. */}
            <div className={styles.lockup}>
              <BrandMark size={72} showWordmark={false} />
              <p className={styles.name}>
                Nottingham
                <br />
                AI Safety
                <br />
                Initiative
              </p>
            </div>
            <p className={styles.tagline}>
              The AI safety student community at the University of Nottingham.
            </p>
          </div>
          <div className={styles.columns}>
            {FOOTER_COLUMNS.map((column) => {
              const entries = shown(column.entries);
              // A column whose pages are all still to come is left out whole,
              // heading included.
              if (entries.length === 0) return null;
              return (
                <nav key={column.heading} className={styles.column} aria-label={column.heading}>
                  <p className={`meta ${styles.heading}`}>{column.heading}</p>
                  {entries.map((entry) => (
                    <EntryLink key={entry.key} entry={entry} />
                  ))}
                </nav>
              );
            })}
          </div>
        </div>
        <div className={styles.base}>
          <span>
            © {new Date().getFullYear()} NAISI · an official University of Nottingham society
          </span>
          <nav className={styles.legal} aria-label="Legal">
            {shown(LEGAL_ENTRIES).map((entry) => (
              <EntryLink key={entry.key} entry={entry} />
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
