"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { lineWords } from "@/lib/courses/registerCorrection/words";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { askForCorrection, correctLine, requestAction } from "./api";
import styles from "./CorrectionSheets.module.css";

/**
 * ONE LINE OF A FINISHED REGISTER, opened from its cell.
 *
 *  - `ask`: a facilitator of the group. With nothing waiting, "Ask for a
 *    correction": what the register says, what it should say (every line but
 *    the one it says), why, and where it goes. With an ask of theirs waiting,
 *    what was asked and when, and "Withdraw the correction". A decided ask
 *    says what became of it.
 *  - `correct`: an admin or somebody leading the programme. Who set the line
 *    and when, what it should say, why, "Save the correction"; nobody is
 *    emailed. An ask waiting on the line is said, with a way to it where the
 *    page has one.
 *  - `read`: anybody else the register shows the line to: its story only.
 *
 * A corrected line's story (what it said, who set that, who corrected it,
 * when, who asked, and why where the reader is sent the reason) heads every
 * mode. The server decides what is sent; this draws what it was given.
 */

export type LineSheetTarget = {
  person: { uid: string; name: string };
  session: { weekNumber: number; occurrence: number; dateKey: string };
  line: { status: AttendanceStatus | null; online: boolean };
  setBy: { name: string; at: string; how?: string; yours?: boolean } | null;
  story: P.StoryView | null;
  request: P.RequestView | null;
};

export default function LineSheet({
  open,
  onClose,
  groupId,
  mode,
  target,
  requestHref = null,
  sessionLabelOf,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  mode: "ask" | "correct" | "read";
  target: LineSheetTarget | null;
  /** Where one request's page is, for the people who decide it; null where the page has no way there. */
  requestHref?: ((requestId: string) => string) | null;
  /** "Week 1" for a session key, for a moved line's story. */
  sessionLabelOf?: (sessionKey: string) => string;
  /** A press went through: the sentence to show, and the register reads again. */
  onDone: (said: string) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  if (!target) return null;
  const { person, session, line, setBy, story, request } = target;
  const says = line.status ? lineWords(line.status, line.online) : "Not set";
  const choices = P.choicesOtherThan(line.status, line.online);
  const chosen = P.choiceOf(choice);
  const waiting = request?.state === "waiting" ? request : null;
  const asking = mode === "ask" && !waiting;
  const correcting = mode === "correct";
  const ready = Boolean(chosen) && reason.trim().length > 0 && !busy;

  // A press that went through closes the sheet through history (`close`, the
  // Modal's dismiss), so it leaves no entry behind for Back to stop on.
  async function press(close: () => void) {
    if (!chosen || !target) return;
    setBusy(true);
    setProblem(null);
    const input = {
      weekNumber: session.weekNumber,
      occurrence: session.occurrence,
      uid: person.uid,
      to: chosen,
      reason: reason.trim(),
    };
    const answer = correcting ? await correctLine(groupId, input) : await askForCorrection(groupId, input);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error);
      return;
    }
    close();
    onDone(
      correcting
        ? `Corrected: ${person.name}, ${says} to ${chosen.words}. Nobody was emailed.`
        : `Asked for ${chosen.words}. It’s waiting for an admin or the programme’s lead.`,
    );
  }

  async function withdraw(close: () => void) {
    if (!waiting) return;
    setBusy(true);
    setProblem(null);
    const answer = await requestAction(waiting.id, "withdraw");
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error);
      return;
    }
    close();
    onDone("Withdrawn. The line says what it said.");
  }

  const title = asking ? P.ASK_TITLE : correcting ? P.CORRECT_TITLE : P.LINE_TITLE;
  const chip = P.setByChip(setBy);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={title} sheet>
      {(dismiss) => (
        <div className={styles.sheet} data-testid="line-sheet">
          <div className={styles.head}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.button} onClick={dismiss}>
              {P.CLOSE}
            </button>
          </div>
          <div>
            <p className={styles.lede}>
              {P.lineHead(person.name, session.weekNumber, session.occurrence, session.dateKey)}. The register says <strong>{says}</strong>.
            </p>
            {chip && correcting && <span className={styles.chip}>{chip}</span>}
          </div>

          {story && (
            <p className={styles.note} data-testid="line-story">
              {P.storyWords(story, sessionLabelOf)}
            </p>
          )}

          {request && (
            <div className={`${styles.note} ${waiting ? styles.noteWaiting : ""}`} data-testid="line-request">
              <p className={styles.lede}>{P.requestLine(request, now)}</p>
              {waiting && correcting && request.reason && <p className={styles.footLine}>Why: {P.quoted(request.reason)}</p>}
              {waiting && correcting && requestHref && (
                <Link href={requestHref(request.id)} className={styles.link}>
                  Open the request
                </Link>
              )}
            </div>
          )}

          {waiting && mode === "ask" && waiting.yours && (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => void withdraw(dismiss)} disabled={busy}>
                {busy ? P.SAVING : P.WITHDRAW}
              </Button>
            </div>
          )}

          {(asking || correcting) && (
            <>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>{P.WHAT_IT_SHOULD_SAY}</legend>
                <div className={styles.choices}>
                  {choices.map((each) => (
                    <label key={each.key} className={`${styles.choice} ${choice === each.key ? styles.choiceOn : ""}`}>
                      <input
                        type="radio"
                        name="line-choice"
                        className={styles.radio}
                        value={each.key}
                        checked={choice === each.key}
                        onChange={() => setChoice(each.key)}
                        disabled={busy}
                      />
                      <span>{each.words}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className={styles.fieldset}>
                <span className={styles.label}>{P.WHY_NEEDED}</span>
                <textarea
                  className={styles.textarea}
                  value={reason}
                  maxLength={P.REASON_MAX}
                  rows={3}
                  onChange={(event) => setReason(P.oneLine(event.target.value))}
                  disabled={busy}
                />
                <span className={styles.count} aria-hidden="true">
                  {P.REASON_MAX - reason.length} left
                </span>
              </label>
              {problem && (
                <p className={styles.error} role="status">
                  {problem}
                </p>
              )}
              <div className={styles.actions}>
                <Button onClick={() => void press(dismiss)} disabled={!ready} data-testid="line-sheet-submit">
                  {busy ? (correcting ? P.SAVING : P.SENDING) : correcting ? P.SAVE_THE_CORRECTION : P.SEND_THE_REQUEST}
                </Button>
                {correcting && (
                  <Button variant="secondary" onClick={dismiss} disabled={busy}>
                    {P.CANCEL}
                  </Button>
                )}
              </div>
              <p className={styles.footLine}>{correcting ? P.correctGoesWords(person.name) : P.askGoesWords(person.name)}</p>
            </>
          )}

          {!asking && !correcting && problem && (
            <p className={styles.error} role="status">
              {problem}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
