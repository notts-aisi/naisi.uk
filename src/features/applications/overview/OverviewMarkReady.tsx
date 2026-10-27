"use client";

import { useRouter } from "next/navigation";
import MarkReady from "@/features/courses/MarkReady";
import styles from "./ProgrammeOverview.module.css";

/**
 * The Overview's "Mark ready" and "Not ready" (board pr-weeks, Q35): the one
 * control, in the Overview's own buttons, which reads the page again from
 * the server once the route has answered, so the line and the card say what
 * is stored.
 */
export default function OverviewMarkReady({ runId, weekId, ready }: { runId: string; weekId: string; ready: boolean }) {
  const router = useRouter();
  return (
    <MarkReady
      runId={runId}
      weekId={weekId}
      ready={ready}
      onDone={() => router.refresh()}
      classes={{ control: styles.markReady, button: styles.remindButton, problem: styles.problem }}
    />
  );
}
