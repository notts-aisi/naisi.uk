import type { ReactNode } from "react";
import NetField from "@/components/ui/NetField";
import styles from "./programme.module.css";

type Props = {
  /** The id of the heading inside, for the band's `aria-labelledby`. */
  labelledBy?: string;
  /** What the band is, for a band with no heading of its own to point at. */
  label?: string;
  /**
   * The children already carry the room between the words and the first
   * button, so what follows sits a button's gap away and no further.
   */
  joined?: boolean;
  children: ReactNode;
};

/**
 * The band that closes a programme page, on the network ground: what to do
 * next, and the button for it. The page lays out what goes inside.
 */
export default function ClosingBand({ labelledBy, label, joined = false, children }: Props) {
  return (
    <section aria-labelledby={labelledBy} aria-label={label}>
      <NetField net="hero" strength="soft" className={styles.band}>
        <div className="container">
          <div className={joined ? `${styles.bandRow} ${styles.bandRowJoined}` : styles.bandRow}>
            {children}
          </div>
        </div>
      </NetField>
    </section>
  );
}
