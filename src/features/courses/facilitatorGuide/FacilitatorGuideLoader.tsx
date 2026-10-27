"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { ChipTone } from "@/components/ui/Chip";
import { Field, Textarea } from "@/components/ui/Input";
import ResponsiveSelect, { type ResponsiveSelectOption } from "@/components/ui/ResponsiveSelect";
import loader from "@/features/courses/WeekBlocksLoader.module.css";
import { facilitatorGuidePath } from "@/lib/courses/facilitatorGuide/model";
import styles from "./FacilitatorGuideLoader.module.css";

/**
 * LOADING A COURSE'S FACILITATOR GUIDE (the admin's paste card, in the
 * pattern of the week loader, `WeekBlocksLoader`): pick the place, paste the
 * document's Markdown, "Read it", check what was found and the things to
 * check, then Save. "Copy as Markdown" gives back a document that is
 * loaded, for editing and pasting again.
 *
 * Admins only: the page that draws this refuses everybody else, and every
 * read and write goes through `/api/courses/[courseId]/facilitator-guide/
 * [slot]`, which refuses everybody else too and reads the paste again on
 * Save, so what is saved is what was read.
 */

type FoundRow = { state: "found" | "missing" | "check"; label: string; detail: string; indent: boolean };

type ReadAnswer = {
  place: string;
  title: string;
  found: FoundRow[];
  checks: string[];
  problems: string[];
  replaces: string | null;
  error?: string;
};

const STATE: Record<FoundRow["state"], { word: string; tone: ChipTone }> = {
  found: { word: "Found", tone: "success" },
  missing: { word: "Not found", tone: "neutral" },
  check: { word: "Check this", tone: "warning" },
};

/** One place in the guide, as the page read it on the server. */
export type LoaderSlot = {
  /** "handbook", "w03-plan". */
  key: string;
  /** "Handbook", "Week 3 session plan". */
  label: string;
  /** The title of the document loaded there, or null. */
  loaded: string | null;
};

type Props = {
  courseId: string;
  slots: LoaderSlot[];
};

export default function FacilitatorGuideLoader({ courseId, slots }: Props) {
  const router = useRouter();
  const [key, setKey] = useState(slots[0]?.key ?? "");
  const [markdown, setMarkdown] = useState("");
  const [read, setRead] = useState<ReadAnswer | null>(null);
  /** The place and Markdown `read` answers, so a change to either asks for "Read it" again. */
  const [readFor, setReadFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const slot = slots.find((candidate) => candidate.key === key) ?? null;
  if (!slot) return null;
  const url = `/api/courses/${encodeURIComponent(courseId)}/facilitator-guide/${encodeURIComponent(slot.key)}`;
  const current = read !== null && readFor === `${slot.key}\n${markdown}`;
  const loadedCount = slots.filter((candidate) => candidate.loaded !== null).length;
  const options: ResponsiveSelectOption[] = slots.map((candidate) => ({
    value: candidate.key,
    label: candidate.loaded ? `${candidate.label} · loaded` : candidate.label,
  }));

  function choose(next: string) {
    setKey(next);
    setMessage(null);
    setCopied(null);
  }

  async function send(method: "POST" | "PUT"): Promise<{ status: number; body: ReadAnswer & { saved?: boolean } } | null> {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const body = (await res.json().catch(() => ({}))) as ReadAnswer & { saved?: boolean };
      return { status: res.status, body };
    } catch {
      setMessage({ tone: "error", text: "Couldn’t reach the site. Check your connection and try again." });
      return null;
    }
  }

  async function readIt() {
    if (!slot) return;
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
    setReadFor(`${slot.key}\n${markdown}`);
  }

  async function save() {
    if (!read || !slot) return;
    setBusy(true);
    setMessage(null);
    const answer = await send("PUT");
    setBusy(false);
    if (!answer) return;
    if (answer.status === 200 && answer.body.saved) {
      setMessage({ tone: "done", text: `${slot.label} saved.` });
      setRead(null);
      setReadFor(null);
      setMarkdown("");
      router.refresh();
      return;
    }
    // A refused save answers with the read as it stands now: show that instead.
    if (answer.body.found) {
      setRead(answer.body);
      setReadFor(`${slot.key}\n${markdown}`);
    }
    setMessage({ tone: "error", text: answer.body.error ?? "Couldn’t save the document." });
  }

  async function copyOut() {
    setBusy(true);
    setMessage(null);
    setCopied(null);
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as { markdown?: string; error?: string };
      if (!res.ok || typeof body.markdown !== "string") {
        setMessage({ tone: "error", text: body.error ?? "Couldn’t copy the document." });
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

  return (
    <Card padding="lg">
      <h3 className={loader.title}>Paste a document, then check it</h3>
      <p className={loader.hint}>
        The course docs export each tab to Markdown: each week’s session plan and notes, and the course’s own
        documents. The site reads it for you to check, and leaves out the byline under the title.
      </p>

      <Field id="guide-place" label="Where it goes">
        <ResponsiveSelect value={slot.key} onChange={choose} options={options} ariaLabel="Where it goes" id="guide-place" disabled={busy} />
      </Field>
      <p className={styles.loadedLine}>
        {slot.loaded ? `Loaded now: “${slot.loaded}”. Saving replaces it.` : "Nothing is loaded here yet."}{" "}
        <span className={styles.count}>{`${loadedCount} of ${slots.length} loaded.`}</span>
      </p>

      <Field id="guide-markdown" label={`Paste the Markdown of ${slot.label}`}>
        <Textarea
          id="guide-markdown"
          className={loader.markdown}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={12}
          spellCheck={false}
          disabled={busy}
        />
      </Field>

      <div className={loader.actions}>
        <Button type="button" onClick={readIt} disabled={busy || markdown.trim() === ""}>
          Read it
        </Button>
        {slot.loaded && (
          <Button type="button" variant="secondary" onClick={copyOut} disabled={busy}>
            Copy as Markdown
          </Button>
        )}
      </div>

      {copied !== null && (
        <Field id="guide-copy" label="The document as Markdown: select it and copy">
          <Textarea id="guide-copy" className={loader.markdown} value={copied} readOnly rows={12} />
        </Field>
      )}

      {message && (
        <p className={message.tone === "error" ? loader.error : loader.done} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      {read && current && (
        <div className={loader.read}>
          <h4 className={loader.subtitle}>What we found in {read.place}</h4>
          <ul className={loader.found}>
            {read.found.map((row, i) => (
              <li key={`${row.label}-${i}`} className={row.indent ? loader.indent : undefined}>
                <Badge tone={STATE[row.state].tone}>{STATE[row.state].word}</Badge>
                <span className={loader.label}>{row.label}</span>
                <span className={loader.detail}>{row.detail}</span>
              </li>
            ))}
          </ul>

          {read.checks.length > 0 && (
            <>
              <h4 className={loader.subtitle}>
                {read.checks.length === 1 ? "1 thing to check" : `${read.checks.length} things to check`}
              </h4>
              <ul className={loader.list}>
                {read.checks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}

          {read.problems.length > 0 && (
            <>
              <h4 className={loader.subtitle}>Before it can be saved</h4>
              <ul className={`${loader.list} ${loader.problems}`}>
                {read.problems.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}

          {read.replaces && <p className={loader.muted}>{`Saving replaces “${read.replaces}”, loaded now.`}</p>}

          <div className={loader.actions}>
            <Button type="button" onClick={save} disabled={busy || read.problems.length > 0}>
              Save
            </Button>
          </div>
        </div>
      )}

      <p className={styles.readLink}>
        <Link href={facilitatorGuidePath(courseId)}>Open the facilitator guide</Link> to read
        it as its facilitators do.
      </p>
    </Card>
  );
}
