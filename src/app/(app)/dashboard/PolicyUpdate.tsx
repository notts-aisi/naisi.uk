import Link from "next/link";
import type { PolicyUpdateLine } from "@/lib/legal/updateLine";
import homeStyles from "./home.module.css";

/**
 * "WE'VE UPDATED OUR PRIVACY POLICY", on every form of Home, under the
 * greeting, for 14 days from the current version's date: one quiet line and
 * the way to what changed. Which line, and whether there is one today, is
 * `policyUpdateLine`'s (`src/lib/legal/updateLine.ts`), worked out from the
 * date alone; the same line sits at the top of /privacy. Nothing records who
 * saw it, so it cannot be dismissed, and it goes by itself.
 *
 * Handed the line, never the clock. No client part.
 */
export default function PolicyUpdate({ line }: { line: PolicyUpdateLine | null }) {
  if (!line) return null;
  return (
    <p className={homeStyles.policyLine}>
      <span>{line.words}</span>
      <Link href={line.href} className={homeStyles.textLink}>
        {line.link}
      </Link>
    </p>
  );
}
