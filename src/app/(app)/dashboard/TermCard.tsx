import Link from "next/link";
import NetField from "@/components/ui/NetField";
import TermApplyLink from "@/features/term/TermApplyLink";
import TermDates from "@/features/term/TermDates";
import { sharedStart, termCivilDay, termDay, termDeadline } from "@/features/term/termWords";
import type { PublicTerm } from "@/lib/applications/lifecycle/publicTerm";
import { ArrowRight, ChevronRight } from "./icons";
import styles from "./home.module.css";

/**
 * What the term is doing, for a member who is not on a programme.
 *
 * A Server Component: every date here comes from the term's own form, read
 * by `fetchPublicTerm()` in the page, and none is written in this file. The
 * Apply button is `TermApplyLink`, which draws nothing unless the form is
 * taking applications, so the card cannot offer a form that would refuse.
 *
 * Nothing is drawn while there is no term a visitor may be told about.
 */

/** "One form covers …", when the form really does cover more than one thing. */
function coverage(programmes: PublicTerm["programmes"]): string {
  const fellowships = programmes.filter((p) => p.kind === "fellowship").length;
  const incubators = programmes.filter((p) => p.kind === "incubator").length;
  if (fellowships === 2 && incubators === 1) {
    return "One form covers both fellowships and the research incubator.";
  }
  return programmes.length > 1 ? "One form covers every programme." : "";
}

function wording(term: PublicTerm): { title: string; lines: string[] } {
  const covers = coverage(term.programmes);
  switch (term.stage) {
    case "open":
      return {
        title: "Applications are open",
        lines: [
          [term.closesAt ? `Apply by ${termDeadline(term.closesAt)}.` : "", covers]
            .filter(Boolean)
            .join(" "),
        ],
      };
    case "before":
      return {
        title: "Applications open soon",
        lines: [
          [term.opensAt ? `You can apply from ${termDay(term.opensAt)}.` : "", covers]
            .filter(Boolean)
            .join(" "),
        ],
      };
    case "closed": {
      const day = term.decisionsByDate ? termCivilDay(term.decisionsByDate) : null;
      return {
        title: "Applications are closed",
        lines: [day ? `Decisions go out by ${day}.` : ""],
      };
    }
    case "running":
      return {
        title: "Programmes are running",
        lines: [
          term.next
            ? `Applications for ${term.next.label} open ${termDay(term.next.opensAt)}.`
            : "",
        ],
      };
    default:
      return { title: "", lines: [] };
  }
}

export default function TermCard({ term }: { term: PublicTerm }) {
  if (term.stage === "none") return null;
  const { title, lines } = wording(term);
  const said = lines.filter(Boolean);
  const hasFellowship = term.programmes.some((p) => p.kind === "fellowship");
  const hasIncubator = term.programmes.some((p) => p.kind === "incubator");

  return (
    <section className={styles.term} aria-label="Applications">
      <div className={styles.termBody}>
        {term.label && <p className={`meta ${styles.termEyebrow}`}>{term.label}</p>}
        <h2 className={styles.termTitle}>{title}</h2>
        {said.map((line) => (
          <p key={line} className={styles.termLine}>
            {line}
          </p>
        ))}
        <TermDates
          stage={term.stage}
          showOpening={term.stage === "before"}
          opensAt={term.opensAt}
          closesAt={term.closesAt}
          decisionsByDate={term.decisionsByDate}
          starts={sharedStart(term.programmes)}
          className={styles.termDates}
        />
        <div className={styles.termLinks}>
          <TermApplyLink stage={term.stage} applyPath={term.applyPath} className={styles.primary}>
            Apply
            <ArrowRight size={18} />
          </TermApplyLink>
          {hasFellowship && (
            <Link href="/courses" className={styles.textLink}>
              Fellowships
              <ChevronRight />
            </Link>
          )}
          {hasIncubator && (
            <Link href="/incubator" className={styles.textLink}>
              Research incubator
              <ChevronRight />
            </Link>
          )}
        </div>
      </div>
      <NetField net="card" strength="strong" className={styles.termNet} />
    </section>
  );
}
