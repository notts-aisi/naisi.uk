"use client";

import { useEffect, useId, useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { TELL_PAGE } from "@/lib/courses/weekEdit/pageWords";
import { TELL_WORDS } from "@/lib/courses/weekEdit/words";
import styles from "./editWeek.module.css";

/**
 * "SAVED. TELL PEOPLE ABOUT IT?": after a save to a live week, or from the
 * newest row of the week's history while that save has told nobody. The
 * choices and their live counts, and the email as it would go, come from
 * `GET /api/courses/runs/[runId]/weeks/[weekId]/tell?save=`; nothing is
 * worked out here.
 *
 * NOBODY IS THE DEFAULT: most fixes need no email. "Send to 9 people" sends
 * the count the button shows, and the route refuses (409) when that count
 * has changed, answering the new one: the dialog shows it and asks again.
 * "Send me a test first" emails the presser alone. "Don't tell anyone"
 * closes and sends nothing. After a send, how many were emailed.
 */

type Choice = { audience: "nobody" | "started" | "open" | "programme"; label: string; hint: string; count: number };

type Preview = {
  save: { id: string; summary: string; line: string };
  canTell: boolean;
  told: string | null;
  choices: Choice[];
  letter: { subject: string; lines: string[] };
};

export default function TellDialog({
  runId,
  weekId,
  saveId,
  afterSave,
  onClose,
  onTold,
}: {
  runId: string;
  weekId: string;
  saveId: string;
  /** Opened straight after the save it is about. */
  afterSave: boolean;
  onClose: () => void;
  /** People were told: the history reads again. */
  onTold: () => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const url = `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/tell`;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [audience, setAudience] = useState<Choice["audience"]>("nobody");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`${url}?save=${encodeURIComponent(saveId)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Preview & { error?: string };
        if (!live) return;
        if (!res.ok) setProblem(body.error ?? "Couldn’t read who could be told.");
        else setPreview(body);
      } catch {
        if (live) setProblem("Couldn’t reach the site. Check your connection and try again.");
      }
    })();
    return () => {
      live = false;
    };
  }, [url, saveId]);

  const chosen = preview?.choices.find((choice) => choice.audience === audience) ?? null;
  const count = chosen && audience !== "nobody" ? chosen.count : 0;
  const off = !hydrated || busy || done;

  async function post(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: res.status, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
    } catch {
      setProblem("Couldn’t reach the site. Check your connection: nothing may have been sent.");
      return null;
    }
  }

  async function test() {
    setBusy(true);
    setProblem(null);
    setSaid(null);
    const answer = await post({ save: saveId, test: true });
    setBusy(false);
    if (!answer) return;
    const tested = answer.body.test as { delivery?: string; at?: string } | undefined;
    if (answer.status === 200 && tested) setSaid(TELL_PAGE.tested(tested.delivery ?? "sent", tested.at ?? ""));
    else setProblem(typeof answer.body.error === "string" ? answer.body.error : "The test didn’t go. Try again.");
  }

  async function send() {
    if (!chosen || audience === "nobody") return;
    setBusy(true);
    setProblem(null);
    setSaid(null);
    const answer = await post({ save: saveId, audience, count: chosen.count });
    setBusy(false);
    if (!answer) return;
    const told = answer.body.told as { count: number; sent: number; held: number; suppressed: number; failed: number } | undefined;
    if (answer.status === 200 && told) {
      setSaid(TELL_PAGE.sent(told));
      setDone(true);
      onTold();
      return;
    }
    // A count that changed since the dialog read it: show the new count and ask again.
    if (answer.status === 409 && typeof answer.body.count === "number") {
      const fresh = answer.body.count;
      setPreview((was) =>
        was ? { ...was, choices: was.choices.map((choice) => (choice.audience === audience ? { ...choice, count: fresh } : choice)) } : was,
      );
    }
    setProblem(typeof answer.body.error === "string" ? answer.body.error : "That didn’t send. Try again.");
  }

  return (
    <section className={styles.panel} aria-labelledby={`${ids}-title`}>
      <div className={styles.panelHead}>
        <h2 id={`${ids}-title`} className={styles.panelTitle}>
          {afterSave ? TELL_PAGE.titleAfterSave : TELL_PAGE.title}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {TELL_PAGE.close}
        </Button>
      </div>

      {!preview && !problem && <p className={styles.quiet}>{TELL_PAGE.reading}</p>}

      {preview && (
        <>
          <p className={styles.tellLine}>{preview.save.line}</p>
          {!preview.canTell ? (
            <p className={styles.note}>{preview.told ? TELL_PAGE.alreadyTold(preview.told) : TELL_PAGE.cannotTell}</p>
          ) : (
            <>
              <fieldset className={styles.options}>
                <legend className={styles.scopeLabel}>{TELL_PAGE.whoToTell}</legend>
                {preview.choices.map((choice) => (
                  <label key={choice.audience} className={`${styles.option} ${audience === choice.audience ? styles.optionChosen : ""}`}>
                    <input
                      type="radio"
                      name={`${ids}-audience`}
                      className={styles.radio}
                      checked={audience === choice.audience}
                      disabled={off}
                      onChange={() => {
                        setAudience(choice.audience);
                        setSaid(null);
                        setProblem(null);
                      }}
                    />
                    <span className={styles.optionText}>
                      <span className={styles.optionName}>{TELL_PAGE.choice(choice.label, choice.count, choice.audience)}</span>
                      <span className={styles.optionHint}>{choice.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className={styles.letter}>
                <p className={styles.letterTo}>{audience === "nobody" ? TELL_PAGE.nobodyChosen : TELL_WORDS.sendLine(count)}</p>
                <p className={styles.letterSubject}>{preview.letter.subject}</p>
                {preview.letter.lines.map((line) => (
                  <p key={line} className={styles.letterLine}>
                    {line}
                  </p>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {said && (
        <p className={styles.note} role="status">
          {said}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.panelActions}>
        {preview?.canTell && !done && (
          <>
            <Button type="button" onClick={() => void send()} disabled={off || audience === "nobody" || count === 0}>
              {busy ? TELL_PAGE.sending : TELL_WORDS.sendButton(count)}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void test()} disabled={off}>
              {TELL_WORDS.testButton}
            </Button>
          </>
        )}
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {done || !preview?.canTell ? TELL_PAGE.close : TELL_WORDS.nobodyButton}
        </Button>
      </div>
    </section>
  );
}
