"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Input";
import type { ChipTone } from "@/components/ui/Chip";
import type { GuideDocName } from "@/lib/courses/guide/model";
import styles from "./WeekBlocksLoader.module.css";
import own from "./GuideLoader.module.css";

/**
 * LOADING A PROGRAMME'S START HERE OR GLOSSARY, in the run's editor: paste
 * the guide's Markdown, "Read it", check what was found and the things to
 * check, then Save. "Copy as Markdown" gives the stored page back, to edit
 * and paste again. The same card as a week's (`WeekBlocksLoader`), for a
 * page of the guide that is not a week.
 *
 * Admins only (the editor draws it for an admin alone, and the route refuses
 * everyone else). Every read and write goes through
 * `/api/courses/runs/[runId]/guide/[doc]`.
 */

type FoundRow = { state: "found" | "missing" | "check"; label: string; detail: string; indent: boolean };

type ReadAnswer = {
  found: FoundRow[];
  checks: string[];
  problems: string[];
  replaces: boolean;
  error?: string;
};

const STATE: Record<FoundRow["state"], { word: string; tone: ChipTone }> = {
  found: { word: "Found", tone: "success" },
  missing: { word: "Not found", tone: "neutral" },
  check: { word: "Check this", tone: "warning" },
};

const WORDS: Record<GuideDocName, { title: string; hint: string; field: string; has: string; none: string; page: string; copied: string }> = {
  "start-here": {
    title: "Start here",
    hint: "How the programme works, for everyone who holds a place. Paste the guide’s Start here as Markdown, read it, check what was found, then save.",
    field: "Paste Start here’s Markdown",
    has: "This run has its Start here.",
    none: "This run has no Start here yet.",
    page: "Open Start here",
    copied: "Start here as Markdown: select it and copy",
  },
  glossary: {
    title: "Glossary",
    hint: "The terms the programme uses, in plain words. Paste the guide’s Glossary as Markdown, read it, check what was found, then save.",
    field: "Paste the Glossary’s Markdown",
    has: "This run has its Glossary.",
    none: "This run has no Glossary yet.",
    page: "Open the Glossary",
    copied: "The Glossary as Markdown: select it and copy",
  },
};

type Props = {
  runId: string;
  doc: GuideDocName;
};

export default function GuideLoader({ runId, doc }: Props) {
  const url = `/api/courses/runs/${encodeURIComponent(runId)}/guide/${doc}`;
  const words = WORDS[doc];
  const [markdown, setMarkdown] = useState("");
  const [read, setRead] = useState<ReadAnswer | null>(null);
  /** The Markdown `read` answers, so a change to the box asks for "Read it" again. */
  const [readFor, setReadFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /** What the run holds now: its page as Markdown (null when it has none), and how many terms; undefined until asked. */
  const [stored, setStored] = useState<{ markdown: string | null; terms: number | null } | undefined>(undefined);

  const current = read !== null && readFor === markdown;

  /** What the run holds now, asked again after a save. */
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(url)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { markdown?: string; terms?: number };
        return res.ok && typeof body.markdown === "string"
          ? { markdown: body.markdown, terms: typeof body.terms === "number" ? body.terms : null }
          : { markdown: null, terms: null };
      })
      .catch(() => ({ markdown: null, terms: null }))
      .then((answer) => {
        if (live) setStored(answer);
      });
    return () => {
      live = false;
    };
  }, [url, asked]);

  async function send(method: "POST" | "PUT"): Promise<{ status: number; body: ReadAnswer & { saved?: boolean; message?: string } } | null> {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const body = (await res.json().catch(() => ({}))) as ReadAnswer & { saved?: boolean; message?: string };
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
    const answer = await send("PUT");
    setBusy(false);
    if (!answer) return;
    if (answer.status === 200 && answer.body.saved) {
      setMessage({ tone: "done", text: answer.body.message ?? "Saved." });
      setRead(null);
      setReadFor(null);
      setMarkdown("");
      setAsked((n) => n + 1);
      return;
    }
    // A refused save answers with the read as it stands now: show that instead.
    if (answer.body.found) {
      setRead(answer.body);
      setReadFor(markdown);
    }
    setMessage({ tone: "error", text: answer.body.error ?? "Couldn’t save it." });
  }

  async function copyOut() {
    if (!stored?.markdown) return;
    setMessage(null);
    setCopied(null);
    try {
      await navigator.clipboard.writeText(stored.markdown);
      setMessage({ tone: "done", text: "Copied. Edit it, paste it here and read it again." });
    } catch {
      // No clipboard (an older browser, or permission refused): show it to copy by hand.
      setCopied(stored.markdown);
    }
  }

  const has = Boolean(stored?.markdown);
  const pageHref = `/learn/${encodeURIComponent(runId)}/${doc}`;

  return (
    <Card padding="lg">
      <h3 className={styles.title}>{words.title}</h3>
      <p className={styles.hint}>{words.hint}</p>
      {stored !== undefined && (
        <p className={own.status}>
          {has ? words.has : words.none}
          {has && stored.terms !== null ? ` ${stored.terms === 1 ? "1 term" : `${stored.terms} terms`}.` : ""}
          {has && (
            <>
              {" "}
              <Link href={pageHref} className={own.pageLink}>
                {words.page}
              </Link>
            </>
          )}
        </p>
      )}

      <Field id={`guide-markdown-${doc}`} label={words.field}>
        <Textarea
          id={`guide-markdown-${doc}`}
          className={styles.markdown}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={12}
          spellCheck={false}
          disabled={busy}
        />
      </Field>

      <div className={styles.actions}>
        <Button type="button" onClick={readIt} disabled={busy || markdown.trim() === ""}>
          Read it
        </Button>
        {has && (
          <Button type="button" variant="secondary" onClick={copyOut} disabled={busy}>
            Copy as Markdown
          </Button>
        )}
      </div>

      {copied !== null && (
        <Field id={`guide-copy-${doc}`} label={words.copied}>
          <Textarea id={`guide-copy-${doc}`} className={styles.markdown} value={copied} readOnly rows={12} />
        </Field>
      )}

      {message && (
        <p className={message.tone === "error" ? styles.error : styles.done} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      {read && current && (
        <div className={styles.read}>
          <h4 className={styles.subtitle}>What we found</h4>
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

          {read.replaces && <p className={styles.muted}>Saving replaces what this run has now.</p>}

          <div className={styles.actions}>
            <Button type="button" onClick={save} disabled={busy || read.problems.length > 0}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
