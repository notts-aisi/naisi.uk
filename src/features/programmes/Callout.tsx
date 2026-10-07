import type { ReactNode } from "react";
import styles from "./programme.module.css";

type Props = {
  title: string;
  children?: ReactNode;
  /** The one link or button at the right. It drops below on a phone. */
  action?: ReactNode;
  /** `dashed` is an aside. `tinted` is something worth knowing. */
  look?: "dashed" | "tinted";
  /** An id a link jumps to. */
  id?: string;
};

/** A line, a sentence and one action, set apart from the section around it. */
export default function Callout({ title, children, action, look = "dashed", id }: Props) {
  const cls = [styles.callout, look === "tinted" ? styles.calloutTinted : "", id ? styles.anchor : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div id={id} className={cls}>
      <div className={styles.calloutWords}>
        <h3 className={styles.calloutTitle}>{title}</h3>
        {children ? <p className={styles.calloutBody}>{children}</p> : null}
      </div>
      {action}
    </div>
  );
}
