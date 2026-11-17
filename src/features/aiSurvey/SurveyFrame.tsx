import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import styles from "./survey.module.css";

/**
 * The frame every page of the AI at Nottingham survey sits in: the brand mark,
 * a word saying which page this is, and nothing else.
 *
 * NOT the site's public header, on purpose. That header is a client component
 * with the account links in it, and it loads Google's sign-in script when one
 * is pressed. A student answering an anonymous survey should meet nothing that
 * loads from anybody else, so this bar has no link in it at all: not even one
 * home, which would also be the quickest way to lose a half-answered page.
 */
export default function SurveyFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <BrandMark size={32} />
        <span className={styles.barLabel}>{label}</span>
      </header>
      {children}
    </div>
  );
}
