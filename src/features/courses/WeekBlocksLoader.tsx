"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Input";
import type { ChipTone } from "@/components/ui/Chip";
import styles from "./WeekBlocksLoader.module.css";

/**
 * LOADING A WEEK AS BLOCKS, in the run's week editor (board pr-weeks, Option
 * B): paste the week's Markdown, "Read it", check what was found and the
 * things to check, then Save. "Copy as Markdown" gives a block week back, ids
 * written in, for editing and pasting again.
 *
 * Drawn in the run's week editor for an admin, and on a programme's Weeks
 * tab for its lead and admins (with "Save draft"), where it also loads a
 * group's own copy of the week (`endpoint`). Every read and write goes
 * through the route it is pointed at (the run's week by default,
 * `/api/courses/runs/[runId]/weeks/[weekId]/blocks`), which decides who may
 * and reads the paste against the week as stored, so what is saved is what
 * was read.
 */

type FoundRow = { state: "found" | "missing" | "check"; label: string; detail: string; indent: boolean };

type ReadAnswer = {
  title: string;
  found: FoundRow[];
  checks: string[];
  problems: string[];
  removed: Array<{ id: string; kind: string; label: string; answers: number }>;
  answers: number;
  due: string;
  error?: string;
};

const STATE: Record<FoundRow["state"], { word: string; tone: ChipTone }> = {
  found: { word: "Found", tone: "success" },
  missing: { word: "Not found", tone: "neutral" },
  check: { word: "Check this", tone: "warning" },
};

type Props = {
  runId: string;
  weekId: string;
  weekNumber: number;
  /** True when the week is already written as blocks: "Copy as Markdown" has something to copy. */
  blockWeek: boolean;
  /** Called after a save, to read the week again. */
  onSaved: () => void;
  /** The route that reads and saves this paste; the run's own week when not given. */
  endpoint?: string;
  /** The press that saves: "Save" in the run's week editor, "Save draft" on the Weeks tab. */
  saveLabel?: string;
  /** The card's heading. */
  title?: string;
  /** What the card is for, under its heading; the editor's own line when not given. */
  lede?: string;
  /** Names the box apart when two cards for one week are on a page. */
  idSuffix?: string;
};

export default function WeekBlocksLoader({
  runId,
  weekId,
  weekNumber,
  blockWeek,
  onSaved,
  endpoint,
  saveLabel = "Save",
  title = "Paste the week, then check it",
  lede,
  idSuffix = "",
}: Props) {
  const url = endpoint ?? `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/blocks`;
  const boxId = `week-markdown-${weekId}${idSuffix}`;
  const copyId = `week-copy-${weekId}${idSuffix}`;
  const [markdown, setMarkdown] = useState("");
  const [read, setRead] = useState<ReadAnswer | null>(null);
  /** The Markdown `read` answers, so a change to the box asks for "Read it" again. */
  const [readFor, setReadFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const current = read !== null && readFor === markdown;

  async function send(method: "POST" | "PUT", confirmAnswers?: number): Promise<{ status: number; body: ReadAnswer & { saved?: boolean } } | null> {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, ...(confirmAnswers !== undefined ? { confirmAnswers } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as ReadAnswer & { saved?: boolean };
      return { status: res.status, body };
    } catch {
      setMessage({ tone: "error", text: "Couldn’t reach the site. Check your connection and try again." });
      return null;
    }
  }

  async function readIt() {
    setBusy(true);
    setMessage(null);
    const answer = await send("POST");
    setBusy(false);
    if (!answer) return;
    if (answer.status !== 200) {
      setRead(null);
      setMessage({ tone: "error", text: answer.body.error ?? "Couldn’t read that Markdown." });
      return;
    }
    setRead(answer.body);
    setReadFor(markdown);
  }

  async function save() {
    if (!read) return;
    setBusy(true);
    setMessage(null);
    const answer = await send("PUT", read.answers > 0 ? read.answers : undefined);
    setBusy(false);
    if (!answer) return;
    if (answer.status === 200 && answer.body.saved) {
      setMessage({ tone: "done", text: `Week ${weekNumber} saved.` });
      setRead(null);
      setReadFor(null);
      setMarkdown("");
      onSaved();
      return;
    }
    // A refused save answers with the read as it stands now: show that instead.
    if (answer.body.found) {
      setRead(answer.body);
      setReadFor(markdown);
    }
    setMessage({ tone: "error", text: answer.body.error ?? "Couldn’t save the week." });
  }

  async function copyOut() {
    setBusy(true);
    setMessage(null);
    setCopied(null);
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as { markdown?: string; error?: string };
      if (!res.ok || typeof body.markdown !== "string") {
        setMessage({ tone: "error", text: body.error ?? "Couldn’t copy the week." });
        return;
      }
      try {
        await navigator.clipboard.writeText(body.markdown);
        setMessage({ tone: "done", text: "Copied. Edit it, paste it here and read it again." });
      } catch {
        // No clipboard (an older browser, or permission refused): show it to copy by hand.
        setCopied(body.markdown);
      }
    } catch {
      setMessage({ tone: "error", text: "Couldn’t reach the site. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const answered = read ? read.removed.filter((item) => item.answers > 0) : [];

  return (
    <Card padding="lg">
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.hint}>
        {lede ?? (
          <>
            The fellow guide exports each week to Markdown. The site reads it into blocks for you to check.
            {blockWeek ? " This week is written as blocks: what its people read, tick and answer comes from them." : ""}
          </>
        )}
      </p>

      <Field id={boxId} label="Paste the week’s Markdown">
        <Textarea
          id={boxId}
          className={styles.markdown}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={12}
          spellCheck={false}
          disabled={busy}
        />
      </Field>
      <p className={styles.muted}>
        Pasting again replaces the week. Answers stay with their blocks; if a block that has answers would go, it says
        how many first.
      </p>

      <div className={styles.actions}>
        <Button type="button" onClick={readIt} disabled={busy || markdown.trim() === ""}>
          Read it
        </Button>
        {blockWeek && (
          <Button type="button" variant="secondary" onClick={copyOut} disabled={busy}>
            Copy as Markdown
          </Button>
        )}
      </div>

      {copied !== null && (
        <Field id={copyId} label="The week as Markdown: select it and copy">
          <Textarea id={copyId} className={styles.markdown} value={copied} readOnly rows={12} />
        </Field>
      )}

      {message && (
        <p className={message.tone === "error" ? styles.error : styles.done} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      {read && current && (
        <div className={styles.read}>
          <h4 className={styles.subtitle}>What we found in week {weekNumber}</h4>
          <ul className={styles.found}>
            {read.found.map((row, i) => (
              <li key={`${row.label}-${i}`} className={row.indent ? styles.indent : undefined}>
                <Badge tone={STATE[row.state].tone}>{STATE[row.state].word}</Badge>
                <span className={styles.label}>{row.label}</span>
                <span className={styles.detail}>{row.detail}</span>
              </li>
            ))}
          </ul>

          {read.checks.length > 0 && (
            <>
              <h4 className={styles.subtitle}>
                {read.checks.length === 1 ? "1 thing to check" : `${read.checks.length} things to check`}
              </h4>
              <ul className={styles.list}>
                {read.checks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}

          {read.problems.length > 0 && (
            <>
              <h4 className={styles.subtitle}>Before it can be saved</h4>
              <ul className={`${styles.list} ${styles.problems}`}>
                {read.problems.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}

          {answered.length > 0 && (
            <div className={styles.warn}>
              <p>
                This paste takes out {answered.length === 1 ? "something" : `${answered.length} things`} people have
                already answered or ticked, {read.answers === 1 ? "1 answer" : `${read.answers} answers`} in all:
              </p>
              <ul className={styles.list}>
                {answered.map((item) => (
                  <li key={item.id}>
                    “{item.label}”: {item.answers === 1 ? "1 answer" : `${item.answers} answers`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.muted}>Due dates come from each group’s day: the written answer {read.due} its session.</p>

          <div className={styles.actions}>
            <Button type="button" onClick={save} disabled={busy || read.problems.length > 0}>
              {read.answers > 0 ? `${saveLabel} and take out ${read.answers === 1 ? "1 answer" : `${read.answers} answers`}` : saveLabel}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
