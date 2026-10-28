"use client";

import { useEffect, useState } from "react";
import type { PlacementView } from "@/lib/applications/intake/placement";
import PlacementBox from "./PlacementBox";
import styles from "./PlacementBox.module.css";

/**
 * The Placement box beside one application, for an admin: the same box, and
 * the same answer, whichever programme the application is opened from
 * (`src/lib/applications/intake/placement.ts`). Read when the screen opens;
 * keyed by the applicant on the screen, so the next application never shows
 * the last one's.
 */
export default function PlacementPanel({ apiBase, applicantUid }: { apiBase: string; applicantUid: string }) {
  const [view, setView] = useState<PlacementView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/applications/${encodeURIComponent(applicantUid)}/placement`);
        const data = (await response.json().catch(() => ({}))) as { placement?: PlacementView; error?: string };
        if (!live) return;
        if (!response.ok || !data.placement) {
          // Not in the term (or decision day has gone out): nothing to place.
          setProblem(response.status === 409 || response.status === 404 ? null : (data.error ?? "This couldn’t be loaded."));
          return;
        }
        setView(data.placement);
      } catch {
        if (live) setProblem("The placement couldn’t be loaded. Check your connection.");
      }
    })();
    return () => {
      live = false;
    };
  }, [apiBase, applicantUid]);

  if (problem) return <p className={styles.error}>{problem}</p>;
  if (!view) return null;
  return <PlacementBox apiBase={apiBase} view={view} />;
}
