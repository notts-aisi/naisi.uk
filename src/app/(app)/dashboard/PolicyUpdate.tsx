"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { PolicyUpdateLine } from "@/lib/legal/updateLine";
import {
  dismissUpdateLine,
  dismissedUpdateLineVersion,
  subscribeUpdateLineDismissal,
} from "@/lib/legal/updateLineDismissal";
import homeStyles from "./home.module.css";

/**
 * "WE'VE UPDATED OUR PRIVACY POLICY", on every form of Home, under the
 * greeting: one quiet line, the way to what changed, and Dismiss. Which
 * version the line is about, and whether there is one today, is
 * `policyUpdateLine`'s (`src/lib/legal/updateLine.ts`), worked out on the
 * server from the date alone. What changed is said in the policy, never
 * here.
 *
 * DISMISSED ONCE. Dismiss keeps the line's version in the person's own
 * browser (`src/lib/legal/updateLineDismissal.ts`), and the line is left out
 * from then on, in every tab, until a later version has a line of its own.
 * Somebody who never dismisses it stops seeing it when its days end.
 *
 * NOTHING UNTIL THE BROWSER HAS BEEN ASKED. The server cannot know what a
 * browser keeps, so the server's markup and the hydrating render carry no
 * line (`NOT_ASKED`); it is drawn once the page is live, and at once on a
 * move to Home from another page. Somebody who dismissed it is never shown
 * it for a moment first.
 *
 * Handed the line, never the clock.
 */

/** The server's answer, and the hydrating render's: what this browser dismissed is not known yet. */
const NOT_ASKED = null;

export default function PolicyUpdate({ line }: { line: PolicyUpdateLine | null }) {
  const dismissed = useSyncExternalStore<number | null>(
    subscribeUpdateLineDismissal,
    dismissedUpdateLineVersion,
    () => NOT_ASKED,
  );
  if (!line || dismissed === NOT_ASKED || dismissed >= line.version) return null;
  return (
    <p className={homeStyles.policyLine}>
      <span>{line.words}</span>
      <Link href={line.href} className={homeStyles.textLink}>
        {line.link}
      </Link>
      <button type="button" className={homeStyles.policyDismiss} onClick={() => dismissUpdateLine(line.version)}>
        Dismiss<span className={homeStyles.srOnly}> the note that our privacy policy changed</span>
      </button>
    </p>
  );
}
