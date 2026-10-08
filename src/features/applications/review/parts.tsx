import type { ReactNode } from "react";
import type { ProgrammeStanding } from "@/lib/applications/words";
import { PROGRAMME_STANDING_LABEL } from "@/lib/applications/words";
import styles from "./parts.module.css";

/**
 * The small pieces both review screens are built from: an initials disc, a
 * chip, a keyboard key and the handful of line icons the screens use.
 *
 * No hooks and no browser API, so a Server Component can render any of them.
 */

/** Must match the number of `.tone*` classes in parts.module.css. */
const TONES = 6;

/** A stable colour per person, so somebody keeps one disc on every screen. */
function toneOf(uid: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < uid.length; i += 1) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % TONES;
}

/** First letter of the first and last word of a name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Initials in a coloured disc. Decorative: it is hidden from assistive
 * technology, so every place that renders one also writes the person's name.
 */
export function Avatar({
  name,
  uid,
  size = "md",
}: {
  name: string;
  uid: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  return (
    <span
      className={`${styles.avatar} ${styles[`avatar_${size}`]} ${styles[`tone${toneOf(uid)}`]}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

export type ChipTone = "neutral" | "accent" | "ok" | "bad";

export function Chip({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: ChipTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.chip} ${styles[`chip_${tone}`]}`}>
      {dot ? <span className={styles.chipDot} aria-hidden="true" /> : null}
      {/* One box for the words, so the gap is only ever between the dot and them. */}
      <span>{children}</span>
    </span>
  );
}

const STANDING_TONE: Record<ProgrammeStanding, ChipTone> = {
  "to-review": "accent",
  accepted: "ok",
  pooled: "neutral",
  declined: "bad",
};

/** Where an application stands with a programme, as a chip with its word. */
export function StandingChip({ standing }: { standing: ProgrammeStanding }) {
  return (
    <Chip tone={STANDING_TONE[standing]} dot>
      {PROGRAMME_STANDING_LABEL[standing]}
    </Chip>
  );
}

/** A section score in its small box: "4.5". */
export function ScoreBox({ children }: { children: ReactNode }) {
  return <span className={styles.scoreBox}>{children}</span>;
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className={styles.key}>{children}</kbd>;
}

type IconName =
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "arrow-right"
  | "mail"
  | "info"
  | "search"
  | "eye-off"
  | "dots"
  | "check";

const ICON_PATHS: Record<IconName, ReactNode> = {
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-left": <path d="M15 6l-6 6 6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1-.9 2.3-2 3.6M6.3 6.6C4.2 8 3.2 10 3 12c.5 2.5 4 7 9 7 1.6 0 3-.4 4.2-1" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

/** A line icon. Always decorative: the control it sits in carries the words. */
export function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
