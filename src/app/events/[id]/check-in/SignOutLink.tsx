"use client";

import { useState } from "react";
import { signOut } from "@/auth/signInWithGoogle";
import { useHydrated } from "@/hooks/useHydrated";
import { hardNavigate } from "@/lib/navigation/hardNavigate";
import styles from "./checkIn.module.css";

/** "Not you? Sign out": signs out and opens this page again, signed out. */
export function SignOutLink({ returnTo }: { returnTo: string }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={styles.signOut}
      disabled={!hydrated || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signOut();
        } catch {
          // The page opens again either way; signed in, it says who you are.
        }
        hardNavigate(returnTo, "replace");
      }}
    >
      Not you? Sign out <span aria-hidden="true">→</span>
    </button>
  );
}
