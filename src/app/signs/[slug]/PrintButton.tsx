"use client";

import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";

/** Opens the browser's print dialog. Disabled until the page's script has arrived. */
export function PrintButton() {
  const hydrated = useHydrated();
  return (
    <Button disabled={!hydrated} onClick={() => window.print()}>
      Print
    </Button>
  );
}
