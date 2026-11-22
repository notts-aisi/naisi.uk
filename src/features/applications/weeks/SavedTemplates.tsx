"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import type { TemplateListRow } from "@/lib/courses/weeksTab/templates";
import {
  COPY_IT_IN,
  DELETE_ASK,
  DELETE_TEMPLATE_BODY,
  DELETE_THE_TEMPLATE,
  KEEP_IT,
  SAVED_TEMPLATES,
  SAVE_AS_TEMPLATE,
  SAVE_THE_TEMPLATE,
  TEMPLATE_HOLDS,
  TEMPLATE_NAME,
  copiedInWords,
  deleteTemplateTitle,
  deletedWords,
  noTemplatesWords,
  savedTemplateWords,
  templateLine,
  templateNameExample,
} from "@/lib/courses/weeksTab/words";
import { TEMPLATE_LIMITS } from "@/lib/firestore/courseTemplates";
import styles from "./weeks.module.css";
import own from "./templates.module.css";

/**
 * SAVED TEMPLATES on "Copy weeks from the course": each saved template of
 * the course with who saved it and when, "Copy it in", and for an admin
 * "Delete…" with its question; then, for an admin, "Save this term's weeks
 * as a template".
 *
 * Each press is one of the routes that exist, and each route decides who may:
 *
 *  - Copy it in: `POST /api/courses/runs/[runId]/apply-template` with
 *    `fill: true`, ALWAYS, so it writes only the weeks that are empty and
 *    never a week with anything in it (the programme's lead and admins);
 *  - Delete the template: `DELETE /api/courses/templates/[templateId]`
 *    (admins);
 *  - Save the template: `POST /api/courses/[courseId]/templates` with this
 *    run as the source (admins).
 *
 * The route's own counts are said after each, and the page is read again
 * from the server. Nothing is emailed. Nothing works before the page's
 * script has arrived (`useHydrated`), so a press is never lost.
 */

type Said = { at: string; tone: "done" | "error"; text: string };

async function send(url: string, method: "POST" | "DELETE", body?: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, body: json };
  } catch {
    return { ok: false, body: { error: "That didn’t reach the site. Check your connection, then try again." } };
  }
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const errorOf = (body: Record<string, unknown>, fallback: string) => (typeof body.error === "string" ? body.error : fallback);

export default function SavedTemplates({
  runId,
  courseId,
  courseTitle,
  weeksOnRun,
  rows,
  isAdmin,
}: {
  runId: string;
  courseId: string;
  courseTitle: string;
  /** The run's taught weeks, for the name box's example. */
  weeksOnRun: number;
  rows: TemplateListRow[];
  /** An admin deletes and saves templates; the programme's lead copies them in. */
  isAdmin: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  const [asking, setAsking] = useState<TemplateListRow | null>(null);
  const [name, setName] = useState("");
  const idle = hydrated && !busy;

  async function copyIn(row: TemplateListRow) {
    setBusy(true);
    setSaid(null);
    const answer = await send(`/api/courses/runs/${encodeURIComponent(runId)}/apply-template`, "POST", { templateId: row.id, fill: true });
    if (answer.ok) {
      setSaid({ at: row.id, tone: "done", text: copiedInWords(count(answer.body.copied), count(answer.body.left), count(answer.body.extra)) });
      router.refresh();
    } else {
      setSaid({ at: row.id, tone: "error", text: errorOf(answer.body, "Couldn’t copy that template in. Try again.") });
    }
    setBusy(false);
  }

  async function remove(row: TemplateListRow): Promise<void> {
    setBusy(true);
    setSaid(null);
    const answer = await send(`/api/courses/templates/${encodeURIComponent(row.id)}`, "DELETE");
    if (answer.ok) {
      setAsking(null);
      setSaid({ at: "list", tone: "done", text: deletedWords(row.label) });
      router.refresh();
    } else {
      setSaid({ at: "dialog", tone: "error", text: errorOf(answer.body, "Couldn’t delete that template. Try again.") });
    }
    setBusy(false);
  }

  async function save() {
    const label = name.trim();
    setBusy(true);
    setSaid(null);
    const answer = await send(`/api/courses/${encodeURIComponent(courseId)}/templates`, "POST", { label, sourceRunId: runId });
    if (answer.ok) {
      setName("");
      setSaid({ at: "save", tone: "done", text: savedTemplateWords(label) });
      router.refresh();
    } else {
      setSaid({ at: "save", tone: "error", text: errorOf(answer.body, "Couldn’t save that template. Try again.") });
    }
    setBusy(false);
  }

  const line = (at: string) =>
    said?.at === at ? (
      <p className={said.tone === "error" ? styles.problem : styles.done} role={said.tone === "error" ? "alert" : "status"}>
        {said.text}
      </p>
    ) : null;

  return (
    <>
      <section className={styles.panel} aria-labelledby="saved-templates-title">
        <h2 id="saved-templates-title" className={styles.subheading}>
          {SAVED_TEMPLATES}
        </h2>
        {rows.length === 0 ? (
          <p className={styles.muted}>{noTemplatesWords(courseTitle)}</p>
        ) : (
          <ul className={styles.sources}>
            {rows.map((row) => (
              <li key={row.id} className={styles.source}>
                <span className={own.templateText}>
                  <span className={styles.sourceName}>{row.label}</span>
                  <span className={styles.sourceCount}>{templateLine(row.savedOn, row.savedBy, row.weeks)}</span>
                </span>
                <span className={own.templateActions}>
                  <button type="button" className={styles.button} onClick={() => void copyIn(row)} disabled={!idle}>
                    {COPY_IT_IN}
                  </button>
                  {isAdmin && (
                    <button type="button" className={own.linkButton} onClick={() => { setSaid(null); setAsking(row); }} disabled={!idle}>
                      {DELETE_ASK}
                    </button>
                  )}
                </span>
                {line(row.id)}
              </li>
            ))}
          </ul>
        )}
        {line("list")}
      </section>

      {isAdmin && (
        <section className={styles.panel} aria-labelledby="save-template-title">
          <h2 id="save-template-title" className={styles.subheading}>
            {SAVE_AS_TEMPLATE}
          </h2>
          <form
            className={own.saveForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (idle && name.trim()) void save();
            }}
          >
            <label className={own.field}>
              <span className={own.fieldLabel}>{TEMPLATE_NAME}</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={templateNameExample(courseTitle, weeksOnRun)}
                maxLength={TEMPLATE_LIMITS.label}
                required
              />
            </label>
            <p className={styles.muted}>{TEMPLATE_HOLDS}</p>
            <div>
              <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`} disabled={!idle || name.trim() === ""}>
                {SAVE_THE_TEMPLATE}
              </button>
            </div>
            {line("save")}
          </form>
        </section>
      )}

      {isAdmin && (
        <Modal open={asking !== null} onClose={() => setAsking(null)} ariaLabel={asking ? deleteTemplateTitle(asking.label) : DELETE_THE_TEMPLATE} width="sm">
          {(dismiss) =>
            asking && (
              <section className={own.dialog} aria-labelledby="delete-template-title">
                <div className={own.dialogHead}>
                  <h2 id="delete-template-title" className={styles.subheading}>
                    {deleteTemplateTitle(asking.label)}
                  </h2>
                  <button type="button" className={own.close} aria-label="Close" onClick={dismiss} disabled={busy}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
                <p>{DELETE_TEMPLATE_BODY}</p>
                {line("dialog")}
                <div className={styles.actions}>
                  <button type="button" className={styles.button} onClick={dismiss} disabled={busy}>
                    {KEEP_IT}
                  </button>
                  <button type="button" className={`${styles.button} ${own.buttonCareful}`} onClick={() => void remove(asking)} disabled={busy}>
                    {DELETE_THE_TEMPLATE}
                  </button>
                </div>
              </section>
            )
          }
        </Modal>
      )}
    </>
  );
}
