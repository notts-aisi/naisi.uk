"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { EditorItem } from "@/lib/courses/weekEdit/editor";
import { changesOf, countLine, draftOf, hostOf, rangeWords, saveScope, type Draft, type Reach } from "@/lib/courses/weekEdit/pageModel";
import { DUE_CHOICE, PANEL_WORDS, SOURCE_KIND_ORDER } from "@/lib/courses/weekEdit/pageWords";
import { EDIT_REFUSAL, KIND_LABEL } from "@/lib/courses/weekEdit/words";
import { SOURCE_KIND_LABEL, WHENS, type SourceKind, type When } from "@/lib/courses/weekBlocks/model";
import type { LockHolder } from "./useWeekLock";
import styles from "./editWeek.module.css";

/**
 * CHANGING ONE BLOCK WHERE IT STANDS: the side panel (a sheet on a phone)
 * for a source, a text, a reflection or a written answer, filled from the
 * editor's fields for the block and saved through
 * `PATCH /api/courses/runs/[runId]/weeks/[weekId]/blocks/[blockId]`.
 *
 * WHAT A SAVE SENDS: the block's fingerprint as the panel opened it, and only
 * the fields whose boxes changed (`changesOf`). A changed link says it is the
 * same reading at a new address, which keeps every tick; "a different
 * reading" is not offered, and one line says it is done by pasting the week.
 * Nothing about a block's ids is ever sent or changed here, so every tick
 * and answer stays with it.
 *
 * THE ROUTE'S REFUSALS ARE SHOWN AS THEY COME. A block changed since the
 * panel opened (somebody pasted meanwhile) reads the week again and offers
 * the block as it is now, keeping what was typed until that is chosen; a
 * week somebody else holds names them and turns every editing control off;
 * anything else is the route's own sentence under the boxes.
 */

export type SavedBlock = {
  saveId: string | null;
  summary: string;
  followed: string[];
  live: boolean;
};

export default function BlockPanel({
  item,
  latest,
  runId,
  weekId,
  weekNumber,
  programme,
  reach,
  live,
  lost,
  lockedBy,
  onClose,
  onSaved,
  onRefusedBy,
  onStale,
}: {
  /** The block as the panel opened it: its fingerprint is what a save echoes. */
  item: EditorItem;
  /** The same block as the page read it last, or null once it has gone from the week. */
  latest: EditorItem | null;
  runId: string;
  weekId: string;
  weekNumber: number;
  programme: string;
  reach: Reach;
  live: boolean;
  /** This page's hold on the week ended while the panel was open. */
  lost: boolean;
  /** Somebody else is editing the week: the save is off. */
  lockedBy: LockHolder | null;
  onClose: () => void;
  onSaved: (saved: SavedBlock) => void;
  onRefusedBy: (holder: LockHolder, line: string) => void;
  /** The block changed since it opened: read the week again. */
  onStale: () => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [opened, setOpened] = useState(item);
  const stored = opened.fields;
  const [draft, setDraft] = useState<Draft | null>(stored ? draftOf(stored) : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  if (!stored || !draft) return null;
  const off = !hydrated || busy || lockedBy !== null;
  const title = PANEL_WORDS.title(KIND_LABEL[opened.type], opened.partNumber);
  const count = countLine(opened.type, opened.counts);
  const scope = saveScope(reach, programme);

  function edit(next: Draft) {
    setDraft(next);
    setNote(null);
  }

  async function save() {
    if (!stored || !draft) return;
    setProblem(null);
    setNote(null);
    const changes = changesOf(stored, draft);
    if (changes === null) {
      setNote(PANEL_WORDS.nothingChanged);
      return;
    }
    if ("error" in changes) {
      setProblem(changes.error);
      return;
    }
    setBusy(true);
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const res = await fetch(
        `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/blocks/${encodeURIComponent(opened.blockId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base: opened.fingerprint, fields: changes.fields, ...(changes.reading ? { reading: changes.reading } : {}) }),
        },
      );
      status = res.status;
      body = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } catch {
      setBusy(false);
      setProblem("Couldn’t reach the site. Check your connection: nothing may have been saved.");
      return;
    }
    setBusy(false);
    const error = typeof body.error === "string" ? body.error : "That didn’t save. Try again.";
    if (status === 200) {
      if (body.saved !== true) {
        setNote(PANEL_WORDS.nothingChanged);
        return;
      }
      onSaved({
        saveId: typeof body.saveId === "string" ? body.saveId : null,
        summary: typeof body.summary === "string" ? body.summary : "",
        followed: Array.isArray(body.followed) ? body.followed.filter((line): line is string => typeof line === "string") : [],
        live: body.live === true,
      });
      return;
    }
    setProblem(error);
    const holder = body.holder as LockHolder | undefined;
    if (status === 409 && holder && typeof holder.name === "string") {
      onRefusedBy(holder, error);
      return;
    }
    if (status === 409 && (error === EDIT_REFUSAL.blockChanged || error === EDIT_REFUSAL.blockGone)) {
      setStale(true);
      onStale();
    }
  }

  function openAgain() {
    if (!latest || !latest.fields) {
      onClose();
      return;
    }
    setOpened(latest);
    setDraft(draftOf(latest.fields));
    setStale(false);
    setProblem(null);
    setNote(null);
  }

  const field = (name: string) => `${ids}-${name}`;
  const was = (before: string, now: string) =>
    before !== now ? <p className={styles.was}>{PANEL_WORDS.was(before)}</p> : null;

  return (
    <section className={styles.panel} aria-labelledby={`${ids}-title`}>
      <div className={styles.panelHead}>
        <div className={styles.panelHeadText}>
          <h2 id={`${ids}-title`} className={styles.panelTitle}>
            {title}
          </h2>
          {count && <p className={styles.panelCount}>{count}</p>}
        </div>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {PANEL_WORDS.close}
        </Button>
      </div>

      {lost && (
        <p className={styles.problem} role="alert">
          {PANEL_WORDS.lost}
        </p>
      )}

      {draft.type === "source" && stored.type === "source" && (
        <>
          <Field id={field("title")} label={PANEL_WORDS.title_}>
            <Textarea
              id={field("title")}
              rows={2}
              value={draft.fields.title}
              disabled={off}
              onChange={(e) => edit({ ...draft, fields: { ...draft.fields, title: e.target.value } })}
            />
          </Field>
          {was(stored.fields.title, draft.fields.title)}
          <Field id={field("url")} label={PANEL_WORDS.link}>
            <Input
              id={field("url")}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draft.fields.url}
              disabled={off}
              onChange={(e) => edit({ ...draft, fields: { ...draft.fields, url: e.target.value } })}
            />
          </Field>
          {stored.fields.url !== draft.fields.url && (
            <div className={styles.callout}>
              <p className={styles.calloutLine}>
                {stored.fields.url ? PANEL_WORDS.was(hostOf(stored.fields.url) || stored.fields.url) : PANEL_WORDS.was("")}
              </p>
              <p className={styles.calloutLine}>{PANEL_WORDS.sameReading(opened.counts.ticks)}</p>
              <p className={styles.calloutQuiet}>{PANEL_WORDS.differentReading}</p>
            </div>
          )}
          <div className={styles.fieldRow}>
            <Field id={field("kind")} label={PANEL_WORDS.kind}>
              <Select
                id={field("kind")}
                value={draft.fields.kind}
                disabled={off}
                onChange={(e) => edit({ ...draft, fields: { ...draft.fields, kind: e.target.value as SourceKind } })}
              >
                {SOURCE_KIND_ORDER.map((kind) => (
                  <option key={kind} value={kind}>
                    {SOURCE_KIND_LABEL[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={field("by")} label={PANEL_WORDS.by}>
              <Input id={field("by")} value={draft.fields.by} disabled={off} onChange={(e) => edit({ ...draft, fields: { ...draft.fields, by: e.target.value } })} />
            </Field>
          </div>
          <div className={styles.fieldRow}>
            <Field id={field("date")} label={PANEL_WORDS.date}>
              <Input id={field("date")} value={draft.fields.date} disabled={off} onChange={(e) => edit({ ...draft, fields: { ...draft.fields, date: e.target.value } })} />
            </Field>
            <Field id={field("time")} label={PANEL_WORDS.time}>
              <Input id={field("time")} value={draft.fields.time} disabled={off} onChange={(e) => edit({ ...draft, fields: { ...draft.fields, time: e.target.value } })} />
            </Field>
          </div>
          <Field id={field("note")} label={PANEL_WORDS.note} hint={PANEL_WORDS.noteHint}>
            <Input id={field("note")} value={draft.fields.note} disabled={off} onChange={(e) => edit({ ...draft, fields: { ...draft.fields, note: e.target.value } })} />
          </Field>
          <p className={styles.callout}>{PANEL_WORDS.ticksLine(opened.counts.ticks)}</p>
        </>
      )}

      {draft.type === "text" && stored.type === "text" && (
        <>
          {stored.fields.headingAllowed ? (
            <Field id={field("heading")} label={PANEL_WORDS.heading}>
              <Input
                id={field("heading")}
                value={draft.fields.heading}
                disabled={off}
                onChange={(e) => edit({ ...draft, fields: { ...draft.fields, heading: e.target.value } })}
              />
            </Field>
          ) : (
            <p className={styles.quiet}>{PANEL_WORDS.noHeadingHere}</p>
          )}
          {stored.fields.timeAllowed && (
            <Field id={field("time")} label={PANEL_WORDS.time}>
              <Input id={field("time")} value={draft.fields.time} disabled={off} onChange={(e) => edit({ ...draft, fields: { ...draft.fields, time: e.target.value } })} />
            </Field>
          )}
          <Field id={field("body")} label={PANEL_WORDS.words} hint={PANEL_WORDS.markdownHint}>
            <Textarea
              id={field("body")}
              className={styles.markdown}
              rows={10}
              spellCheck
              value={draft.fields.body}
              disabled={off}
              onChange={(e) => edit({ ...draft, fields: { ...draft.fields, body: e.target.value } })}
            />
          </Field>
        </>
      )}

      {draft.type === "reflection" && stored.type === "reflection" && (
        <>
          {draft.fields.prompts.map((prompt, at) => (
            <div key={prompt.id}>
              <Field id={field(`prompt-${at}`)} label={PANEL_WORDS.prompt(at + 1, draft.fields.prompts.length)}>
                <Textarea
                  id={field(`prompt-${at}`)}
                  rows={3}
                  value={prompt.text}
                  disabled={off}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      fields: { prompts: draft.fields.prompts.map((each, i) => (i === at ? { ...each, text: e.target.value } : each)) },
                    })
                  }
                />
              </Field>
              {was(stored.fields.prompts[at]?.text ?? "", prompt.text)}
            </div>
          ))}
          <p className={styles.quiet}>{PANEL_WORDS.promptsFixed}</p>
          <p className={styles.callout}>{PANEL_WORDS.answersLine(opened.counts.answers)}</p>
        </>
      )}

      {draft.type === "writtenAnswer" && stored.type === "writtenAnswer" && (
        <>
          {stored.fields.heading !== null && (
            <Field id={field("heading")} label={PANEL_WORDS.answerHeading} hint={PANEL_WORDS.answerHeadingHint}>
              <Input
                id={field("heading")}
                value={draft.fields.heading}
                disabled={off}
                onChange={(e) => edit({ ...draft, fields: { ...draft.fields, heading: e.target.value } })}
              />
            </Field>
          )}
          <Field id={field("question")} label={PANEL_WORDS.question} hint={PANEL_WORDS.markdownHint}>
            <Textarea
              id={field("question")}
              className={styles.markdown}
              rows={6}
              value={draft.fields.question}
              disabled={off}
              onChange={(e) => edit({ ...draft, fields: { ...draft.fields, question: e.target.value } })}
            />
          </Field>
          <Field id={field("guidance")} label={PANEL_WORDS.guidance}>
            <Textarea
              id={field("guidance")}
              className={styles.markdown}
              rows={4}
              value={draft.fields.guidance}
              disabled={off}
              onChange={(e) => edit({ ...draft, fields: { ...draft.fields, guidance: e.target.value } })}
            />
          </Field>
          {stored.fields.boxes.length > 0 ? (
            <p className={styles.quiet}>{PANEL_WORDS.boxes(stored.fields.boxes.map((box) => box.label))}</p>
          ) : (
            <>
              <div className={styles.fieldRow}>
                <Field id={field("min")} label={PANEL_WORDS.wordsAtLeast}>
                  <Input
                    id={field("min")}
                    inputMode="numeric"
                    value={draft.fields.min}
                    disabled={off}
                    onChange={(e) => edit({ ...draft, fields: { ...draft.fields, min: e.target.value } })}
                  />
                </Field>
                <Field id={field("max")} label={PANEL_WORDS.wordsAtMost}>
                  <Input
                    id={field("max")}
                    inputMode="numeric"
                    value={draft.fields.max}
                    disabled={off}
                    onChange={(e) => edit({ ...draft, fields: { ...draft.fields, max: e.target.value } })}
                  />
                </Field>
              </div>
              {was(
                stored.fields.words ? `${stored.fields.words.min} to ${stored.fields.words.max}` : "",
                draft.fields.min.trim() || draft.fields.max.trim() ? `${draft.fields.min.trim()} to ${draft.fields.max.trim()}` : "",
              )}
              <p className={styles.quiet}>{PANEL_WORDS.wordsHint}</p>
            </>
          )}
          <Field id={field("due")} label={PANEL_WORDS.due} hint={opened.counts.sent > 0 ? PANEL_WORDS.dueFixed(opened.counts.sent) : undefined}>
            <Select
              id={field("due")}
              value={draft.fields.due}
              disabled={off || opened.counts.sent > 0}
              onChange={(e) => edit({ ...draft, fields: { ...draft.fields, due: e.target.value as When } })}
            >
              {WHENS.map((when) => (
                <option key={when} value={when}>
                  {DUE_CHOICE[when]}
                </option>
              ))}
            </Select>
          </Field>
          <p className={styles.callout}>{PANEL_WORDS.sentLine(opened.counts.sent, rangeWords(stored.fields.words))}</p>
        </>
      )}

      <div className={styles.scope}>
        <p className={styles.scopeLabel}>{PANEL_WORDS.saveFor}</p>
        <div className={styles.scopeCard}>
          <p className={styles.scopeTitle}>{scope.title}</p>
          <p className={styles.scopeLine}>{scope.line}</p>
        </div>
      </div>

      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.panelActions}>
        {stale ? (
          <Button type="button" onClick={openAgain} disabled={!hydrated}>
            {PANEL_WORDS.openAgain}
          </Button>
        ) : (
          <Button type="button" onClick={() => void save()} disabled={off}>
            {busy ? PANEL_WORDS.saving : PANEL_WORDS.save}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {PANEL_WORDS.cancel}
        </Button>
      </div>
      {draft.type === "writtenAnswer" && stored.type === "writtenAnswer" && stored.fields.boxes.length === 0 && (
        <p className={styles.quiet}>{PANEL_WORDS.followRange(opened.partNumber)}</p>
      )}
      <p className={styles.quiet}>{live ? PANEL_WORDS.liveLine(weekNumber) : PANEL_WORDS.notLiveLine(weekNumber)}</p>
    </section>
  );
}
