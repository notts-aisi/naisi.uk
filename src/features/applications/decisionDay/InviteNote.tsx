"use client";

import { useState } from "react";
import CountedTextarea from "@/components/ui/CountedTextarea";
import kit from "@/features/applications/kit/kit.module.css";
import { APPLICATION_LIMITS } from "@/lib/applications/model";
import type { PoolBoard as Board, PoolRow } from "@/lib/applications/decisionDay/views";
import shared from "./decisionDay.module.css";
import styles from "./InviteNote.module.css";

/**
 * THE PERSONAL NOTE IN ONE POOLED APPLICANT'S INVITATION, under their row on
 * Pooled applicants.
 *
 * A few sentences of the admin's own on why the programme suits them, which
 * go in the invitation email under its first paragraph. Claude can draft
 * them from the person's answers; the draft is shown in the box, marked as
 * Claude's, and is never sent. Only Save puts words in the email, as the
 * admin's. "See the email" shows the invitation as it would go now, with the
 * note as saved.
 *
 * Nothing here tells the applicant anything: they hear on decision day.
 */

const LIMIT = APPLICATION_LIMITS.inviteNote;

type Props = {
  roundId: string;
  row: PoolRow;
  /** Short name of the programme they are invited to. */
  programme: string;
  claudeConfigured: boolean;
  /** True when nothing may change: the page is not live yet, or they have been told. */
  locked: boolean;
  /** True while "Draft the rest" is drafting this person's note. */
  drafting: boolean;
  onBoard: (board: Board) => void;
};

type Answer = { board?: Board; error?: string } | null;

export default function InviteNote({ roundId, row, programme, claudeConfigured, locked, drafting, onBoard }: Props) {
  const saved = row.note;
  const draft = row.draft;
  // What the box starts from: the note as saved, else Claude's draft.
  const base = saved?.text ?? draft?.text ?? "";
  const [seenBase, setSeenBase] = useState(base);
  const [text, setText] = useState(base);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"saving" | "drafting" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  // New words from the page (a save, a draft from "Draft the rest") replace
  // what the box holds, unless the admin has typed in it since.
  if (base !== seenBase) {
    setSeenBase(base);
    if (text === seenBase) setText(base);
  }

  const working = busy !== null || drafting;
  const disabled = locked || working;
  const changed = text.trim() !== (saved?.text ?? "");
  const showingDraft = draft !== null && text === draft.text && text !== (saved?.text ?? "");
  // Once nothing may change, the note is only shown.
  const editing = !locked && (saved ? open : open || draft !== null || text !== "");

  async function send(method: "PUT" | "POST", body: Record<string, unknown>): Promise<Answer> {
    setProblem(null);
    try {
      const response = await fetch(`/api/admissions/forms/${encodeURIComponent(roundId)}/pool/note`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => null)) as Answer;
      if (!response.ok || !answer?.board) {
        setProblem(answer?.error ?? (method === "POST" ? "Could not draft that note. Try again." : "Could not save that note. Try again."));
        return null;
      }
      return answer;
    } catch {
      setProblem("Could not reach the site. Check your connection and try again.");
      return null;
    }
  }

  async function save(note: string) {
    setBusy("saving");
    const answer = await send("PUT", { uid: row.uid, note });
    setBusy(null);
    if (!answer?.board) return;
    const next = answer.board.rows.find((each) => each.uid === row.uid);
    const words = next?.note?.text ?? next?.draft?.text ?? "";
    setSeenBase(words);
    setText(words);
    setOpen(false);
    onBoard(answer.board);
  }

  async function askClaude() {
    setBusy("drafting");
    const answer = await send("POST", { uid: row.uid });
    setBusy(null);
    if (!answer?.board) return;
    const next = answer.board.rows.find((each) => each.uid === row.uid);
    // Asked for, so the draft goes in the box whatever was there.
    if (next?.draft) setText(next.draft.text);
    setSeenBase(next?.note?.text ?? next?.draft?.text ?? "");
    setOpen(true);
    onBoard(answer.board);
  }

  const claudeButton = claudeConfigured ? (
    <button type="button" className={shared.quiet} disabled={disabled} onClick={() => void askClaude()}>
      {busy === "drafting" || drafting ? "Claude is drafting…" : draft || saved ? "Draft again with Claude" : "Draft with Claude"}
    </button>
  ) : null;

  return (
    <div className={styles.note}>
      <div className={styles.head}>
        <span className={`${kit.mono} ${styles.label}`}>Personal note · invitation to {programme}</span>
        {saved ? <span className={styles.saved}>Saved{saved.by ? ` by ${saved.by}` : ""}. It goes in their email.</span> : null}
      </div>

      {saved && !editing ? (
        <>
          <p className={styles.text}>{saved.text}</p>
          {!locked ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={shared.quiet}
                disabled={disabled}
                onClick={() => {
                  setText(saved.text);
                  setOpen(true);
                }}
              >
                Edit
              </button>
              {claudeButton}
            </div>
          ) : null}
        </>
      ) : null}

      {!saved && !editing ? (
        <>
          <p className={styles.none}>
            {locked ? "No personal note." : "No personal note. The invitation goes with the standard words."}
          </p>
          {!locked ? (
            <div className={styles.actions}>
              <button type="button" className={shared.quiet} disabled={disabled} onClick={() => setOpen(true)}>
                Write a note
              </button>
              {claudeButton}
            </div>
          ) : null}
        </>
      ) : null}

      {editing ? (
        <>
          {showingDraft ? (
            <p className={styles.hint}>
              Claude’s draft, from their answers. It isn’t sent unless you save it.
              {draft?.basis ? <span className={styles.basis}> Drawn from: {draft.basis}</span> : null}
            </p>
          ) : null}
          <CountedTextarea
            aria-label={`Personal note for ${row.name}`}
            value={text}
            max={LIMIT}
            rows={4}
            disabled={disabled}
            placeholder={`A few sentences on why the ${programme} suits them. It goes under the invitation’s first paragraph.`}
            onChange={(event) => setText(event.target.value)}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={shared.secondary}
              disabled={disabled || !changed || !text.trim()}
              onClick={() => void save(text)}
            >
              {busy === "saving" ? "Saving…" : "Save note"}
            </button>
            {claudeButton}
            {saved ? (
              <>
                <button
                  type="button"
                  className={shared.quiet}
                  disabled={disabled}
                  onClick={() => {
                    setText(saved.text);
                    setSeenBase(saved.text);
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button type="button" className={shared.quiet} disabled={disabled} onClick={() => void save("")}>
                  Take the note off
                </button>
              </>
            ) : !draft ? (
              <button
                type="button"
                className={shared.quiet}
                disabled={disabled}
                onClick={() => {
                  setText("");
                  setOpen(false);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {problem ? (
        <p className={shared.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {row.email ? (
        <div className={styles.emailBlock}>
          <button
            type="button"
            className={shared.quiet}
            aria-expanded={showEmail}
            onClick={() => setShowEmail((was) => !was)}
          >
            {showEmail ? "Hide the email" : "See the email"}
          </button>
          {showEmail ? (
            <div className={styles.letter}>
              <p className={styles.letterSubject}>{row.email.subject}</p>
              <p className={styles.letterText}>{row.email.greeting}</p>
              {row.email.paragraphs.map((paragraph, at) => (
                <p key={at} className={styles.letterText}>
                  {paragraph}
                </p>
              ))}
              <p className={styles.letterText}>
                {row.email.buttons.map((button) => `[${button.label}]`).join("  ")}
              </p>
              <p className={styles.letterSign}>
                {row.email.signOff.name}
                {row.email.signOff.role ? (
                  <>
                    <br />
                    <span className={styles.letterRole}>{row.email.signOff.role}</span>
                  </>
                ) : null}
              </p>
              {changed && !locked ? (
                <p className={styles.hint}>This is the note as saved. Save to see your changes here.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
