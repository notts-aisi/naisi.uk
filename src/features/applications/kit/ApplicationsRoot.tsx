import type { ReactNode } from "react";

/**
 * The wrapper every application screen renders inside: the applicant's form
 * and the committee's screens alike.
 *
 * It used to load the metadata font and scope the colours these screens
 * added. Both now belong to the whole site: the root layout loads the font
 * and `src/theme/tokens.css` carries the colours under the same names. What
 * is left is the element itself, which the screens hang their own root class
 * on.
 */
export default function ApplicationsRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
