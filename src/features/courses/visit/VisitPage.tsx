"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import type { VisitPageView, VisitPreviewView, VisitStandingView } from "@/lib/courses/visit/view";
import {
  ARRANGING,
  BACK_TO_PEOPLE,
  CALLING_OFF,
  CANCEL,
  CANT_ARRANGE,
  CHOOSE_A_WEEK,
  CLOSE,
  LINE_LABEL,
  SHOW_WHAT_HAPPENS,
  VISIT_STANDS,
  WHAT_WILL_HAPPEN,
  WHICH_SESSION,
  WHICH_WEEK,
  WHY_HINT,
  WHY_LABEL,
} from "@/lib/courses/visit/words";
import styles from "./VisitPage.module.css";

/**
 * THE VISIT PAGE'S OWN PART: which week (their group's sessions still to
 * come), which session (every other group's that week, with its places left,
 * a full one chosen with its warning), why (optional), what will happen, the
 * email to the person as it will be sent, Cancel and the one button with its
 * count; and each visit that stands, with the way to call it off. Every
 * sentence comes from the plan the route shares, so nothing here words a
 * fact of its own.
 *
 * Before the script arrives the choices are plain forms that reload the page
 * with `?week=` and `?to=`; once it is here a new week reloads the page with
 * that week's sessions, and a new session asks the route's preview in place.
 * The press sends back the count and the full flag it was shown: a 409
 * redraws the page with the facts as they now are.
 */
export default function VisitPage({ view }: { view: VisitPageView }) {
  const ids = useId();
  const router = useRouter();
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

  const errorOf = (answer: { body: Record<string, unknown> | null }) => (typeof answer.body?.error === "string" ? answer.body.error : UNKNOWN_OUTCOME);

  async function choose(groupId: string) {
    setChosen(groupId);
    setProblem(null);
    if (!groupId || view.week === null) {
      setOutcome(null);
      return;
    }
    setBusy(true);
    const answer = await ask({ weekNumber: view.week, hostGroupId: groupId, preview: true });
    setBusy(false);
    setOutcome(answer.status === 200 && answer.body?.ok === true ? { ok: true, preview: answer.body.preview as VisitPreviewView } : { ok: false, error: errorOf(answer) });
  }

  async function arrange(preview: VisitPreviewView) {
    setBusy(true);
    setProblem(null);
    const answer = await ask({
      weekNumber: preview.weekNumber,
      hostGroupId: preview.hostGroupId,
      emailCount: preview.emails,
      overLimit: preview.overLimit !== null,
      ...(why.trim() ? { reason: why.trim() } : {}),
    });
    if (answer.status === 200 && answer.body?.ok === true) {
      setBusy(false);
      setDone(typeof answer.body.message === "string" ? answer.body.message : "");
      return;
    }
    if (answer.status === 409) {
      // The facts changed between the page and the press: draw them again.
      const again = await ask({ weekNumber: preview.weekNumber, hostGroupId: preview.hostGroupId, preview: true });
      setOutcome(again.status === 200 && again.body?.ok === true ? { ok: true, preview: again.body.preview as VisitPreviewView } : { ok: false, error: errorOf(again) });
    }
    setBusy(false);
    setProblem(errorOf(answer));
  }

  async function callOff(standing: VisitStandingView) {
    setBusy(true);
    setProblem(null);
    const answer = await ask({ weekNumber: standing.weekNumber, callOff: true, emailCount: standing.emails });
    setBusy(false);
    if (answer.status === 200 && answer.body?.ok === true) {
      setDone(typeof answer.body.message === "string" ? answer.body.message : "");
      return;
    }
    setProblem(errorOf(answer));
    // Read the page again: the count, or the visit itself, may have changed.
    if (answer.status === 409) router.refresh();
  }

  const titleId = `${ids}-title`;
  if (done !== null) {
    return (
      <section className={styles.card} aria-labelledby={titleId}>
        <h1 id={titleId} className={styles.title}>
          {view.title}
        </h1>
        <p className={styles.done} role="status" data-testid="staff-visit-done">
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

      {view.limit && (
        <p className={styles.warning} role="note">
          {view.limit}
        </p>
      )}

      {view.standing.map((standing) => (
        <div key={standing.weekNumber} className={styles.standing} data-testid="staff-visit-standing">
          <h2 className={styles.subTitle}>{VISIT_STANDS}</h2>
          <p className={styles.line}>{standing.words}</p>
          {standing.gone && <p className={styles.line}>{standing.gone}</p>}
          {standing.open && (
            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={() => void callOff(standing)} disabled={!hydrated || busy || view.limit !== null} data-testid="staff-visit-call-off">
                {busy ? CALLING_OFF : standing.button}
              </Button>
            </div>
          )}
        </div>
      ))}

      <form method="get" className={styles.field}>
        <label className={styles.label} htmlFor={`${ids}-week`}>
          {WHICH_WEEK}
        </label>
        <Select
          id={`${ids}-week`}
          name="week"
          defaultValue={view.week === null ? "" : String(view.week)}
          disabled={busy}
          data-testid="staff-visit-week"
          onChange={(event) => {
            if (hydrated) router.push(`?week=${encodeURIComponent(event.target.value)}`);
          }}
        >
          <option value="">{CHOOSE_A_WEEK}</option>
          {view.weeks.map((week) => (
            <option key={week.weekNumber} value={String(week.weekNumber)} disabled={week.visiting}>
              {week.words}
            </option>
          ))}
        </Select>
        {!hydrated && (
          <button type="submit" className={styles.show}>
            {SHOW_WHAT_HAPPENS}
          </button>
        )}
      </form>

      {view.week !== null && (
        <form method="get" className={styles.field}>
          <input type="hidden" name="week" value={String(view.week)} />
          <fieldset className={styles.sessions} disabled={busy}>
            <legend className={styles.label}>{WHICH_SESSION}</legend>
            {view.sessions.map((session) => (
              <label key={session.groupId} className={styles.session}>
                <input
                  type="radio"
                  name="to"
                  value={session.groupId}
                  checked={chosen === session.groupId}
                  data-testid="staff-visit-session"
                  onChange={() => {
                    if (hydrated) void choose(session.groupId);
                    else setChosen(session.groupId);
                  }}
                />
                <span className={styles.sessionWords}>
                  <span>{session.words}</span>
                  <span className={styles.sessionDetail}>{session.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {!hydrated && (
            <button type="submit" className={styles.show}>
              {SHOW_WHAT_HAPPENS}
            </button>
          )}
        </form>
      )}

      {outcome && !outcome.ok && (
        <div className={styles.refused} role="status">
          <h2 className={styles.subTitle}>{CANT_ARRANGE}</h2>
          <p className={styles.line}>{outcome.error}</p>
        </div>
      )}

      {preview && (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${ids}-why`}>
              {WHY_LABEL}
            </label>
            <Input id={`${ids}-why`} type="text" autoComplete="off" maxLength={200} value={why} disabled={busy} onChange={(event) => setWhy(event.target.value)} />
            <p className={styles.hint}>{WHY_HINT}</p>
          </div>

          <div className={styles.field}>
            <h2 className={styles.label}>{WHAT_WILL_HAPPEN}</h2>
            <dl className={styles.lines} data-testid="staff-visit-lines">
              {preview.lines.map((line, index) => (
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

          {preview.limit && preview.limit !== view.limit && (
            <p className={styles.warning} role="note">
              {preview.limit}
            </p>
          )}

          {preview.overLimit && (
            <p className={styles.warning} role="note">
              {preview.overLimit}
            </p>
          )}

          {preview.personEmail && (
            <div className={styles.email} data-testid="staff-visit-email">
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
          <Button type="button" onClick={() => void arrange(preview)} disabled={!hydrated || busy || preview.limit !== null || view.limit !== null} data-testid="staff-visit-press">
            {busy ? ARRANGING : preview.button}
          </Button>
        )}
      </div>
    </section>
  );
}
