import type { ReactNode } from "react";
import styles from "./programme.module.css";

type Props = {
  /** `raised` is the alternate ground. Sections take turns. */
  tone?: "floor" | "raised";
  /** The hairline over the section. Off for the first section under a hero. */
  rule?: boolean;
  /** An id another part of the page, or another page, links to. */
  id?: string;
  /** The id of the heading that names this section. */
  labelledBy?: string;
  children: ReactNode;
};

/**
 * One full-width band of a programme page. The ground runs edge to edge and
 * the global container inside it sets the width and the side gutter.
 */
export default function Section({ tone = "floor", rule = true, id, labelledBy, children }: Props) {
  const cls = [
    styles.section,
    tone === "raised" ? styles.raised : "",
    rule ? styles.rule : "",
    id ? styles.anchor : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section id={id} className={cls} aria-labelledby={labelledBy}>
      <div className="container">{children}</div>
    </section>
  );
}
