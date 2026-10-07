import type { ReactNode } from "react";
import { spaceMono } from "./fonts";
import styles from "./kit.module.css";

/**
 * The wrapper every application screen renders inside: the applicant's form
 * and the committee's screens alike. It loads the metadata font for the
 * routes that use it and scopes the few colours these screens add (see
 * `kit.module.css`), so two screens built separately share one look.
 */
export default function ApplicationsRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const classes = [spaceMono.variable, styles.root, className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
