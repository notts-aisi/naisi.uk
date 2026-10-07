import type { ReactNode } from "react";
import styles from "./Notice.module.css";

type NoticeProps = {
  /**
   * `info` (the default) is something worth knowing, `warning` is something
   * that needs doing, `neutral` is a plain fact with no colour.
   */
  tone?: "info" | "warning" | "neutral";
  /** An optional first line in full-strength weight. */
  title?: ReactNode;
  /** The message. */
  children: ReactNode;
  /** Buttons or links. They sit at the right and drop below on a phone. */
  actions?: ReactNode;
  /**
   * `status` (the default) is announced when the notice appears or changes.
   * Use `note` for one that is on the page from the start and never changes,
   * and `alert` only for something that must interrupt.
   */
  role?: "status" | "note" | "alert";
  className?: string;
};

/**
 * A line or two the reader should not miss, with an icon that names its
 * kind. Colour is never the only signal: the icon differs with the tone and
 * the words say what is going on.
 */
export default function Notice({
  tone = "info",
  title,
  children,
  actions,
  role = "status",
  className,
}: NoticeProps) {
  const cls = [styles.notice, styles[tone], className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role={role}>
      <span className={styles.icon} aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          {tone === "warning" ? (
            <>
              <path d="M12 4l9 16H3z" />
              <path d="M12 10v4M12 17v.5" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 11v5M12 8v.5" />
            </>
          )}
        </svg>
      </span>
      <div className={styles.body}>
        {title && <div className={styles.title}>{title}</div>}
        <div>{children}</div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
