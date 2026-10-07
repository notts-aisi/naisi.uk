import type { ReactNode } from "react";
import styles from "./PageHead.module.css";

type PageHeadProps = {
  /** The page's name. Rendered as the page's one <h1>. */
  title: ReactNode;
  /** One muted line under the title: what this page is. */
  description?: ReactNode;
  /** Chips that sit beside the title: a state, a role. */
  badges?: ReactNode;
  /** A row of small facts or links under the description. */
  meta?: ReactNode;
  /** The way back, above the title: usually one link to the parent page. */
  crumb?: ReactNode;
  /** Buttons. They sit at the right and wrap under the title on a phone. */
  actions?: ReactNode;
  className?: string;
};

/**
 * The head of a signed-in page: its name, a muted line saying what it is,
 * and the page's actions on the right.
 */
export default function PageHead({
  title,
  description,
  badges,
  meta,
  crumb,
  actions,
  className,
}: PageHeadProps) {
  const cls = [styles.head, className ?? ""].filter(Boolean).join(" ");
  return (
    <header className={cls}>
      {crumb && <div className={styles.crumb}>{crumb}</div>}
      <div className={styles.row}>
        <div className={styles.main}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {badges && <div className={styles.badges}>{badges}</div>}
          </div>
          {description && <p className={styles.description}>{description}</p>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
