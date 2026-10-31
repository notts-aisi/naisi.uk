"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./CheckInTab.module.css";

type Props = {
  eventId: string;
  /** Inside the door's hours. Before them the button is drawn, held, with the time it can be pressed beside it. */
  enabled: boolean;
};

/**
 * "Open the door", on the event's Check-in tab, for its author and admins.
 * One press, one small request; the page is then drawn again on the server,
 * so the card says who opened it and when, as it does for everybody else.
 * Held until the page's script has arrived, so a press is never lost.
 */
export default function OpenDoorButton({ eventId, enabled }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/door`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn’t work. Try again.");
      router.refresh();
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? "There’s no connection. Try again."
          : err instanceof Error
            ? err.message
            : "That didn’t work. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className={styles.doorAction}>
      <Button variant="secondary" disabled={!enabled || !hydrated || busy} onClick={() => void open()}>
        {busy ? "Opening the door…" : "Open the door"}
      </Button>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
