"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import OptionRow from "@/components/ui/OptionRow";
import {
  ALREADY_EXCUSED,
  CANCEL,
  DIDNT_SAVE,
  SAVE,
  SAVING,
  SOME_WEEKS,
  SOME_WEEKS_DIDNT_LOAD,
  SOME_WEEKS_INTRO,
  SOME_WEEKS_LOADING,
  SOME_WEEKS_NONE,
  sessionOptionWords,
} from "@/lib/courses/timeAnswer/words";
import styles from "./SomeWeeks.module.css";

/** One session as `GET /api/courses/runs/[runId]/enrolments/[uid]/time-answer` lists it. */
type Offered = { sessionKey: string; weekNumber: number; day: string; excused: boolean };

type Step = { at: "closed" } | { at: "loading" } | { at: "choosing"; sessions: Offered[] };

/**
 * "THEY MEANT SOME WEEKS", under an answer of "No, I need a different time"
 * where staff read it (the allocation board's card, and the person in
 * Circles), for an admin or the programme's lead: the only people that
 * answer is ever sent to, and the bar the route asks again.
 *
 * Pressed, it reads the person's group's sessions still to come, and offers
 * each to tick; a session they already told us about themselves is ticked
 * and cannot be unticked here (nothing they said is taken back). Saving
 * makes their answer "Most weeks, not all", keeps their words, records each
 * session chosen as excused on its register, and writes an audit row; nobody
 * is emailed. `onSaved` reads the screen again, where the card then says
 * "Misses week 3".
 */
export default function SomeWeeks({
  runId,
  uid,
  disabled = false,
  onSaved,
}: {
  runId: string;
  uid: string;
  disabled?: boolean;
  onSaved: (message: string) => void;
}) {
  const groupId = useId();
  const [step, setStep] = useState<Step>({ at: "closed" });
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/courses/runs/${encodeURIComponent(runId)}/enrolments/${encodeURIComponent(uid)}/time-answer`;

  async function open() {
    setStep({ at: "loading" });
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sessions?: Offered[] };
      if (!res.ok || !Array.isArray(body.sessions)) {
        setError(body.error ?? SOME_WEEKS_DIDNT_LOAD);
        setStep({ at: "closed" });
        return;
      }
      setChosen(body.sessions.filter((each) => each.excused).map((each) => each.sessionKey));
      setStep({ at: "choosing", sessions: body.sessions });
    } catch {
      setError(SOME_WEEKS_DIDNT_LOAD);
      setStep({ at: "closed" });
    }
  }

  async function save(sessions: Offered[]) {
    setBusy(true);
    setError(null);
    try {
      const sessionKeys = sessions.map((each) => each.sessionKey).filter((key) => chosen.includes(key));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKeys }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; ok?: true; message?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? DIDNT_SAVE);
        return;
      }
      setStep({ at: "closed" });
      onSaved(body.message ?? "");
    } catch {
      setError(DIDNT_SAVE);
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error ? (
    <p className={styles.error} role="alert">
      {error}
    </p>
  ) : null;

  if (step.at !== "choosing") {
    return (
      <div className={styles.root}>
        <Button type="button" variant="secondary" disabled={disabled || step.at === "loading"} onClick={() => void open()}>
          {step.at === "loading" ? SOME_WEEKS_LOADING : SOME_WEEKS}
        </Button>
        {errorLine}
      </div>
    );
  }

  const { sessions } = step;
  return (
    <form
      className={styles.root}
      onSubmit={(event) => {
        event.preventDefault();
        void save(sessions);
      }}
    >
      <p id={groupId} className={styles.line}>
        {sessions.length > 0 ? SOME_WEEKS_INTRO : SOME_WEEKS_NONE}
      </p>
      {sessions.length > 0 && (
        <div className={styles.sessions} role="group" aria-labelledby={groupId}>
          {sessions.map((each) => (
            <OptionRow
              key={each.sessionKey}
              plain
              name="sessionKeys"
              value={each.sessionKey}
              checked={chosen.includes(each.sessionKey)}
              // What they told us themselves stays: it is theirs to take back.
              disabled={busy || disabled || each.excused}
              description={each.excused ? ALREADY_EXCUSED : undefined}
              onChange={(event) => {
                const on = event.target.checked;
                setChosen((was) => (on ? [...was, each.sessionKey] : was.filter((key) => key !== each.sessionKey)));
              }}
            >
              {sessionOptionWords(each.weekNumber, each.day)}
            </OptionRow>
          ))}
        </div>
      )}
      {errorLine}
      <div className={styles.actions}>
        <Button type="submit" disabled={busy || disabled}>
          {busy ? SAVING : SAVE}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setStep({ at: "closed" });
            setError(null);
          }}
        >
          {CANCEL}
        </Button>
      </div>
    </form>
  );
}
