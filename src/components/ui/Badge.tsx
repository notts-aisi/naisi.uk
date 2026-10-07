import type { HTMLAttributes, ReactNode } from "react";
import Chip, { type ChipTone } from "./Chip";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  /** A small dot before the word. See Chip. */
  dot?: boolean;
  children: ReactNode;
};

/**
 * Thin alias for `<Chip size="md">`, kept so the many existing callsites need
 * no edit. A `style` override still wins over Chip's classes.
 *
 * New code should reach for Chip directly: it has the size axis and the
 * hover and focus states.
 */
export default function Badge({ tone = "neutral", children, ...rest }: Props) {
  return (
    <Chip tone={tone} size="md" {...rest}>
      {children}
    </Chip>
  );
}
