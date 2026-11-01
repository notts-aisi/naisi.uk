"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import type { FeedbackBatchModel } from "@/lib/courses/feedback/send";
import {
  BATCH_INTRO,
  EMAIL_IT,
  FEEDBACK_ON,
  FEEDBACK_TO_SEND,
  GROUP,
  ONE_EMAIL_PER_PERSON,
  PERSON,
  SAVED,
  SEND_TEST,
  THE_EMAIL_EACH_PERSON_GETS,
  WRITTEN_BY,
  sendEmailsWords,
  testSaidWords,
  tickLabelWords,
} from "@/lib/courses/feedback/words";
import styles from "./feedback.module.css";

/**
 * FEEDBACK TO SEND, on a programme's Overview: every piece of feedback whose
 * "you have feedback" email has not gone, a row each (who it is for, their
 * group, what it is on, who wrote it, the day it was saved), the email each
 * person gets, and, for an admin, "Send a test to me" and "Send 6 emails".
 * The server worded all of it (`loadFeedbackBatch`); this draws it and sends
 * the two presses.
 *
 * Every row starts ticked, and an admin may untick one to leave it for a
 * later send: the button counts the people the ticked rows are for, one
 * email each, and the press carries the ticked pieces and both numbers, so
 * nobody is emailed by a count the admin did not see. Until a test has
 * reached the admin in the last day the press stays locked, and the line
 * under it says why. The programme's lead reads the same list, with the line
 * that an admin sends these emails and no button. Before the page is live no
 * button can be pressed, since nothing would be listening.
 */
export default function FeedbackToSend({ model: initial, runId }: { model: FeedbackBatchModel; runId: string }) {
  const live = useHydrated();
  const router = useRouter();
  const [model, setModel] = useState(initial);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const base = `/api/courses/runs/${encodeURIComponent(runId)}/feedback/send`;

  const ticked = model.rows.filter((row) => !unticked.has(row.id));
  const people = new Set(ticked.map((row) => row.uid)).size;

  const toggle = (id: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function press(path: string, body: unknown, words: (answer: Record<string, unknown>) => string[]) {
    setBusy(true);
    setProblem(null);
    setSaid([]);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      // The list as the server has it now, with every row ticked again.
      if (answer.model) {
        setModel(answer.model as FeedbackBatchModel);
        setUnticked(new Set());
      }
      if (!response.ok) {
        setProblem(typeof answer.error === "string" ? answer.error : "That didn’t go. Try again in a minute.");
        if (!answer.model) router.refresh();
        return;
      }
      setSaid(words(answer));
    } catch {
      setProblem("Couldn’t reach the site. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const sendTest = () =>
    press(`${base}/test`, {}, (answer) => {
      const delivery = answer.delivery === "sent" || answer.delivery === "suppressed" ? answer.delivery : "held";
      return [testSaidWords(delivery, typeof answer.subject === "string" ? answer.subject : "")];
    });

  const send = () =>
    press(base, { ids: ticked.map((row) => row.id), pieces: ticked.length, people }, (answer) =>
      Array.isArray(answer.said) ? answer.said.filter((line): line is string => typeof line === "string") : [],
    );

  const idle = live && !busy;
  return (
    <section className={styles.batch} aria-labelledby="overview-feedback-to-send">
      <h2 id="overview-feedback-to-send" className={styles.batchTitle}>
        {FEEDBACK_TO_SEND}
      </h2>
      <p className={styles.batchIntro}>{BATCH_INTRO}</p>
      <div className={styles.batchColumns}>
        <div className={styles.batchMain}>
          <p className={styles.line}>{model.line}</p>
          {model.rows.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {model.mayPress && <th className={styles.tickCell} aria-label={EMAIL_IT} />}
                    <th scope="col">{PERSON}</th>
                    <th scope="col">{GROUP}</th>
                    <th scope="col">{FEEDBACK_ON}</th>
                    <th scope="col">{WRITTEN_BY}</th>
                    <th scope="col">{SAVED}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((row) => (
                    <tr key={row.id}>
                      {model.mayPress && (
                        <td className={styles.tickCell}>
                          <label className={styles.tick}>
                            <input
                              type="checkbox"
                              checked={!unticked.has(row.id)}
                              onChange={() => toggle(row.id)}
                              disabled={!idle}
                              aria-label={tickLabelWords(row.name, row.on)}
                            />
                          </label>
                        </td>
                      )}
                      <td className={styles.personCell}>{row.name}</td>
                      <td>{row.group}</td>
                      <td>{row.on}</td>
                      <td>{row.byName}</td>
                      <td>{row.saved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {model.noAddress && <p className={styles.error}>{model.noAddress}</p>}
          {model.leadLine && <p className={styles.line}>{model.leadLine}</p>}
          {model.mayPress && model.rows.length > 0 && (
            <div className={styles.batchActions}>
              <button type="button" className={styles.secondary} disabled={!idle || model.email === null} onClick={() => void sendTest()}>
                {SEND_TEST}
              </button>
              <button type="button" className={styles.primary} disabled={!idle || !model.tested || people === 0} onClick={() => void send()}>
                {sendEmailsWords(people)}
              </button>
            </div>
          )}
          {model.testFirst && <p className={styles.line}>{model.testFirst}</p>}
          <div role="status">
            {said.map((line) => (
              <p key={line} className={styles.line}>
                {line}
              </p>
            ))}
          </div>
          {problem && (
            <p className={styles.error} role="alert">
              {problem}
            </p>
          )}
        </div>
        {model.email && (
          <aside className={styles.emailCard} aria-label={THE_EMAIL_EACH_PERSON_GETS}>
            <p className={styles.cardOn}>{THE_EMAIL_EACH_PERSON_GETS}</p>
            <div className={styles.emailBody}>
              <p className={styles.emailSubject}>{model.email.subject}</p>
              <p className={styles.emailLead}>{model.email.lead}</p>
              <span className={styles.emailButton}>{model.email.button}</span>
            </div>
            <p className={styles.line}>{ONE_EMAIL_PER_PERSON}</p>
          </aside>
        )}
      </div>
    </section>
  );
}
