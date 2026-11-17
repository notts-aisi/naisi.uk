"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { downloadCSV } from "@/lib/csv";
import type { AdminView } from "@/lib/aiSurvey/adminStore";
import type { AiSurveyDefinition } from "@/lib/aiSurvey/types";
import frame from "../survey.module.css";
import styles from "./admin.module.css";

/**
 * The AI at Nottingham survey's admin page, as its board draws it: the stage,
 * three counts, what is missing before it can open, Open, Close it now, Clear
 * pilot data, the download, and the short links with their scans.
 *
 * Every button calls a route that checks the allowlist again for itself, so
 * nothing here is a gate. The page never shows anything about one person.
 */

type Words = AiSurveyDefinition["admin"];

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`/api/ai-survey/admin/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
}

const STAGES = ["pilot", "open", "closed"] as const;

export default function AdminPanel({ view, words }: { view: AdminView; words: Words }) {
  const router = useRouter();
  // The confirm box is held shut until the page's script has arrived:
  // anything typed into it before then would be thrown away, and the button
  // beside it would stay off with the right words showing.
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // "Type clear pilot data to confirm": the phrase is the label's own words.
  const phrase = words.clearConfirmLabel.replace(/^Type\s+/i, "").replace(/\s+to confirm$/i, "");

  const run = async (name: string, action: () => Promise<Response>, done?: string) => {
    setBusy(name);
    setFailed(null);
    setMessage(null);
    try {
      const res = await action();
      if (!res.ok) {
        setFailed("That did not go through. Nothing was changed.");
      } else {
        if (done) setMessage(done);
        router.refresh();
      }
    } catch {
      setFailed("That did not go through. Nothing was changed.");
    }
    setBusy(null);
  };

  const download = async () => {
    setBusy("export");
    setFailed(null);
    try {
      const res = await post("export");
      if (!res.ok) throw new Error("refused");
      downloadCSV(`ai-at-nottingham-answers-${new Date().toISOString().slice(0, 10)}.csv`, await res.text());
      router.refresh();
    } catch {
      setFailed("The download was not made.");
    }
    setBusy(null);
  };

  return (
    <main className={`${frame.column} ${frame.wide}`}>
      <div className={frame.stackWide}>
        <h1 className={`${frame.h1} ${frame.h1Thanks}`}>{words.heading}</h1>
        <ol aria-label="Stage" className={styles.stages}>
          {STAGES.map((stage) => (
            <li key={stage} className={styles.stage} data-now={view.stage === stage ? stage : undefined}>
              <span aria-hidden="true" className={styles.dot} />
              {words.stages[stage]}
              {view.stage === stage ? ` ${words.stageNow}` : ""}
            </li>
          ))}
        </ol>
        <p className={frame.body}>{words.stageNotes[view.stage]}</p>
      </div>

      <div className={styles.counts}>
        <div className={styles.count}>
          <span className={frame.term}>{words.counts.started}</span>
          <span className={styles.number}>{view.started}</span>
        </div>
        <div className={styles.count}>
          <span className={frame.term}>{words.counts.finished}</span>
          <span className={styles.number}>{view.finished}</span>
        </div>
        <div className={styles.count}>
          <span className={frame.term}>{words.counts.codesLastHour}</span>
          <span className={styles.number}>{view.codesLastHour}</span>
          <span className={frame.small}>{words.counts.ceiling.replace("{n}", String(view.ceiling))}</span>
        </div>
      </div>

      <div className={styles.pair}>
        <section className={styles.panel}>
          <h2 className={styles.h2}>{words.missingHeading}</h2>
          <ul className={styles.checks}>
            {view.checks.map((check) => (
              <li key={check.name}>
                <code>{check.name}</code>
                <span data-set={check.set || undefined}>{check.set ? words.missingSet : words.missingNotSet}</span>
              </li>
            ))}
          </ul>
          {view.stage === "open" ? (
            <button
              type="button"
              className={`${frame.danger} ${styles.act}`}
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm(words.closeConfirm)) void run("close", () => post("close"));
              }}
            >
              {words.closeButton}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`${frame.primary} ${styles.act}`}
                disabled={!view.canOpen || busy !== null}
                onClick={() => {
                  if (window.confirm(words.openNote)) void run("open", () => post("open"));
                }}
              >
                {words.openButton}
              </button>
              <p className={frame.small}>{words.openNote}</p>
            </>
          )}
        </section>

        <section className={`${styles.panel} ${styles.panelDanger}`}>
          <h2 className={styles.h2}>{words.clearButton}</h2>
          <label htmlFor="confirm" className={styles.confirmLabel}>
            {words.clearConfirmLabel}
          </label>
          <input
            id="confirm"
            className={styles.confirm}
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={!hydrated || view.stage !== "pilot"}
          />
          <button
            type="button"
            className={`${frame.danger} ${styles.act}`}
            disabled={view.stage !== "pilot" || typed.trim().toLowerCase() !== phrase.toLowerCase() || busy !== null}
            onClick={() =>
              void run("clear", () => post("clear", { confirm: typed }), words.clearDone).then(() => setTyped(""))
            }
          >
            {words.clearButton}
          </button>
          {message && (
            <p role="status" className={frame.small}>
              {message}
            </p>
          )}
        </section>
      </div>

      {failed && (
        <p role="alert" className={frame.failed}>
          {failed}
        </p>
      )}

      <div className={styles.row}>
        <button type="button" className={`${frame.secondary} ${styles.act} ${styles.download}`} disabled={busy !== null} onClick={() => void download()}>
          {words.exportButton}
        </button>
        <Link href="/ai-survey/admin/totals" prefetch={false} className={frame.textLink}>
          {words.totalsLink}
        </Link>
        <span className={frame.small}>{words.exportNote}</span>
      </div>

      <section className={frame.stackWide}>
        <h2 className={styles.h2}>{words.shortLinksHeading}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{words.shortLinksLink}</th>
                <th scope="col">{words.shortLinksWhere}</th>
                <th scope="col" className={styles.scans}>
                  {words.shortLinksScans}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.shortLinks.map((link) => (
                <tr key={link.slug}>
                  <td className={styles.slug}>naisi.uk/q/{link.slug}</td>
                  <td>{link.where}</td>
                  <td className={styles.scans}>{link.scans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className={frame.small}>{words.neverOnePerson}</p>
    </main>
  );
}
