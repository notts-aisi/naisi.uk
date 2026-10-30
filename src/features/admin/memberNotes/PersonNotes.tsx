"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import CountedTextarea from "@/components/ui/CountedTextarea";
import MemberText from "@/components/ui/MemberText";
import Select from "@/components/ui/Select";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { MEMBER_NOTE_LIMITS, type MemberNoteView } from "@/lib/memberNotes/model";
import { DRAFT_WORDS, NOTES_WORDS } from "@/lib/memberNotes/words";
import styles from "./PersonNotes.module.css";

/**
 * NOTES ABOUT A PERSON, for admins (privacy v13; `src/lib/memberNotes/`).
 *
 * Drawn on the person's own page in the admin area (`place="profile"`: every
 * note), on a programme's page about them (`place={{ run }}`: notes written
 * after they agreed to privacy v13, and earlier ones written from that run),
 * and beside their application (`place="application"`: only notes written
 * after they agreed). The route decides which notes each place is sent; this
 * component says the rule in one line and marks every note written before
 * the agreement.
 *
 * Everything goes through `/api/admin/members/[uid]/notes`, which refuses
 * everybody but an admin, and an admin the notes about themselves: no
 * browser reads the collection. Claude's draft (`draft="picker"` on the
 * profile, `draft="run"` on a programme's page) fills the box and is kept
 * only when the admin presses Save note, marked as drafted by Claude.
 */

export type NotesPlaceProp = "profile" | "application" | { run: string };

type Props = {
  uid: string;
  firstName: string;
  place: NotesPlaceProp;
  /** Offer Claude's draft: with a programme picker (the profile), from this run, or not at all. */
  draft?: "picker" | "run" | "none";
  /** A smaller head, for a narrow column beside other blocks (the application screen). */
  compact?: boolean;
};

type RunOption = { runId: string; programme: string };

type Payload = {
  notes: MemberNoteView[];
  hidden: number;
  agreed: boolean;
  runs: RunOption[];
  claude: boolean;
};

function readPayload(body: unknown): Payload | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.notes)) return null;
  return {
    notes: raw.notes as MemberNoteView[],
    hidden: typeof raw.hidden === "number" ? raw.hidden : 0,
    agreed: raw.agreed === true,
    runs: Array.isArray(raw.runs) ? (raw.runs as RunOption[]) : [],
    claude: raw.claude === true,
  };
}

function placeQuery(place: NotesPlaceProp): string {
  if (place === "profile") return "place=profile";
  if (place === "application") return "place=application";
  return `place=run&run=${encodeURIComponent(place.run)}`;
}

/** "Tue 3 Nov", in London time. */
function day(iso: string | null): string {
  return iso ? formatSiteDate(new Date(iso), { weekday: "short", day: "numeric", month: "short" }) : "";
}

export default function PersonNotes({ uid, firstName, place, draft = "none", compact = false }: Props) {
  const base = `/api/admin/members/${encodeURIComponent(uid)}/notes`;
  const runOfPlace = typeof place === "object" ? place.run : null;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [runId, setRunId] = useState<string>(runOfPlace ?? "");
  const [drafted, setDrafted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const res = await fetch(`${base}?${placeQuery(place)}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (isCancelled()) return;
        const read = res.ok ? readPayload(body) : null;
        if (!read) {
          setLoadError((body as { error?: string } | null)?.error ?? NOTES_WORDS.loadFailed);
          return;
        }
        setPayload(read);
        setLoadError(null);
      } catch {
        if (!isCancelled()) setLoadError(NOTES_WORDS.loadFailed);
      }
    },
    // `place` is an object for a run; its run id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, typeof place === "object" ? place.run : place],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return null;
      const answer = (await res.json().catch(() => null)) as { error?: string } | null;
      return answer?.error ?? NOTES_WORDS.saveFailed;
    } catch {
      return NOTES_WORDS.saveFailed;
    }
  }

  function startAdding() {
    setComposing(true);
    setText("");
    setDrafted(false);
    setRunId(runOfPlace ?? "");
    setProblem(null);
  }

  async function onAdd() {
    setBusy("add");
    setProblem(null);
    const error = await send(base, "POST", { text, runId: runId || null, draftedByClaude: drafted });
    setBusy(null);
    if (error) {
      setProblem(error);
      return;
    }
    setComposing(false);
    setText("");
    setDrafted(false);
    await load(() => false);
  }

  async function onDraft(from: string) {
    if (!from) return;
    setBusy("draft");
    setProblem(null);
    try {
      const res = await fetch(`${base}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: from }),
      });
      const body = (await res.json().catch(() => null)) as { text?: unknown; error?: string } | null;
      if (!res.ok || typeof body?.text !== "string") {
        setProblem(body?.error ?? DRAFT_WORDS.failed);
        return;
      }
      setComposing(true);
      setText(body.text.slice(0, MEMBER_NOTE_LIMITS.text));
      setRunId(from);
      setDrafted(true);
    } catch {
      setProblem(DRAFT_WORDS.failed);
    } finally {
      setBusy(null);
    }
  }

  async function onSaveEdit(noteId: string) {
    setBusy(`edit:${noteId}`);
    setProblem(null);
    const error = await send(`${base}/${encodeURIComponent(noteId)}`, "PATCH", { text: editText });
    setBusy(null);
    if (error) {
      setProblem(error);
      return;
    }
    setEditingId(null);
    await load(() => false);
  }

  async function onRemove(noteId: string) {
    if (!window.confirm(NOTES_WORDS.confirmRemove)) return;
    setBusy(`remove:${noteId}`);
    setProblem(null);
    const error = await send(`${base}/${encodeURIComponent(noteId)}`, "DELETE");
    setBusy(null);
    if (error) {
      setProblem(error === NOTES_WORDS.saveFailed ? NOTES_WORDS.removeFailed : error);
      return;
    }
    await load(() => false);
  }

  const rule =
    place === "profile" ? NOTES_WORDS.ruleProfile : place === "application" ? NOTES_WORDS.ruleApplication : NOTES_WORDS.ruleRun;
  const titleId = `notes-${uid}`;

  return (
    <section className={styles.notes} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={compact ? styles.titleCompact : styles.title}>
          {NOTES_WORDS.title(firstName)}
        </h2>
        <span className={`meta ${styles.tag}`}>{NOTES_WORDS.whoReads}</span>
      </div>
      <p className={styles.line}>{NOTES_WORDS.neverShown(firstName)}</p>
      <p className={styles.rule}>{rule}</p>

      {loadError && (
        <div className={styles.row}>
          <p className={styles.problem} role="alert">
            {loadError}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load(() => false)}>
            {NOTES_WORDS.retry}
          </Button>
        </div>
      )}

      {payload && (
        <>
          {payload.hidden > 0 && place !== "profile" && (
            <p className={styles.line}>
              {place === "application" ? NOTES_WORDS.hiddenBesideApplication(payload.hidden) : NOTES_WORDS.hiddenOnRun(payload.hidden)}
            </p>
          )}

          {payload.notes.length === 0 ? (
            <p className={styles.line}>{NOTES_WORDS.empty}</p>
          ) : (
            <ul className={styles.list}>
              {payload.notes.map((note) => (
                <li key={note.id} className={`${styles.note} ${note.beforeAgreement ? styles.before : ""}`}>
                  {note.beforeAgreement && (
                    <p className={styles.warning}>
                      {note.programme ? NOTES_WORDS.beforeFrom(note.programme) : NOTES_WORDS.beforeNoProgramme}
                    </p>
                  )}
                  {editingId === note.id ? (
                    <div className={styles.compose}>
                      <label className={styles.label} htmlFor={`edit-${note.id}`}>
                        {NOTES_WORDS.label}
                      </label>
                      <CountedTextarea
                        id={`edit-${note.id}`}
                        value={editText}
                        max={MEMBER_NOTE_LIMITS.text}
                        rows={5}
                        onChange={(event) => setEditText(event.target.value)}
                      />
                      <div className={styles.row}>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy !== null || !editText.trim()}
                          onClick={() => void onSaveEdit(note.id)}
                        >
                          {busy === `edit:${note.id}` ? NOTES_WORDS.saving : NOTES_WORDS.save}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setEditingId(null)}>
                          {NOTES_WORDS.cancel}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <MemberText text={note.text} className={styles.text} />
                  )}
                  <div className={styles.meta}>
                    <span>
                      {note.mine ? NOTES_WORDS.you : NOTES_WORDS.by(note.authorName)}
                      {note.createdAt ? `, ${day(note.createdAt)}` : ""}
                      {note.edited && note.updatedAt ? `, ${NOTES_WORDS.edited(day(note.updatedAt))}` : ""}
                    </span>
                    {note.draftedByClaude && (
                      <Chip tone="accent" size="sm">
                        {NOTES_WORDS.draftedByClaude}
                      </Chip>
                    )}
                    {note.programme && !note.beforeAgreement && (
                      <Chip tone="neutral" size="sm">
                        {NOTES_WORDS.from(note.programme)}
                      </Chip>
                    )}
                  </div>
                  {editingId !== note.id && (
                    <div className={styles.row}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => {
                          setEditingId(note.id);
                          setEditText(note.text);
                          setProblem(null);
                        }}
                      >
                        {NOTES_WORDS.edit}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void onRemove(note.id)}>
                        {busy === `remove:${note.id}` ? NOTES_WORDS.saving : NOTES_WORDS.remove}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {composing ? (
            <div className={styles.compose}>
              {drafted && <p className={styles.drafted}>{DRAFT_WORDS.drafted}</p>}
              <label className={styles.label} htmlFor={`new-note-${uid}`}>
                {NOTES_WORDS.label}
              </label>
              <CountedTextarea
                id={`new-note-${uid}`}
                value={text}
                max={MEMBER_NOTE_LIMITS.text}
                rows={6}
                onChange={(event) => setText(event.target.value)}
              />
              {runOfPlace === null && payload.runs.length > 0 && (
                <>
                  <label className={styles.label} htmlFor={`new-note-run-${uid}`}>
                    {DRAFT_WORDS.pickRun}
                  </label>
                  <Select
                    id={`new-note-run-${uid}`}
                    value={runId}
                    disabled={drafted}
                    onChange={(event) => setRunId(event.target.value)}
                  >
                    <option value="">{NOTES_WORDS.notFromProgramme}</option>
                    {payload.runs.map((run) => (
                      <option key={run.runId} value={run.runId}>
                        {run.programme}
                      </option>
                    ))}
                  </Select>
                </>
              )}
              <div className={styles.row}>
                <Button type="button" disabled={busy !== null || !text.trim()} onClick={() => void onAdd()}>
                  {busy === "add" ? NOTES_WORDS.saving : NOTES_WORDS.save}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => {
                    setComposing(false);
                    setDrafted(false);
                    setProblem(null);
                  }}
                >
                  {NOTES_WORDS.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.row}>
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={startAdding}>
                {NOTES_WORDS.add}
              </Button>
            </div>
          )}

          {draft !== "none" && !composing && (
            <ClaudeDraft
              payload={payload}
              draft={draft}
              runOfPlace={runOfPlace}
              runId={runId}
              setRunId={setRunId}
              busy={busy}
              onDraft={(from) => void onDraft(from)}
              uid={uid}
            />
          )}

          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** "Draft a note with Claude", or the one sentence that says why it cannot. */
function ClaudeDraft({
  payload,
  draft,
  runOfPlace,
  runId,
  setRunId,
  busy,
  onDraft,
  uid,
}: {
  payload: Payload;
  draft: "picker" | "run";
  runOfPlace: string | null;
  runId: string;
  setRunId: (runId: string) => void;
  busy: string | null;
  onDraft: (runId: string) => void;
  uid: string;
}) {
  if (!payload.claude) return <p className={styles.line}>{DRAFT_WORDS.notSetUp}</p>;
  if (!payload.agreed) return <p className={styles.line}>{DRAFT_WORDS.noAgreement}</p>;
  if (draft === "picker" && payload.runs.length === 0) return <p className={styles.line}>{DRAFT_WORDS.noRuns}</p>;
  // The run Claude drafts from: this page's, the only one, or the one picked.
  const target = runOfPlace ?? (payload.runs.length === 1 ? payload.runs[0].runId : runId);
  return (
    <div className={styles.draft}>
      <p className={styles.line}>{DRAFT_WORDS.hint}</p>
      <div className={styles.row}>
        {draft === "picker" && payload.runs.length > 1 && (
          <>
            <label className={styles.label} htmlFor={`draft-run-${uid}`}>
              {DRAFT_WORDS.pickRun}
            </label>
            <Select id={`draft-run-${uid}`} value={runId} onChange={(event) => setRunId(event.target.value)}>
              <option value="">{NOTES_WORDS.chooseProgramme}</option>
              {payload.runs.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.programme}
                </option>
              ))}
            </Select>
          </>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null || !target}
          onClick={() => onDraft(target)}
        >
          {busy === "draft" ? DRAFT_WORDS.drafting : DRAFT_WORDS.button}
        </Button>
      </div>
    </div>
  );
}
