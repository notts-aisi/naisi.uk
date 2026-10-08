"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DialogFrame } from "@/features/applications/editor/controls";
import { CheckIcon } from "@/features/applications/editor/Icons";
import shared from "@/features/applications/editor/editor.module.css";
import kit from "@/features/applications/kit/kit.module.css";
import type { ActionView, LifecycleView, ReadinessView } from "@/lib/applications/lifecycle/view";
import { moveForm } from "./lifecycleClient";
import styles from "./TermState.module.css";

/**
 * Where the form is in its term, in a sentence, and what an admin can do
 * about it: open applications, close them early, reopen them, settle the
 * term.
 *
 * Everything shown here was decided on the server (`buildLifecycleView`): the
 * sentence, which actions are offered, whether each can be pressed and why
 * not, and the words of each confirmation. This component draws them and
 * sends the one request a confirmed action makes. The route decides again.
 *
 * Somebody who is not an admin is handed no actions and no list, so for them
 * this is the sentence alone.
 */
export function TermState({ roundId, lifecycle }: { roundId: string; lifecycle: LifecycleView }) {
  const { actions, readiness, pointer } = lifecycle;
  const quiet = actions.length === 0 && readiness === null;
  const waiting = actions.filter((action) => !action.enabled && action.reason);

  return (
    <section className={quiet ? styles.quiet : styles.state} aria-label="Where this term is">
      <div className={styles.top}>
        <p className={styles.line}>
          {lifecycle.line}
          {pointer && (
            <>
              {" "}
              {pointer.text} <Link href={pointer.href}>{pointer.label}</Link>
            </>
          )}
        </p>
        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action) => (
              <CarefulAction key={action.action} roundId={roundId} action={action} />
            ))}
          </div>
        )}
      </div>
      {/* A button that waits says why. When the list is drawn, the list says it. */}
      {readiness === null &&
        waiting.map((action) => (
          <p key={action.action} className={styles.reason}>
            {action.reason}
          </p>
        ))}
      {readiness && <ReadinessList readiness={readiness} reopening={actions.some((a) => a.action === "reopen")} />}
    </section>
  );
}

function ReadinessList({ readiness, reopening }: { readiness: ReadinessView; reopening: boolean }) {
  return (
    <div className={styles.list}>
      <div className={styles.listHead}>
        <h2 className={styles.listTitle}>{reopening ? "Before it can reopen" : "Before it can open"}</h2>
        <span className={kit.mono}>
          {readiness.ready ? "All in place" : `${readiness.left} of ${readiness.lines.length} left`}
        </span>
      </div>
      <ul className={styles.lines}>
        {readiness.lines.map((line) => (
          <li key={line.id} className={`${styles.item} ${line.ok ? styles.met : ""}`}>
            <span className={styles.mark} aria-hidden="true">
              {line.ok ? <CheckIcon size={16} weight={2.4} /> : <span className={styles.ring} />}
            </span>
            <div className={styles.itemBody}>
              <p className={styles.itemLabel}>
                <span className={shared.visuallyHidden}>{line.ok ? "Done: " : "To do: "}</span>
                {line.label}
              </p>
              {!line.ok && (
                <p className={styles.itemHint}>
                  {line.hint}
                  {line.link && (
                    <>
                      {" "}
                      <Link href={line.link.href}>{line.link.label}</Link>
                    </>
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One careful action: a button, and the confirmation it opens. */
function CarefulAction({ roundId, action }: { roundId: string; action: ActionView }) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Set once the move has landed with something still to say about it. */
  const [warning, setWarning] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setProblem(null);
    setWarning(null);
  };

  const confirm = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const moved = await moveForm(roundId, action.target);
      router.refresh();
      if (moved.recordWarning) setWarning(moved.recordWarning);
      else close();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  // Opening and settling are what the page is for at that moment; closing
  // early takes something away from applicants, so it is drawn as careful.
  const buttonClass =
    action.action === "close"
      ? `${shared.btn} ${shared.btnCareful}`
      : action.action === "reopen"
        ? shared.btn
        : kit.primary;

  return (
    <span className={styles.action}>
      <button
        type="button"
        className={buttonClass}
        disabled={!action.enabled}
        aria-describedby={action.reason ? reasonId : undefined}
        onClick={() => setOpen(true)}
      >
        {action.label}
      </button>
      {action.reason && action.action === "open" && (
        <span id={reasonId} className={styles.waits}>
          {action.reason}
        </span>
      )}
      {action.reason && action.action !== "open" && (
        <span id={reasonId} className={shared.visuallyHidden}>
          {action.reason}
        </span>
      )}
      {open && (
        <DialogFrame
          open
          width="sm"
          title={warning ? "Done, with one thing to know" : action.dialog.title}
          onClose={close}
          actions={
            warning ? (
              <button type="button" className={kit.primary} onClick={close}>
                Close
              </button>
            ) : (
              <>
                <button type="button" className={shared.btn} onClick={close} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={action.action === "close" ? `${shared.btn} ${shared.btnCareful}` : kit.primary}
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {busy ? action.dialog.busy : action.dialog.confirm}
                </button>
              </>
            )
          }
        >
          {warning ? (
            <p className={shared.dialogText}>{warning}</p>
          ) : (
            action.dialog.lines.map((line) => (
              <p key={line} className={shared.dialogText}>
                {line}
              </p>
            ))
          )}
          {problem && (
            <p role="alert" className={shared.problem}>
              {problem}
            </p>
          )}
        </DialogFrame>
      )}
    </span>
  );
}
