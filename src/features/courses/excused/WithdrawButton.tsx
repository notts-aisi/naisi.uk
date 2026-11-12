"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import * as O from "@/lib/courses/excused/ownWords";
import { withdrawExcused } from "./api";
import styles from "./Excuse.module.css";

/**
 * "WITHDRAW THE REQUEST" for one week of the person's own request, while it
 * waits (`POST .../excused/withdraw`, the asker's alone). Emails nobody. Once
 * it saves, the page reloads its own data and the card says it was
 * withdrawn; a refusal is the route's own sentence.
 */
export default function WithdrawButton({
  requestId,
  sessionKey,
  locked = false,
  note = true,
}: {
  requestId: string;
  sessionKey: string;
  locked?: boolean;
  /** Say under it that it can be withdrawn until it is decided. */
  note?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<{ text: string; problem: boolean } | null>(null);

  async function press() {
    setBusy(true);
    setLine(null);
    const answer = await withdrawExcused(requestId, sessionKey);
    setBusy(false);
    if (!answer.ok) {
      setLine({ text: answer.error ?? O.DIDNT_SEND, problem: true });
      return;
    }
    setLine({ text: O.WITHDRAWN, problem: false });
    router.refresh();
  }

  return (
    <div className={styles.withdraw}>
      <button
        type="button"
        className={styles.secondary}
        onClick={() => void press()}
        disabled={!hydrated || locked || busy}
        data-testid="excuse-withdraw"
      >
        {busy ? O.WITHDRAWING : O.WITHDRAW_THE_REQUEST}
      </button>
      {note && <p className={styles.small}>{O.CAN_WITHDRAW}</p>}
      <p className={line?.problem ? styles.problem : styles.small} role="status">
        {line?.text ?? ""}
      </p>
    </div>
  );
}
