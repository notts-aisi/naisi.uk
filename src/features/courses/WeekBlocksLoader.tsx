"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Input";
import type { ChipTone } from "@/components/ui/Chip";
import { kindsLine, pasteRows, replaceLabel, type Counts, type Reach } from "@/lib/courses/weekEdit/pageModel";
import { HISTORY_PAGE, PASTE_CHECK } from "@/lib/courses/weekEdit/pageWords";
import styles from "./WeekBlocksLoader.module.css";

/**
 * LOADING A WEEK AS BLOCKS, in the run's week editor (Option
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
 *
 * ON A PROGRAMME'S WEEKS PAGE (`weekEdit`), the run's own week: the paste
 * takes the week's one lock when something is first typed into it, and
 * gives it back on a save, on emptying the box and on leaving; while
 * somebody else holds it the box is off. The check also says what the
 * pasted week holds by kind and how it differs from the week now, block by
 * block, with what that does to people's ticks and answers, and the replace
 * says for how many groups. The route's refusals (somebody else editing, the
 * week changed since it was read) are shown as they come.
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
  /** The run's route only: what the pasted week holds by kind. */
  kinds?: Array<{ type: string; label: string; count: number }>;
  /** The run's route only: how it differs from the week now, block by block. */
  comparison?: {
    rows: Array<{ state: "changed" | "added" | "removed"; blockId: string; place: string; fields: string; itemsTakenOut: string[] }>;
    same: boolean;
    moved: number;
    title: { before: string; after: string } | null;
  };
  comparisonLine?: string;
};

/** The paste on a programme's Weeks page: the week's lock, and what its check reads beside the paste. */
export type PasteWeekEdit = {
  /** Somebody else is editing the week, by name: the paste is off. */
  lockedBy: string | null;
  take: () => Promise<{ ok: true } | { ok: false; error: string }>;
  give: () => void;
  /** Each block's counts as the page read them, for what a changed block keeps. */
  countsOf: (blockId: string) => Counts | null;
  reach: Pick<Reach, "groups" | "reading">;
  /** Read the week again after a save, or after a save refused because the week changed. */
  reload: () => void;
  /** A save refused because somebody else holds the week: name them on the page. */
  refusedBy: (holder: { name: string; since: string }, line: string) => void;
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
  /** On a programme's Weeks page, for the run's own week: the lock and the check's comparison. */
  weekEdit?: PasteWeekEdit;
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
  weekEdit,
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
  /** This paste holds the week's lock (the Weeks page only). */
  const [holding, setHolding] = useState(false);

  const current = read !== null && readFor === markdown;
  const lockedOut = weekEdit?.lockedBy && !holding ? weekEdit.lockedBy : null;

  /** The box changed: the first words typed take the week; an emptied box gives it back. */
  function type(next: string) {
    setMarkdown(next);
    if (!weekEdit) return;
    if (next.trim() !== "" && !holding) {
      setHolding(true);
      void weekEdit.take().then((taken) => {
        if (!taken.ok) {
          setHolding(false);
          setMessage({ tone: "error", text: taken.error });
        }
      });
    } else if (next.trim() === "" && holding) {
      setHolding(false);
      weekEdit.give();
    }
  }

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
      if (weekEdit) {
        setHolding(false);
        weekEdit.give();
        weekEdit.reload();
      }
      onSaved();
      return;
    }
    // Somebody else is editing the week: the page names them and turns the paste off.
    const holder = (answer.body as { holder?: { name?: unknown; since?: unknown } }).holder;
    if (weekEdit && answer.status === 409 && holder && typeof holder.name === "string") {
      setHolding(false);
      weekEdit.refusedBy({ name: holder.name, since: typeof holder.since === "string" ? holder.since : "" }, answer.body.error ?? "");
    } else if (weekEdit && answer.status === 409 && !answer.body.found) {
      // The week changed since it was read: what the page shows of it is read again too.
      weekEdit.reload();
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
  // On the Weeks page: each block the paste changes or takes out, and what it does to people's work.
  const rows = read?.comparison && weekEdit ? pasteRows(read.comparison.rows, weekEdit.countsOf, read.removed) : [];
  const blockCount = read?.kinds ? read.kinds.reduce((sum, kind) => sum + kind.count, 0) : 0;
  const pressLabel =
    weekEdit && blockWeek && read
      ? replaceLabel(weekNumber, weekEdit.reach, read.answers)
      : read && read.answers > 0
        ? `${saveLabel} and take out ${read.answers === 1 ? "1 answer" : `${read.answers} answers`}`
        : saveLabel;

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
          onChange={(e) => type(e.target.value)}
          rows={12}
          spellCheck={false}
          disabled={busy || lockedOut !== null}
        />
      </Field>
      {lockedOut && <p className={styles.muted}>{PASTE_CHECK.lockedOut(lockedOut)}</p>}
      <p className={styles.muted}>
        Pasting again replaces the week. Answers stay with their blocks; if a block that has answers would go, it says
        how many first.
      </p>

      <div className={styles.actions}>
        <Button type="button" onClick={readIt} disabled={busy || markdown.trim() === "" || lockedOut !== null}>
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

          {weekEdit && read.kinds && (
            <div className={styles.check}>
              <h4 className={styles.checkTitle}>{PASTE_CHECK.found(blockCount)}</h4>
              <p className={styles.muted}>{kindsLine(read.kinds)}</p>
            </div>
          )}

          {weekEdit && read.comparison && (
            <div className={styles.check}>
              <h4 className={styles.checkTitle}>{PASTE_CHECK.compared(weekNumber)}</h4>
              <p className={styles.checkLine}>{read.comparison.same ? PASTE_CHECK.same : read.comparisonLine}</p>
              {read.comparison.title && (
                <div className={styles.checkRow}>
                  <span className={styles.checkPlace}>{HISTORY_PAGE.titleRow}</span>
                  <span className={styles.muted}>
                    “{read.comparison.title.before}” to “{read.comparison.title.after}”
                  </span>
                </div>
              )}
              {rows.map((row, i) => (
                <div key={`${row.state}-${row.place}-${i}`} className={styles.checkRow}>
                  <span className={styles.checkPlace}>
                    {HISTORY_PAGE.state[row.state]}: {row.place}
                  </span>
                  {row.fields && <span className={styles.muted}>{HISTORY_PAGE.fields(row.fields)}</span>}
                  {row.keeps && <span className={styles.checkChip}>{row.keeps}</span>}
                  {row.answers > 0 && <span className={`${styles.checkChip} ${styles.checkChipAnswers}`}>{PASTE_CHECK.takesOut(row.answers)}</span>}
                </div>
              ))}
            </div>
          )}

          <p className={styles.muted}>Due dates come from each group’s day: the written answer {read.due} its session.</p>

          <div className={styles.actions}>
            <Button type="button" onClick={save} disabled={busy || read.problems.length > 0 || lockedOut !== null}>
              {pressLabel}
            </Button>
          </div>
          {weekEdit && <p className={styles.muted}>{PASTE_CHECK.footnote}</p>}
        </div>
      )}
    </Card>
  );
}
