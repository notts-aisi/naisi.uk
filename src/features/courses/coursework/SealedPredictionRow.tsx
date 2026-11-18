"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { AdminPredictionsCard } from "@/lib/courses/predictions/wire";
import { OPEN_CARD, openCardLabel } from "@/lib/courses/predictions/words";
import { OpenedCard } from "../SealedPredictionsPanel";
import styles from "./reading.module.css";

/**
 * THE SEALED PREDICTION'S ROW ON ONE PERSON'S WEEK, for an admin alone (the
 * reading view hands it only to an admin, never on their own week). It opens
 * the card the one way a card is opened by anybody but its owner: the
 * existing route (`POST /api/courses/runs/[runId]/predictions/people/[uid]`),
 * which records the opening first, keeps the card closed when it cannot,
 * refuses a view-as session and an admin's own card, and says why in its own
 * words. Nothing is read until the press.
 */
export default function SealedPredictionRow({ runId, uid, name }: { runId: string; uid: string; name: string }) {
  const hydrated = useHydrated();
  const [opened, setOpened] = useState<AdminPredictionsCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/predictions/people/${encodeURIComponent(uid)}`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { card?: AdminPredictionsCard; error?: string } | null;
      if (!res.ok || !body?.card) throw new Error(body?.error ?? "Couldn’t open that card. Try again.");
      setOpened(body.card);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t open that card. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!opened && (
        <button type="button" className={styles.buttonGhost} onClick={() => void open()} disabled={!hydrated || busy} aria-label={openCardLabel(name)}>
          {OPEN_CARD}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {opened && <OpenedCard card={opened} onClose={() => setOpened(null)} />}
    </>
  );
}
