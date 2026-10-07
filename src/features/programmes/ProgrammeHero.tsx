import type { ReactNode } from "react";
import NetField from "@/components/ui/NetField";
import styles from "./programme.module.css";

/**
 * The top of a programme page: the network ground, edge to edge, with the
 * page's words over it. `crumb` is for a hero that opens with a way back,
 * which sits closer to the header.
 */
export default function ProgrammeHero({ crumb = false, children }: { crumb?: boolean; children: ReactNode }) {
  return (
    <NetField
      net="hero"
      strength="soft"
      className={crumb ? `${styles.hero} ${styles.heroWithCrumb}` : styles.hero}
    >
      <div className="container">{children}</div>
    </NetField>
  );
}
