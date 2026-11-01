import Link from "next/link";
import { TAB_WORDS } from "@/lib/messages/words";
import styles from "./messages.module.css";

/**
 * Write and Sent, the two halves of Messages, as two pills under the title.
 * Links to two pages, not an ARIA tablist: nothing here owns a panel, and the
 * current one says so with `aria-current`. Each pill is at least 44px tall.
 */
export default function MessagesTabs({ current }: { current: "write" | "sent" }) {
  const tab = (key: "write" | "sent", href: string, label: string) => (
    <Link
      href={href}
      className={key === current ? `${styles.tab} ${styles.tabCurrent}` : styles.tab}
      aria-current={key === current ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <nav className={styles.tabs} aria-label={TAB_WORDS.nav}>
      {tab("write", "/messages", TAB_WORDS.write)}
      {tab("sent", "/messages/sent", TAB_WORDS.sent)}
    </nav>
  );
}
