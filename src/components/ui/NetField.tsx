import type { ReactNode } from "react";
import { NET_CARD, NET_HERO } from "./netFieldData";
import styles from "./NetField.module.css";

type NetFieldProps = {
  /** Which net: `hero` is spread for a wide page hero, `card` is denser. */
  net?: "hero" | "card";
  /**
   * How strongly the net shows through. `soft` sits behind a page hero's
   * words, `medium` on a card, `strong` on a strip with no words over it.
   */
  strength?: "soft" | "medium" | "strong";
  /** Laid over the field. Leave it out for a purely decorative panel. */
  children?: ReactNode;
  className?: string;
};

/**
 * The network motif on a navy radial ground: the stand-in for a photograph
 * on public page heroes and programme cards.
 *
 * It is decoration. The drawing is hidden from assistive technology and takes
 * no pointer events, and whatever is passed as children sits above it. The
 * net is cropped to the box (never stretched), so the box decides the size:
 * give it one through `className`, or let the children do it.
 */
export default function NetField({
  net = "card",
  strength = "medium",
  children,
  className,
}: NetFieldProps) {
  const drawing = net === "hero" ? NET_HERO : NET_CARD;
  const cls = [styles.field, className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <svg
        className={`${styles.net} ${styles[strength]}`}
        viewBox={drawing.viewBox}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        {drawing.edges.map(([x1, y1, x2, y2], i) => (
          <line key={i} className={styles.edge} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
        {drawing.nodes.map(([cx, cy, lit], i) => (
          <circle
            key={i}
            className={lit ? styles.lit : styles.node}
            cx={cx}
            cy={cy}
            r={lit ? 2.6 : 1.8}
          />
        ))}
      </svg>
      {children !== undefined && <div className={styles.content}>{children}</div>}
    </div>
  );
}
