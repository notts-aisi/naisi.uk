"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { DialogFacts } from "@/lib/courses/sessionChange/view";
import {
  CHANGING,
  CLOSE,
  DAY_LABEL,
  KEEP_IT,
  KEEP_PACE_LABEL,
  MOVE_HINT,
  MOVE_LABEL,
  NOBODY_TOLD,
  ONLINE_LABEL,
  PUSH_LABEL,
  REASON_LABEL,
  REFUSAL,
  RESTORE_LABEL,
  ROOM_LABEL,
  TELL_AGAIN,
  TELL_LABEL,
  TIME_LABEL,
  TOO_MANY_TO_TELL,
  UNKNOWN_OUTCOME,
  WHAT_HAPPENS,
  changedWords,
  currentlyWords,
  emailsLine,
  notToldWords,
  parseClock,
  pressWords,
  type ChangeKind,
} from "@/lib/courses/sessionChange/words";
import { postedWords } from "@/lib/courses/updates/words";
import styles from "./SessionsBoard.module.css";

/**
 * "Change Group B’s week 4 session" (wk-session): what happens to the
 * session, the reason the group sees, "Tell the group", and the button that
 * names the session and how many people it emails.
 *
 * TWO PRESSES, ONE BUTTON. The change route changes the session and answers
 * with the update's words; with "Tell the group" on, this then posts that
 * update to the group through the updates route, the one lane an update and
 * its email go through. The count on the button is checked by the change
 * route before anything changes, and again by the updates route: when it no
 * longer holds, the button shows the new number. If the session changed and
 * the update did not go, the dialog says so and offers to tell the group
 * again, rather than pretending either way.
 *
 * Every value it draws is the server's, from records (`DialogFacts`). It is
 * opened by a press, so it is never drawn before the page hydrates; its
 * buttons are disabled until then all the same.
 */

type Note = { tone: "problem"; text: string };
type PendingUpdate = { groupId: string; title: string; message: string; emailCount: number };

export default function ChangeSessionDialog({
  facts,
  onClose,
  onDone,
}: {
  facts: DialogFacts;
  onClose: () => void;
  /** The change went through: what to say about it, and the dialog closes. */
  onDone: (said: string) => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ids = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [kind, setKind] = useState<ChangeKind | null>(null);
  const [day, setDay] = useState(
    facts.move.days.some((each) => each.dateKey === facts.move.dayKey) ? facts.move.dayKey : (facts.move.days[0]?.dateKey ?? ""),
  );
  const [time, setTime] = useState(facts.move.time);
  const [room, setRoom] = useState(facts.move.room);
  const [reason, setReason] = useState("");
  const canTell = facts.tell.people > 0 && !facts.tell.refused;
  const [tell, setTell] = useState(canTell);
  const [emails, setEmails] = useState(facts.tell.emails);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [pending, setPending] = useState<{ update: PendingUpdate; changed: string } | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [facts.groupId, facts.weekNumber]);

  const problem = (text: string) => setNote({ tone: "problem", text });
  const sendsEmail = tell && canTell && emails > 0;

  async function postUpdate(update: PendingUpdate, changed: string) {
    let response: Response;
    let body: Record<string, unknown> | null;
    try {
      response = await fetch(`/api/courses/runs/${encodeURIComponent(facts.runId)}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "group",
          groupId: update.groupId,
          title: update.title,
          message: update.message,
          email: update.emailCount > 0,
          ...(update.emailCount > 0 ? { emailCount: update.emailCount } : {}),
        }),
      });
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setPending({ update, changed });
      problem(`${changed} ${notToldWords("we couldn’t tell whether the update went through.")}`);
      return;
    }
    const sentence = typeof body?.error === "string" ? body.error : null;
    if (response.status === 409 && typeof body?.emails === "number") {
      const next = { ...update, emailCount: body.emails };
      setEmails(body.emails);
      setPending({ update: next, changed });
      problem(`${changed} ${notToldWords(sentence ?? "the number of people it emails has changed.")}`);
      return;
    }
    if (!response.ok || body?.ok !== true) {
      setPending({ update, changed });
      problem(`${changed} ${notToldWords(sentence ?? "the update didn’t go through.")}`);
      return;
    }
    const tally = body.email as { sent?: number; held?: number; suppressed?: number; failed?: number } | null;
    onDone(
      `${changed} ${postedWords(
        tally
          ? { sent: tally.sent ?? 0, held: tally.held ?? 0, suppressed: tally.suppressed ?? 0, failed: tally.failed ?? 0 }
          : null,
      )}`,
    );
  }

  async function press() {
    if (!kind) return;
    const said = reason.trim();
    if (!said) return problem(REFUSAL.reason);
    if (kind === "move" && !parseClock(time)) return problem(REFUSAL.time);
    setBusy(true);
    setNote(null);
    const emailCount = tell && canTell ? emails : 0;
    let response: Response;
    let body: Record<string, unknown> | null;
    try {
      response = await fetch(`/api/courses/groups/${encodeURIComponent(facts.groupId)}/session/change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: facts.weekNumber,
          dateKey: facts.dateKey,
          kind,
          ...(kind === "move" ? { move: { dateKey: day, time, room } } : {}),
          reason: said,
          tell: tell && canTell,
          ...(tell && canTell ? { emailCount } : {}),
        }),
      });
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setBusy(false);
      problem(UNKNOWN_OUTCOME);
      router.refresh();
      return;
    }
    const sentence = typeof body?.error === "string" ? body.error : null;
    if (response.status === 409 && typeof body?.emails === "number") {
      // The count on the button no longer holds: show the new one; nothing changed.
      setEmails(body.emails);
      setBusy(false);
      problem(sentence ?? UNKNOWN_OUTCOME);
      return;
    }
    if (!response.ok || body?.ok !== true) {
      setBusy(false);
      problem(sentence ?? UNKNOWN_OUTCOME);
      if (!sentence) router.refresh();
      return;
    }
    const change = body.change as { dateKey?: string } | undefined;
    const changed = changedWords(kind, String(change?.dateKey ?? facts.dateKey));
    const update = body.update as PendingUpdate | null;
    if (update) await postUpdate(update, changed);
    else onDone(`${changed} ${NOBODY_TOLD}`);
    setBusy(false);
  }

  async function tellAgain() {
    if (!pending) return;
    setBusy(true);
    setNote(null);
    await postUpdate(pending.update, pending.changed);
    setBusy(false);
  }

  const titleId = `${ids}-title`;
  const reasonId = `${ids}-reason`;
  const tellId = `${ids}-tell`;
  const name = `${ids}-kind`;
  const off = !hydrated || busy;
  const danger = kind === "cancel" || kind === "push";

  const option = (value: ChangeKind, label: string, hint: string, disabled = false, extra?: ReactNode) => (
    <div
      className={[styles.option, kind === value ? styles.optionChosen : "", disabled ? styles.optionDisabled : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label className={styles.optionLabel}>
        <input
          type="radio"
          name={name}
          value={value}
          className={styles.radio}
          checked={kind === value}
          disabled={off || disabled || pending !== null}
          onChange={() => {
            setKind(value);
            setNote(null);
          }}
        />
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.optionText}>
          <span className={styles.optionName}>{label}</span>
          {hint && <span className={styles.optionHint}>{hint}</span>}
        </span>
      </label>
      {extra}
    </div>
  );

  return (
    <section
      className={styles.dialog}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <div className={styles.dialogHead}>
        <div>
          <h2 id={titleId} className={styles.dialogTitle} ref={headingRef} tabIndex={-1}>
            {facts.title}
          </h2>
          <p className={styles.dialogSub}>{facts.subtitle}</p>
          {facts.current && <p className={styles.current}>{currentlyWords(facts.current)}</p>}
        </div>
        <button type="button" className={styles.close} aria-label={CLOSE} onClick={onClose} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <fieldset className={styles.options}>
        <legend className={styles.legend}>{WHAT_HAPPENS}</legend>
        {option("online", ONLINE_LABEL, facts.online.hint, !facts.online.available)}
        {option(
          "move",
          MOVE_LABEL,
          MOVE_HINT,
          facts.move.days.length === 0,
          <div className={styles.moveFields}>
            <div className={styles.moveDay}>
              <label className={styles.fieldLabel} htmlFor={`${ids}-day`}>
                {DAY_LABEL}
              </label>
              <Select
                id={`${ids}-day`}
                value={day}
                disabled={off || pending !== null}
                onChange={(event) => {
                  setDay(event.target.value);
                  setKind("move");
                }}
              >
                {facts.move.days.map((each) => (
                  <option key={each.dateKey} value={each.dateKey}>
                    {each.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className={styles.moveTime}>
              <label className={styles.fieldLabel} htmlFor={`${ids}-time`}>
                {TIME_LABEL}
              </label>
              <Input
                id={`${ids}-time`}
                type="text"
                autoComplete="off"
                value={time}
                disabled={off || pending !== null}
                onChange={(event) => {
                  setTime(event.target.value);
                  setKind("move");
                }}
              />
            </div>
            <div className={styles.moveRoom}>
              <label className={styles.fieldLabel} htmlFor={`${ids}-room`}>
                {ROOM_LABEL}
              </label>
              <Input
                id={`${ids}-room`}
                type="text"
                autoComplete="off"
                maxLength={200}
                value={room}
                disabled={off || pending !== null}
                onChange={(event) => {
                  setRoom(event.target.value);
                  setKind("move");
                }}
              />
            </div>
          </div>,
        )}
        {option("cancel", KEEP_PACE_LABEL, facts.keepPace.hint)}
        {option("push", PUSH_LABEL, facts.push.hint, !facts.push.available)}
        {facts.restore && option("restore", RESTORE_LABEL, facts.restore.hint)}
      </fieldset>

      <div className={styles.reason}>
        <label className={styles.fieldLabel} htmlFor={reasonId}>
          {REASON_LABEL}
        </label>
        <Input
          id={reasonId}
          type="text"
          autoComplete="off"
          maxLength={200}
          value={reason}
          disabled={off || pending !== null}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div className={styles.tellArea}>
        <label className={styles.tellRow} htmlFor={tellId}>
          <span className={styles.tellText}>
            {TELL_LABEL}
            <span className={styles.tellLine}>{facts.tell.refused ? TOO_MANY_TO_TELL : facts.tell.line}</span>
          </span>
          <input
            id={tellId}
            type="checkbox"
            role="switch"
            className={styles.switchInput}
            checked={tell && canTell}
            disabled={off || !canTell || pending !== null}
            onChange={(event) => setTell(event.target.checked)}
          />
          <span className={`${styles.track} ${tell && canTell ? styles.trackOn : ""}`} aria-hidden="true">
            <span className={styles.knob} />
          </span>
        </label>
      </div>

      <div className={styles.actions}>
        {pending ? (
          <Button type="button" variant="primary" disabled={off} onClick={() => void tellAgain()}>
            {busy ? CHANGING : TELL_AGAIN}
          </Button>
        ) : (
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            disabled={off || kind === null}
            onClick={() => void press()}
          >
            {busy ? CHANGING : pressWords(kind, facts.dateKey)}
          </Button>
        )}
        {sendsEmail && <p className={styles.emails}>{emailsLine(emails)}</p>}
        <span className={styles.keep}>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {KEEP_IT}
          </Button>
        </span>
      </div>

      {note && (
        <p className={styles.note} role="status">
          {note.text}
        </p>
      )}

      <p className={styles.who}>{facts.whoCan}</p>
    </section>
  );
}
