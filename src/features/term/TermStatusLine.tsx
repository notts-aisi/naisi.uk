import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import { statusLineParts } from "./termWords";
import styles from "./TermStatusLine.module.css";

/**
 * The one line under a hero's buttons that says where the term is:
 * "APPLICATIONS OPEN NOW · CLOSE SUN 18 OCT, 23:59". Nothing at all when
 * there is no term.
 *
 * A Server Component: the dates are formatted here, in London's time, and
 * reach the browser as text. It is handed the fields it prints and nothing
 * else. `className` is for the page: where the line sits, and anything the
 * ground behind it asks for.
 */
type Props = {
  stage: PublicTermStage;
  opensAt: Date | null;
  closesAt: Date | null;
  /** The day everybody hears, as stored: "2026-10-23". */
  decisionsByDate: string | null;
  /** The form that opens after this one, when there is one: its label and its opening. */
  nextLabel?: string | null;
  nextOpensAt?: Date | null;
  className?: string;
};

/** A space that does not break, so the line only ever breaks at the dot between two parts. */
const TIED = " ";

export default function TermStatusLine({
  stage,
  opensAt,
  closesAt,
  decisionsByDate,
  nextLabel = null,
  nextOpensAt = null,
  className,
}: Props) {
  const parts = statusLineParts({ stage, opensAt, closesAt, decisionsByDate, nextLabel, nextOpensAt });
  if (parts.length === 0) return null;
  return (
    <p className={className ? `${styles.line} ${className}` : styles.line}>
      {parts.map((part) => part.replace(/ /g, TIED)).join(" · ")}
    </p>
  );
}
