"use client";

import ErrorPanel from "@/components/ErrorPanel";
import { PUBLIC_WAYS_ON } from "@/components/ErrorPanel.ways";

/**
 * Error boundary for the public marketing site.
 *
 * Catches a throw inside this segment without taking down the shell around
 * it, so the header and nav stay usable and the user is not stranded.
 * src/app/global-error.tsx only fires when the root layout itself fails,
 * which is the rarer and much worse case.
 *
 * Drawn like the public not-found screen, with the same ways on beside it:
 * "Try again" first, and somewhere else to go if that does not work.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      field
      title="Something went wrong"
      description="This page hit an error. Trying again usually works, and the rest of the site is unaffected."
      reset={reset}
      digest={error.digest}
      ways={PUBLIC_WAYS_ON}
    />
  );
}
