import type { ReactNode } from "react";
import Link from "next/link";
import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import styles from "./TermApplyLink.module.css";

/**
 * A link to the application form, while the form is taking applications,
 * and nothing at all otherwise.
 *
 * It knows the stage so that no page has to: a page writes the link once and
 * it is there exactly while pressing it leads to a form somebody can fill
 * in. `applyPath` is handed over by the term only while the stage is `open`,
 * and both are asked here, so a path kept from an earlier read is not
 * enough on its own.
 *
 * An ordinary link. The page gives it its look through `className`; all this
 * adds is a target tall enough for a thumb. With no children it says "Apply".
 */
type Props = {
  stage: PublicTermStage;
  applyPath: string | null;
  className?: string;
  children?: ReactNode;
};

export default function TermApplyLink({ stage, applyPath, className, children }: Props) {
  if (stage !== "open" || !applyPath) return null;
  return (
    <Link href={applyPath} className={className ? `${styles.link} ${className}` : styles.link}>
      {children ?? "Apply"}
    </Link>
  );
}
