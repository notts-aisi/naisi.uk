import type { ReactNode } from "react";
import styles from "./decisionDay.module.css";

/**
 * The few line icons the pooled applicants and decision-day screens use.
 * Each marks something a control does (a chevron, a tick, an envelope); none
 * is decoration, and every one is hidden from a screen reader because the
 * words beside it already say it.
 */

export type IconName =
  | "info"
  | "check"
  | "chevron-right"
  | "mail"
  | "pencil"
  | "warning"
  | "send";

const PATHS: Record<IconName, ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  pencil: <path d="M5 19h4L19 9l-4-4L5 15z" />,
  warning: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  send: <path d="M4 12l16-7-7 16-2-7z" />,
};

type Props = {
  name: IconName;
  /** Drawn size in px. */
  size?: number;
  /** Line weight. The ticks that confirm something are drawn heavier. */
  weight?: number;
  className?: string;
};

export default function Icon({ name, size = 18, weight = 1.8, className }: Props) {
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
