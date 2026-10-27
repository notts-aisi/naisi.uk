"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { KAIROS_SETTING_WORDS } from "@/lib/kairos/words";
import styles from "./KairosSetting.module.css";

/**
 * THE KAIROS CHOICE ON A PERSON'S PROFILE: where it stands, what saying no
 * does and does not change, and one button that changes it and changes back.
 * The same choice every programme survey's form ends with, on the same
 * record. Nothing is sent until the button is pressed, and the button waits
 * for the page's script.
 *
 * `shared` is the person's record as the server read it for them alone.
 */
export default function KairosSetting({ shared }: { shared: boolean }) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(shared);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");

  async function change() {
    if (state !== "idle") return;
    const next = !now;
    setState("busy");
    setError("");
    try {
      const response = await fetch("/api/account/kairos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: next }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? KAIROS_SETTING_WORDS.failed);
      } else {
        setNow(next);
        setSaid(next ? KAIROS_SETTING_WORDS.started : KAIROS_SETTING_WORDS.stopped);
      }
    } catch {
      setError(KAIROS_SETTING_WORDS.failed);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className={styles.setting}>
      <p className={styles.line}>{now ? KAIROS_SETTING_WORDS.shared : KAIROS_SETTING_WORDS.notShared}</p>
      <p className={styles.note}>{KAIROS_SETTING_WORDS.note}</p>
      {said && !error && (
        <p className={styles.done} role="status">
          {said}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={styles.button} onClick={change} disabled={!hydrated || state === "busy"}>
        {now ? KAIROS_SETTING_WORDS.stop : KAIROS_SETTING_WORDS.start}
      </button>
    </div>
  );
}
