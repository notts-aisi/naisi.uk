import Link from "next/link";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { PROGRAMMES_PATH } from "@/lib/applications/programmes/path";

/**
 * "Programmes · Autumn 2026": where a page under a term sits. Programmes is
 * the page of every programme the reader may open, and the term's name is the
 * term's own page, each a link of its own. Drawn inside the page's own
 * breadcrumb `<nav>`, so each page keeps its own spacing.
 */
export default function TermCrumb({
  roundId,
  termLabel,
  className,
}: {
  roundId: string;
  termLabel: string;
  /** The page's own class for a crumb's link, where it has one. */
  className?: string;
}) {
  return (
    <>
      <Link href={PROGRAMMES_PATH} className={className}>
        Programmes
      </Link>
      <span aria-hidden="true">·</span>
      <Link href={applicationFormPath(roundId)} className={className}>
        {termLabel}
      </Link>
    </>
  );
}
