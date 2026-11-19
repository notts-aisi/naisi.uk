"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Textarea } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ABOUT_KEYS, NOTE_MAX_CHARS, isAboutKey, type AboutKey } from "@/lib/societyFeedback/model";
import { ALL_TAB, filterDays, type AdminView, type EntryView } from "@/lib/societyFeedback/view";
import { ABOUT_WORDS, ADMIN_WORDS } from "@/lib/societyFeedback/words";
import ClearOut from "./ClearOut";
import styles from "./societyFeedback.module.css";

/**
 * The admins' reading of anonymous feedback: the tabs by programme, the role
 * filter, the entries by day, and Dealt with and a note on each. Handed the
 * view the server built (`buildAdminView`) and nothing else: no entry's time,
 * no sender, and of the admins' own marks only whether it is dealt with and
 * the note's line. Every word is drawn as text, never as HTML, and no link in
 * it is made live.
 */
export default function AdminFeedback({ view, latestClearDay }: { view: AdminView; latestClearDay: string }) {
  const [tab, setTab] = useState(ALL_TAB);
  const [about, setAbout] = useState<AboutKey | "">("");
  const days = filterDays(view.days, tab, about);

  return (
    <div className={styles.admin}>
      <p className={styles.status}>{view.scopeLine}</p>
      {view.total === 0 ? (
        <p className={styles.empty}>{ADMIN_WORDS.none}</p>
      ) : (
        <>
          <div className={styles.filters}>
            <div className={styles.tabs} role="group" aria-label={ADMIN_WORDS.title}>
              {view.tabs.map((each) => (
                <button key={each.key} type="button" className={styles.tab} aria-pressed={tab === each.key} onClick={() => setTab(each.key)}>
                  <span>{each.label}</span>
                  <span className={styles.tabCount}>{each.count}</span>
                </button>
              ))}
            </div>
            <label className={styles.about}>
              <span className={styles.aboutLabel}>{ADMIN_WORDS.aboutLabel}</span>
              <Select value={about} onChange={(event) => setAbout(isAboutKey(event.target.value) ? event.target.value : "")}>
                <option value="">{ADMIN_WORDS.aboutAnyone}</option>
                {ABOUT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {ABOUT_WORDS[key]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className={styles.how}>{ADMIN_WORDS.howShown}</p>
          {days.length === 0 ? (
            <p className={styles.empty}>{ADMIN_WORDS.noneHere}</p>
          ) : (
            <ul className={styles.list}>
              {days.flatMap((day) => day.entries.map((entry) => <Entry key={entry.id} entry={entry} dayLabel={day.label} />))}
            </ul>
          )}
        </>
      )}
      <ClearOut latestDay={latestClearDay} oldestLine={view.oldestLine} dueLine={view.dueLine} />
    </div>
  );
}

function Entry({ entry, dayLabel }: { entry: EntryView; dayLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function send(body: Record<string, unknown> | null): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const address = `/api/admin/anonymous-feedback/${encodeURIComponent(entry.id)}`;
      const response = await fetch(
        address,
        body === null ? { method: "DELETE" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? ADMIN_WORDS.failed);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(ADMIN_WORDS.failed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const noteId = `note-${entry.id}`;
  return (
    <li className={styles.entry}>
      <div className={styles.meta}>
        <span className={styles.metaDay}>{dayLabel}</span>
        <span>{entry.programmeLabel}</span>
        {entry.weekLabel && <span>{entry.weekLabel}</span>}
        {entry.aboutLabel && <span>{entry.aboutLabel}</span>}
        {entry.dealtWith && <span className={styles.tag}>{ADMIN_WORDS.dealtWith}</span>}
      </div>
      <p className={styles.words}>“{entry.words}”</p>
      {entry.noteLine && <p className={styles.noteLine}>{entry.noteLine}</p>}
      {writing ? (
        <div className={styles.field}>
          <label htmlFor={noteId} className={styles.label}>
            {ADMIN_WORDS.noteLabel}
          </label>
          <Textarea id={noteId} rows={3} maxLength={NOTE_MAX_CHARS} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.small}
              disabled={busy || note.trim() === ""}
              onClick={async () => {
                if (await send({ action: "note", text: note })) {
                  setWriting(false);
                  setNote("");
                }
              }}
            >
              {busy ? ADMIN_WORDS.saving : ADMIN_WORDS.saveNote}
            </button>
            <button type="button" className={styles.small} disabled={busy} onClick={() => setWriting(false)}>
              {ADMIN_WORDS.cancel}
            </button>
          </div>
        </div>
      ) : (
        (!entry.dealtWith || !entry.noteLine) && (
          <div className={styles.actions}>
            {!entry.dealtWith && (
              <button type="button" className={styles.small} disabled={busy} onClick={() => void send({ action: "dealtWith" })}>
                {ADMIN_WORDS.dealtWith}
              </button>
            )}
            {!entry.noteLine && (
              <button type="button" className={styles.small} disabled={busy} onClick={() => setWriting(true)}>
                {ADMIN_WORDS.addNote}
              </button>
            )}
          </div>
        )
      )}
      {confirming ? (
        <div className={styles.field} role="alert">
          <p className={styles.status}>{ADMIN_WORDS.deleteConfirm}</p>
          <div className={styles.actions}>
            <button type="button" className={`${styles.small} ${styles.danger}`} disabled={busy} onClick={() => void send(null)}>
              {busy ? ADMIN_WORDS.deleting : ADMIN_WORDS.deleteYes}
            </button>
            <button type="button" className={styles.small} disabled={busy} onClick={() => setConfirming(false)}>
              {ADMIN_WORDS.deleteNo}
            </button>
          </div>
        </div>
      ) : (
        !writing && (
          <div className={styles.actions}>
            <button type="button" className={`${styles.small} ${styles.danger}`} disabled={busy} onClick={() => setConfirming(true)}>
              {ADMIN_WORDS.deleteEntry}
            </button>
          </div>
        )
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
