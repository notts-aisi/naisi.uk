"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import CountedTextarea from "@/components/ui/CountedTextarea";
import MemberText from "@/components/ui/MemberText";
import OptionRow from "@/components/ui/OptionRow";
import Select from "@/components/ui/Select";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  MEMBER_NOTE_LIMITS,
  NOTE_AUDIENCES,
  NOTE_SUGGESTIONS,
  type NoteAudience,
  type NoteSuggestion,
} from "@/lib/memberNotes/model";
import { DRAFT_WORDS, NOTES_WORDS } from "@/lib/memberNotes/words";
import styles from "./PersonNotes.module.css";

/**
 * NOTES THE TEAM KEEPS ABOUT A PERSON (privacy v13 and v15; `src/lib/memberNotes/`).
 *
 * FOR AN ADMIN, drawn on the person's own page in the admin area
 * (`place="profile"`: every note), on a programme's page about them
 * (`place={{ run }}`: notes written after they agreed to privacy v13, and
 * earlier ones written from that run), and beside their application
 * (`place="application"`: only notes written after they agreed). The route
 * decides which notes each place is sent; this component says the rule in
 * one line and marks every note written before the agreement. Everything goes
 * through `/api/admin/members/[uid]/notes`, which refuses everybody but an
 * admin, and an admin the notes about themselves. Each note says who reads
 * it, and the admin chooses that for every note they write ("Admins only" or
 * "Admins and the programme's leads", with no choice made for them), and can
 * change it later; a note written before its person agreed to privacy v15 can
 * only ever be an admin's, and says so. Claude's draft (`draft="picker"` on
 * the profile, `draft="run"` on a programme's page) fills the box and is kept
 * only when the admin presses Save note, marked as drafted by Claude.
 *
 * FOR A PROGRAMME'S LEAD (`lead`), drawn beside a person's weeks on the
 * programme's Coursework tab: the notes kept for leads, through the
 * programme's own route, which decides which. The lead adds notes of their
 * own, always kept for admins and leads, and changes or deletes only those.
 * No Claude, no count of the notes they are not shown, and no choice of who
 * reads a note.
 *
 * Any note may suggest its person for next term; the boxes start unticked
 * and only a person ticks them. No browser reads the collection.
 */

export type NotesPlaceProp = "profile" | "application" | { run: string };

type Props = {
  uid: string;
  firstName: string;
  place: NotesPlaceProp;
  /**
   * A programme's lead, on the programme's page: the programme the notes are
   * read through. Absent: an admin, through the admins' route.
   */
  lead?: { roundId: string; programmeId: string };
  /** Offer Claude's draft, an admin's alone: with a programme picker (the profile), from this run, or not at all. */
  draft?: "picker" | "run" | "none";
  /**
   * No head of its own: the page frames it beside its other blocks (the
   * application screen), with a heading whose id is `notes-<uid>`.
   */
  compact?: boolean;
};

type RunOption = { runId: string; programme: string };

/** One note, as either route sends it. A lead is sent no v13 mark and nothing about sharing it. */
type NoteRow = {
  id: string;
  text: string;
  authorName: string | null;
  mine: boolean;
  draftedByClaude: boolean;
  programme: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  edited: boolean;
  beforeAgreement: boolean;
  audience: NoteAudience;
  leadsMayRead: boolean;
  suggest: NoteSuggestion[];
};

type Payload = {
  notes: NoteRow[];
  hidden: number;
  agreed: boolean;
  runs: RunOption[];
  claude: boolean;
  /** Whether a note written now may be kept for the programme's leads. */
  forLeads: boolean;
};

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function readNote(raw: unknown): NoteRow | null {
  if (!raw || typeof raw !== "object") return null;
  const note = raw as Record<string, unknown>;
  const id = text(note.id);
  if (!id) return null;
  return {
    id,
    text: text(note.text) ?? "",
    authorName: text(note.authorName),
    mine: note.mine === true,
    draftedByClaude: note.draftedByClaude === true,
    programme: text(note.programme),
    createdAt: text(note.createdAt),
    updatedAt: text(note.updatedAt),
    edited: note.edited === true,
    beforeAgreement: note.beforeAgreement === true,
    audience: note.audience === "leads" ? "leads" : "admins",
    leadsMayRead: note.leadsMayRead === true,
    suggest: NOTE_SUGGESTIONS.filter((key) => Array.isArray(note.suggest) && note.suggest.includes(key)),
  };
}

function readPayload(body: unknown): Payload | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.notes)) return null;
  return {
    notes: raw.notes.map(readNote).filter((note): note is NoteRow => note !== null),
    hidden: typeof raw.hidden === "number" ? raw.hidden : 0,
    agreed: raw.agreed === true,
    runs: Array.isArray(raw.runs) ? (raw.runs as RunOption[]) : [],
    claude: raw.claude === true,
    forLeads: raw.forLeads === true,
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

/** A list with one suggestion added or taken away, kept in the order a note shows them. */
function toggled(list: readonly NoteSuggestion[], key: NoteSuggestion, on: boolean): NoteSuggestion[] {
  return NOTE_SUGGESTIONS.filter((candidate) => (candidate === key ? on : list.includes(candidate)));
}

export default function PersonNotes({ uid, firstName, place, lead, draft = "none", compact = false }: Props) {
  const isLead = Boolean(lead);
  const base = lead
    ? `/api/admissions/forms/${encodeURIComponent(lead.roundId)}/programmes/${encodeURIComponent(lead.programmeId)}/people/${encodeURIComponent(uid)}/notes`
    : `/api/admin/members/${encodeURIComponent(uid)}/notes`;
  const listUrl = lead ? base : `${base}?${placeQuery(place)}`;
  const runOfPlace = typeof place === "object" ? place.run : null;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [runId, setRunId] = useState<string>(runOfPlace ?? "");
  const [audience, setAudience] = useState<NoteAudience | null>(null);
  const [suggest, setSuggest] = useState<NoteSuggestion[]>([]);
  const [drafted, setDrafted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editAudience, setEditAudience] = useState<NoteAudience | null>(null);
  const [editSuggest, setEditSuggest] = useState<NoteSuggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const res = await fetch(listUrl, { cache: "no-store" });
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
    [listUrl],
  );

  useEffect(() => {
    // The page can be left while the request is in flight, so the result is
    // dropped rather than written into an unmounted component.
    let cancelled = false;
    void (async () => {
      await load(() => cancelled);
    })();
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
    setDraftText("");
    setDrafted(false);
    setRunId(runOfPlace ?? "");
    setAudience(null);
    setSuggest([]);
    setProblem(null);
  }

  /** Who a new note is for, as this screen asks the route: a lead's is the route's to decide. */
  function audienceToSend(): NoteAudience | undefined {
    if (isLead) return undefined;
    return payload?.forLeads ? (audience ?? undefined) : "admins";
  }

  async function onAdd() {
    setBusy("add");
    setProblem(null);
    const body = isLead
      ? { text: draftText, suggest }
      : { text: draftText, audience: audienceToSend(), suggest, runId: runId || null, draftedByClaude: drafted };
    const error = await send(base, "POST", body);
    setBusy(null);
    if (error) {
      setProblem(error);
      return;
    }
    setComposing(false);
    setDraftText("");
    setDrafted(false);
    setAudience(null);
    setSuggest([]);
    await load(() => false);
  }

  async function onDraft(from: string) {
    if (!from) return;
    setBusy("draft");
    setProblem(null);
    try {
      const res = await fetch(`/api/admin/members/${encodeURIComponent(uid)}/notes/draft`, {
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
      setDraftText(body.text.slice(0, MEMBER_NOTE_LIMITS.text));
      setRunId(from);
      setDrafted(true);
      // Claude never ticks a suggestion, and never chooses who reads a note.
      setAudience(null);
      setSuggest([]);
    } catch {
      setProblem(DRAFT_WORDS.failed);
    } finally {
      setBusy(null);
    }
  }

  function startEditing(note: NoteRow) {
    setEditingId(note.id);
    setEditText(note.text);
    setEditAudience(note.audience);
    setEditSuggest(note.suggest);
    setProblem(null);
  }

  async function onSaveEdit(note: NoteRow) {
    setBusy(`edit:${note.id}`);
    setProblem(null);
    // Who reads it is sent only by an admin, and only for a note that may be kept for leads.
    const body = !isLead && note.leadsMayRead ? { text: editText, audience: editAudience, suggest: editSuggest } : { text: editText, suggest: editSuggest };
    const error = await send(`${base}/${encodeURIComponent(note.id)}`, "PATCH", body);
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

  const rule = isLead
    ? NOTES_WORDS.ruleLead
    : place === "profile"
      ? NOTES_WORDS.ruleProfile
      : place === "application"
        ? NOTES_WORDS.ruleApplication
        : NOTES_WORDS.ruleRun;
  const titleId = `notes-${uid}`;
  // A lead adds notes only about somebody who has agreed to privacy v15; an admin always may.
  const mayAdd = payload !== null && (!isLead || payload.forLeads);
  const addReady = draftText.trim().length > 0 && (isLead || !payload?.forLeads || audience !== null);

  const Frame = compact ? "div" : "section";
  return (
    <Frame className={styles.notes} aria-labelledby={compact ? undefined : titleId}>
      {!compact && (
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {NOTES_WORDS.title(firstName)}
          </h2>
        </div>
      )}
      <p className={styles.line}>
        {compact ? `${NOTES_WORDS.eachSays} ` : ""}
        {NOTES_WORDS.neverShown(firstName)}
      </p>
      <p className={styles.rule}>{rule}</p>

      {loadError && (
        <div className={styles.row}>
          <p className={styles.problem} role="alert">
            {loadError}
          </p>
          <Button type="button" variant="secondary" onClick={() => void load(() => false)}>
            {NOTES_WORDS.retry}
          </Button>
        </div>
      )}

      {payload && (
        <>
          {!isLead && payload.hidden > 0 && place !== "profile" && (
            <p className={styles.line}>
              {place === "application" ? NOTES_WORDS.hiddenBesideApplication(payload.hidden) : NOTES_WORDS.hiddenOnRun(payload.hidden)}
            </p>
          )}

          {isLead && !payload.forLeads ? (
            <p className={styles.line}>{NOTES_WORDS.leadNotYet(firstName)}</p>
          ) : payload.notes.length === 0 ? (
            <p className={styles.line}>{NOTES_WORDS.empty}</p>
          ) : (
            <ul className={styles.list}>
              {payload.notes.map((note) => {
                const editing = editingId === note.id;
                const mayChange = !isLead || note.mine;
                return (
                  <li key={note.id} className={`${styles.note} ${!isLead && note.beforeAgreement ? styles.before : ""}`}>
                    {!isLead && note.beforeAgreement && (
                      <p className={styles.warning}>
                        {note.programme ? NOTES_WORDS.beforeFrom(note.programme) : NOTES_WORDS.beforeNoProgramme}
                      </p>
                    )}
                    <div className={styles.byline}>
                      <span>
                        {note.mine ? NOTES_WORDS.you : NOTES_WORDS.by(note.authorName)}
                        {note.createdAt ? `, ${day(note.createdAt)}` : ""}
                        {note.edited && note.updatedAt ? `, ${NOTES_WORDS.edited(day(note.updatedAt))}` : ""}
                      </span>
                      <Chip tone="neutral" size="sm">
                        {NOTES_WORDS.audience[note.audience]}
                      </Chip>
                    </div>
                    {editing ? (
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
                        {isLead ? (
                          <p className={styles.line}>{NOTES_WORDS.leadsRead}</p>
                        ) : note.leadsMayRead ? (
                          <AudienceChoice name={`audience-${note.id}`} value={editAudience} onChange={setEditAudience} disabled={busy !== null} />
                        ) : (
                          <p className={styles.line}>{NOTES_WORDS.staysWithAdmins}</p>
                        )}
                        <SuggestChoice value={editSuggest} onChange={setEditSuggest} disabled={busy !== null} />
                        <div className={styles.row}>
                          <Button
                            type="button"
                            disabled={busy !== null || !editText.trim() || (!isLead && note.leadsMayRead && editAudience === null)}
                            onClick={() => void onSaveEdit(note)}
                          >
                            {busy === `edit:${note.id}` ? NOTES_WORDS.saving : NOTES_WORDS.save}
                          </Button>
                          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setEditingId(null)}>
                            {NOTES_WORDS.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <MemberText text={note.text} className={styles.text} />
                    )}
                    {!editing && (note.draftedByClaude || (note.programme && !note.beforeAgreement)) && (
                      <div className={styles.meta}>
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
                    )}
                    {!editing && note.suggest.length > 0 && <p className={styles.suggested}>{NOTES_WORDS.suggested(note.suggest)}</p>}
                    {!editing && mayChange && (
                      <div className={styles.row}>
                        <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => startEditing(note)}>
                          {NOTES_WORDS.edit}
                        </Button>
                        <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void onRemove(note.id)}>
                          {busy === `remove:${note.id}` ? NOTES_WORDS.saving : NOTES_WORDS.remove}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {mayAdd &&
            (composing ? (
              <div className={styles.compose}>
                {drafted && <p className={styles.drafted}>{DRAFT_WORDS.drafted}</p>}
                <label className={styles.label} htmlFor={`new-note-${uid}`}>
                  {NOTES_WORDS.label}
                </label>
                <CountedTextarea
                  id={`new-note-${uid}`}
                  value={draftText}
                  max={MEMBER_NOTE_LIMITS.text}
                  rows={6}
                  onChange={(event) => setDraftText(event.target.value)}
                />
                {isLead ? (
                  <p className={styles.line}>{NOTES_WORDS.leadsRead}</p>
                ) : payload.forLeads ? (
                  <AudienceChoice name={`audience-new-${uid}`} value={audience} onChange={setAudience} disabled={busy !== null} />
                ) : (
                  <p className={styles.line}>{NOTES_WORDS.adminsOnlyForNow(firstName)}</p>
                )}
                <SuggestChoice value={suggest} onChange={setSuggest} disabled={busy !== null} />
                {!isLead && runOfPlace === null && payload.runs.length > 0 && (
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
                  <Button type="button" disabled={busy !== null || !addReady} onClick={() => void onAdd()}>
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
            ))}

          {!isLead && draft !== "none" && !composing && (
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
    </Frame>
  );
}

/** "Who reads it": an admin's choice for every note, with nothing chosen for them. */
function AudienceChoice({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: NoteAudience | null;
  onChange: (next: NoteAudience) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.legend}>{NOTES_WORDS.chooseAudience}</legend>
      <div className={styles.options}>
        {NOTE_AUDIENCES.map((option) => (
          <OptionRow
            key={option}
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
            description={NOTES_WORDS.audienceHint[option]}
          >
            {NOTES_WORDS.audience[option]}
          </OptionRow>
        ))}
      </div>
    </fieldset>
  );
}

/** "Suggest for next term": three boxes, unticked until a person ticks one. */
function SuggestChoice({
  value,
  onChange,
  disabled,
}: {
  value: readonly NoteSuggestion[];
  onChange: (next: NoteSuggestion[]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.legend}>{NOTES_WORDS.suggestTitle}</legend>
      <div className={styles.suggestions}>
        {NOTE_SUGGESTIONS.map((key) => (
          <OptionRow
            key={key}
            plain
            checked={value.includes(key)}
            disabled={disabled}
            onChange={(event) => onChange(toggled(value, key, event.target.checked))}
          >
            {NOTES_WORDS.suggestion[key]}
          </OptionRow>
        ))}
      </div>
    </fieldset>
  );
}

/** "Draft a note with Claude", or the one sentence that says why it cannot. An admin's alone. */
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
