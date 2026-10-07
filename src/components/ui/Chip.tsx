import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";

export type ChipTone = "neutral" | "accent" | "success" | "danger" | "warning" | "live";
export type ChipSize = "sm" | "md";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  size?: ChipSize;
  /** A small dot before the word, for a state that is live or needs doing. */
  dot?: boolean;
  children: ReactNode;
  /** Native tooltip — the escape hatch for chips whose label is abbreviated. */
  title?: string;
};

/**
 * Small status/label pill. `size="md"` is what Badge renders (Badge is a
 * wrapper around it); `size="sm"` is for dense rows where a chip is a marker
 * rather than a heading: roster cells, week strips.
 *
 * Tones: `neutral`, `accent`, `success`, `warning`, `danger`, and `live` for
 * something happening now. A tone is never the only signal: the chip always
 * carries a word.
 *
 * Chips that are themselves interactive pass `data-interactive="true"` for the
 * hover ring, and `tabIndex={0}` if they take focus.
 */
export default function Chip({
  tone = "neutral",
  size = "md",
  dot = false,
  className,
  children,
  ...rest
}: Props) {
  const cls = [styles.chip, styles[size], styles[tone], className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
