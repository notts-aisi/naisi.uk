"use client";

import { useId, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import type { MovePageView, MovePreviewView } from "@/lib/courses/staffMove/view";
import {
  BACK_TO_PEOPLE,
  CANCEL,
  CANT_MOVE_YET,
  CLOSE,
  LINE_LABEL,
  CHOOSE_A_GROUP,
  FROM_WHICH_WEEK,
  MOVE_TO,
  MOVING,
  SHOW_WHAT_HAPPENS,
  WHAT_WILL_HAPPEN,
  WHY_HINT,
  whyLabel,
} from "@/lib/courses/staffMove/words";
import styles from "./MovePage.module.css";

/**
 * THE MOVE PAGE'S OWN PART: the group to move to, the week the move is from
 * (stated, never chosen), why (optional), what will happen, the email to the
 * person as it will be sent, Cancel and the one button with its count. Every
 * sentence comes from the plan the route shares, through the server page
 * first and the route's preview after a new choice, so nothing here words a
 * fact of its own.
 *
 * Before the script arrives the choice is a plain form that reloads the page
 * with `?to=`; once it is here a new choice asks the route's preview in
 * place. The press sends back the week and the count it was shown: a 409
 * redraws the page with the facts as they now are.
 */
export default function MovePage({ view }: { view: MovePageView }) {
  const ids = useId();
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<string>(view.chosen ?? "");
  const [outcome, setOutcome] = useState(view.outcome);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function ask(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> | null }> {
    try {
      const response = await fetch(view.routePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
    } catch {
      return { status: 0, body: null };
    }
  }

  async function choose(groupId: string) {
    setChosen(groupId);
    setProblem(null);
    if (!groupId) {
      setOutcome(null);
      return;
    }
    setBusy(true);
    const answer = await ask({ toGroupId: groupId, preview: true });
    setBusy(false);
    if (answer.status === 200 && answer.body?.ok === true) {
      setOutcome({ ok: true, preview: answer.body.preview as MovePreviewView });
    } else {
      setOutcome({ ok: false, error: typeof answer.body?.error === "string" ? answer.body.error : UNKNOWN_OUTCOME });
    }
  }

  async function press(preview: MovePreviewView) {
    setBusy(true);
    setProblem(null);
    const answer = await ask({
      toGroupId: preview.toGroupId,
      weekNumber: preview.weekNumber,
      emailCount: preview.emails,
      ...(why.trim() ? { reason: why.trim() } : {}),
    });
    if (answer.status === 200 && answer.body?.ok === true) {
      setBusy(false);
      setDone(typeof answer.body.message === "string" ? answer.body.message : "");
      return;
    }
    if (answer.status === 409) {
      // The facts changed between the page and the press: draw them again.
      const again = await ask({ toGroupId: preview.toGroupId, preview: true });
      setBusy(false);
      setOutcome(
        again.status === 200 && again.body?.ok === true
          ? { ok: true, preview: again.body.preview as MovePreviewView }
          : { ok: false, error: typeof again.body?.error === "string" ? again.body.error : UNKNOWN_OUTCOME },
      );
      setProblem(typeof answer.body?.error === "string" ? answer.body.error : UNKNOWN_OUTCOME);
      return;
    }
    setBusy(false);
    setProblem(typeof answer.body?.error === "string" ? answer.body.error : UNKNOWN_OUTCOME);
  }

  const titleId = `${ids}-title`;
  if (done !== null) {
    return (
      <section className={styles.card} aria-labelledby={titleId}>
        <h1 id={titleId} className={styles.title}>
          {view.title}
        </h1>
        <p className={styles.done} role="status" data-testid="staff-move-done">
          {done}
        </p>
        <Link href={view.backHref} className={styles.back}>
          {BACK_TO_PEOPLE}
        </Link>
      </section>
    );
  }

  const preview = outcome?.ok ? outcome.preview : null;
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h1 id={titleId} className={styles.title}>
          {view.title}
        </h1>
        <Link href={view.backHref} className={styles.close}>
          {CLOSE}
        </Link>
      </div>

      <form method="get" className={styles.field}>
        <label className={styles.label} htmlFor={`${ids}-to`}>
          {MOVE_TO}
        </label>
        <Select
          id={`${ids}-to`}
          name="to"
          value={chosen}
          disabled={busy}
          data-testid="staff-move-to"
          onChange={(event) => {
            if (hydrated) void choose(event.target.value);
            else setChosen(event.target.value);
          }}
        >
          <option value="">{CHOOSE_A_GROUP}</option>
          {view.choices.map((choice) => (
            <option key={choice.groupId} value={choice.groupId} disabled={choice.full}>
              {choice.words}
            </option>
          ))}
        </Select>
        {!hydrated && (
          <button type="submit" className={styles.show}>
            {SHOW_WHAT_HAPPENS}
          </button>
        )}
      </form>

      {outcome && !outcome.ok && (
        <div className={styles.refused} role="status">
          <h2 className={styles.subTitle}>{CANT_MOVE_YET}</h2>
          <p className={styles.line}>
            {outcome.error}
          </p>
        </div>
      )}

      {preview && (
        <>
          <div className={styles.field}>
            <h2 className={styles.label}>{FROM_WHICH_WEEK}</h2>
            <p className={styles.week} data-testid="staff-move-week">
              {preview.weekStated}
            </p>
            {preview.weeksStay && <p className={styles.line}>{preview.weeksStay}</p>}
            {preview.skipsOld && <p className={styles.line}>{preview.skipsOld}</p>}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${ids}-why`}>
              {whyLabel(view.firstName)}
            </label>
            <Input
              id={`${ids}-why`}
              type="text"
              autoComplete="off"
              maxLength={200}
              value={why}
              disabled={busy}
              onChange={(event) => setWhy(event.target.value)}
            />
            <p className={styles.hint}>{WHY_HINT}</p>
          </div>

          <div className={styles.field}>
            <h2 className={styles.label}>{WHAT_WILL_HAPPEN}</h2>
            <dl className={styles.lines} data-testid="staff-move-lines">
              {preview.lines.map((line, index) => (
                // Keyed by place as well as label: the Copies label can head more than one line.
                <div key={`${index}-${line.label}`} className={styles.lineRow}>
                  <dt className={styles.lineLabel}>{line.label}</dt>
                  <dd className={styles.lineText}>{line.text}</dd>
                </div>
              ))}
              <div className={styles.lineRow}>
                <dt className={styles.lineLabel}>{LINE_LABEL.told}</dt>
                <dd className={styles.lineText}>
                  <strong>{preview.told.count}</strong>
                  {preview.told.rest}
                </dd>
              </div>
            </dl>
          </div>

          {preview.personEmail && (
            <div className={styles.email} data-testid="staff-move-email">
              <p className={styles.emailTo}>{preview.personEmail.heading}</p>
              <p className={styles.emailSubject}>{preview.personEmail.subject}</p>
              {preview.personEmail.lines.map((line) => (
                <p key={line} className={styles.line}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.actions}>
        <Link href={view.backHref} className={styles.cancel}>
          {CANCEL}
        </Link>
        {preview && (
          <Button type="button" onClick={() => void press(preview)} disabled={!hydrated || busy} data-testid="staff-move-press">
            {busy ? MOVING : preview.button}
          </Button>
        )}
      </div>
    </section>
  );
}
